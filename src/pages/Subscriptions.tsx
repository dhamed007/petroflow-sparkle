import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Crown, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { type Currency, USD_PRICES, annualSavingsPct } from "@/config/pricing";

const Subscriptions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<Currency>(
    () => (localStorage.getItem('pf_currency') as Currency) ?? 'NGN'
  );

  const handleCurrencyChange = (c: Currency) => {
    setCurrency(c);
    localStorage.setItem('pf_currency', c);
  };

  const getPlanPrice = (plan: any, billingCycle: 'monthly' | 'annual') => {
    if (currency === 'USD') {
      const tier = plan.tier as keyof typeof USD_PRICES;
      if (!(tier in USD_PRICES)) return null;
      return billingCycle === 'monthly' ? USD_PRICES[tier].monthly : USD_PRICES[tier].annual;
    }
    return billingCycle === 'monthly' ? plan.price_monthly : plan.price_annual;
  };

  const formatMonthlyPrice = (plan: any) => {
    if (currency === 'USD') {
      const tier = plan.tier as keyof typeof USD_PRICES;
      if (!(tier in USD_PRICES)) return 'Custom';
      return `$${USD_PRICES[tier].monthly}`;
    }
    return `₦${(plan.price_monthly / 1000).toFixed(0)}k`;
  };

  const formatAnnualLabel = (plan: any) => {
    if (currency === 'USD') {
      const tier = plan.tier as keyof typeof USD_PRICES;
      if (!(tier in USD_PRICES)) return '';
      const { monthly, annual } = USD_PRICES[tier];
      return `or $${annual}/year (Save ${annualSavingsPct(monthly, annual)}%)`;
    }
    return `or ₦${(plan.price_annual / 1000).toFixed(0)}k/year (Save ${Math.round(((plan.price_monthly * 12 - plan.price_annual) / (plan.price_monthly * 12)) * 100)}%)`;
  };

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchData();
    
    // Check for payment verification on redirect
    const urlParams = new URLSearchParams(window.location.search);
    const shouldVerify = urlParams.get('verify');
    const reference = urlParams.get('reference');
    
    if (shouldVerify === 'true' && reference) {
      verifyPayment(reference);
    }
  }, [user, navigate]);

  const verifyPayment = async (reference: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { reference, gateway_type: 'paystack' }
      });

      if (error) throw error;

      if (data?.status === 'success') {
        toast({ 
          title: "Payment Successful!", 
          description: "Your subscription has been activated" 
        });
        // Clear URL params and refresh data
        window.history.replaceState({}, '', '/subscriptions');
        fetchData();
      } else {
        toast({ 
          title: "Payment Failed", 
          description: "Please try again or contact support",
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error('Payment verification error:', error);
      toast({ 
        title: "Verification Error", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const fetchData = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) return;

      const [plansData, subscriptionData] = await Promise.all([
        supabase.from('subscription_plans').select('*').order('price_monthly'),
        supabase.from('tenant_subscriptions').select('*, subscription_plans(*)').eq('tenant_id', profile.tenant_id).single()
      ]);

      if (plansData.data) setPlans(plansData.data);
      if (subscriptionData.data) setCurrentSubscription(subscriptionData.data);
    } catch (error: any) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string, billingCycle: 'monthly' | 'annual') => {
    try {
      // Get user's tenant and profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, email')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) {
        toast({ title: "Error", description: "No tenant found", variant: "destructive" });
        return;
      }

      // Get the plan details
      const plan = plans.find(p => p.id === planId);
      if (!plan) {
        toast({ title: "Error", description: "Plan not found", variant: "destructive" });
        return;
      }

      // Subscription payments go through VisionsEdge's Paystack (app-level)
      // No need to check tenant's payment gateway configuration

      // Calculate amount based on billing cycle and selected currency
      const amount = getPlanPrice(plan, billingCycle);
      if (amount === null) {
        toast({ title: "Error", description: "Pricing not available for this plan in the selected currency", variant: "destructive" });
        return;
      }

      // Generate unique reference
      const reference = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "Please login again", variant: "destructive" });
        navigate('/auth');
        return;
      }

      // Call payment processing function
      const { data, error } = await supabase.functions.invoke('process-payment', {
        body: {
          amount,
          currency,
          email: profile.email,
          reference,
          gateway_type: 'paystack',
          metadata: {
            plan_id: planId,
            billing_cycle: billingCycle,
            tenant_id: profile.tenant_id,
            subscription_type: 'petroflow_saas',
            payment_level: 'app', // Indicates this is app-level payment (VisionsEdge)
            redirect_url: `${window.location.origin}/subscriptions?verify=true&reference=${reference}`
          }
        }
      });

      if (error) {
        toast({ title: "Payment Error", description: error.message, variant: "destructive" });
        return;
      }

      // Redirect to Paystack payment page — validate URL before navigating
      const authUrl: string = data?.data?.authorization_url ?? '';
      const isValidPaystackUrl =
        authUrl.startsWith('https://checkout.paystack.com/') ||
        authUrl.startsWith('https://standard.paystack.co/');
      if (isValidPaystackUrl) {
        window.location.href = authUrl;
      } else {
        toast({ title: "Error", description: "Failed to initialize payment", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getTierIcon = (tier: string) => {
    const icons = {
      starter: <Zap className="w-6 h-6" />,
      business: <Crown className="w-6 h-6" />,
      enterprise: <Crown className="w-6 h-6 text-yellow-500" />,
    };
    return icons[tier as keyof typeof icons];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading subscriptions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Choose Your Plan</h1>
          <p className="text-muted-foreground mb-4">Select the perfect plan for your business needs</p>
          <div className="inline-flex rounded-lg border p-1 gap-1">
            <Button
              size="sm"
              variant={currency === 'NGN' ? 'default' : 'ghost'}
              onClick={() => handleCurrencyChange('NGN')}
            >
              ₦ NGN
            </Button>
            <Button
              size="sm"
              variant={currency === 'USD' ? 'default' : 'ghost'}
              onClick={() => handleCurrencyChange('USD')}
            >
              $ USD
            </Button>
          </div>
        </div>

        {currentSubscription && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Current Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{currentSubscription.subscription_plans?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Status: <Badge variant={currentSubscription.status === 'active' ? 'default' : 'secondary'}>
                      {currentSubscription.status}
                    </Badge>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Period: {new Date(currentSubscription.current_period_start).toLocaleDateString()} - {new Date(currentSubscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card key={plan.id} className={`relative hover:shadow-xl transition-shadow ${plan.tier === 'business' ? 'border-primary' : ''}`}>
              {plan.tier === 'business' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  {getTierIcon(plan.tier)}
                  <Badge variant="outline" className="capitalize">{plan.tier}</Badge>
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold">{formatMonthlyPrice(plan)}</span>
                  <span className="text-muted-foreground">/month</span>
                </CardDescription>
                <p className="text-sm text-muted-foreground">
                  {formatAnnualLabel(plan)}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-6">
                  {Array.isArray(plan.features) && plan.features.map((feature: string, index: number) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    variant={plan.tier === 'business' ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(plan.id, 'monthly')}
                  >
                    Subscribe Monthly
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => handleSubscribe(plan.id, 'annual')}
                  >
                    Subscribe Annually
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Enterprise Custom Solutions</CardTitle>
            <CardDescription>
              Need a custom solution? Contact us for enterprise pricing and features tailored to your specific requirements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Contact Sales</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Subscriptions;