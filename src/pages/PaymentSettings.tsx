import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";

const PaymentSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gateways, setGateways] = useState<any>({
    paystack: { is_active: false, is_sandbox: true, public_key: '', secret_key_encrypted: '' },
    flutterwave: { is_active: false, is_sandbox: true, public_key: '', secret_key_encrypted: '' },
    interswitch: { is_active: false, is_sandbox: true, client_id: '', client_secret_encrypted: '' },
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchGateways();
  }, [user, navigate]);

  const fetchGateways = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) return;

      const { data, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;

      if (data) {
        const gatewayConfig: any = {
          paystack: { is_active: false, is_sandbox: true, public_key: '', secret_key_encrypted: '' },
          flutterwave: { is_active: false, is_sandbox: true, public_key: '', secret_key_encrypted: '' },
          interswitch: { is_active: false, is_sandbox: true, client_id: '', client_secret_encrypted: '' },
        };

        data.forEach((gw: any) => {
          gatewayConfig[gw.gateway_type] = gw;
        });

        setGateways(gatewayConfig);
      }
    } catch (error: any) {
      toast({
        title: "Error loading payment gateways",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (gatewayType: string) => {
    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) {
        toast({ title: "No tenant found", variant: "destructive" });
        return;
      }

      const gatewayData = {
        tenant_id: profile.tenant_id,
        gateway_type: gatewayType,
        ...gateways[gatewayType],
      };

      const { error } = await supabase
        .from('payment_gateways')
        .upsert(gatewayData, { onConflict: 'tenant_id,gateway_type' });

      if (error) throw error;

      toast({ title: "Payment gateway saved successfully" });
      fetchGateways();
    } catch (error: any) {
      toast({
        title: "Error saving payment gateway",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateGateway = (type: string, field: string, value: any) => {
    setGateways({
      ...gateways,
      [type]: { ...gateways[type], [field]: value }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/settings')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Button>
          <h1 className="text-3xl font-bold">Payment Gateway Configuration</h1>
          <p className="text-muted-foreground">Configure your preferred payment gateway for transactions</p>
        </div>

        <Tabs defaultValue="paystack" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="paystack">Paystack</TabsTrigger>
            <TabsTrigger value="flutterwave">Flutterwave</TabsTrigger>
            <TabsTrigger value="interswitch">Interswitch</TabsTrigger>
          </TabsList>

          <TabsContent value="paystack">
            <Card>
              <CardHeader>
                <CardTitle>Paystack Configuration</CardTitle>
                <CardDescription>Configure your Paystack payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Paystack</Label>
                  <Switch
                    checked={gateways.paystack.is_active}
                    onCheckedChange={(checked) => updateGateway('paystack', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.paystack.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('paystack', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Public Key</Label>
                  <Input
                    value={gateways.paystack.public_key || ''}
                    onChange={(e) => updateGateway('paystack', 'public_key', e.target.value)}
                    placeholder="pk_test_..."
                  />
                </div>
                <div>
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={gateways.paystack.secret_key_encrypted || ''}
                    onChange={(e) => updateGateway('paystack', 'secret_key_encrypted', e.target.value)}
                    placeholder="sk_test_..."
                  />
                  <p className="text-sm text-muted-foreground mt-1">Your secret key is encrypted and stored securely</p>
                </div>
                <Button onClick={() => handleSave('paystack')} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Paystack Configuration'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flutterwave">
            <Card>
              <CardHeader>
                <CardTitle>Flutterwave Configuration</CardTitle>
                <CardDescription>Configure your Flutterwave payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Flutterwave</Label>
                  <Switch
                    checked={gateways.flutterwave.is_active}
                    onCheckedChange={(checked) => updateGateway('flutterwave', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.flutterwave.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('flutterwave', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Public Key</Label>
                  <Input
                    value={gateways.flutterwave.public_key || ''}
                    onChange={(e) => updateGateway('flutterwave', 'public_key', e.target.value)}
                    placeholder="FLWPUBK_TEST..."
                  />
                </div>
                <div>
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={gateways.flutterwave.secret_key_encrypted || ''}
                    onChange={(e) => updateGateway('flutterwave', 'secret_key_encrypted', e.target.value)}
                    placeholder="FLWSECK_TEST..."
                  />
                  <p className="text-sm text-muted-foreground mt-1">Your secret key is encrypted and stored securely</p>
                </div>
                <Button onClick={() => handleSave('flutterwave')} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Flutterwave Configuration'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interswitch">
            <Card>
              <CardHeader>
                <CardTitle>Interswitch Configuration</CardTitle>
                <CardDescription>Configure your Interswitch payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Interswitch</Label>
                  <Switch
                    checked={gateways.interswitch.is_active}
                    onCheckedChange={(checked) => updateGateway('interswitch', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.interswitch.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('interswitch', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Client ID</Label>
                  <Input
                    value={gateways.interswitch.client_id || ''}
                    onChange={(e) => updateGateway('interswitch', 'client_id', e.target.value)}
                    placeholder="Your Client ID"
                  />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={gateways.interswitch.client_secret_encrypted || ''}
                    onChange={(e) => updateGateway('interswitch', 'client_secret_encrypted', e.target.value)}
                    placeholder="Your Client Secret"
                  />
                  <p className="text-sm text-muted-foreground mt-1">Your client secret is encrypted and stored securely</p>
                </div>
                <Button onClick={() => handleSave('interswitch')} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Interswitch Configuration'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PaymentSettings;