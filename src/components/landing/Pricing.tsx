import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Building2, Rocket } from "lucide-react";

const plans = [
  {
    name: "Starter",
    icon: Zap,
    price: "₦50,000",
    period: "/month",
    annualPrice: "₦500,000",
    annualSavings: "Save ₦100,000/year",
    description: "Perfect for small businesses getting started with logistics management",
    features: [
      "Up to 5 users",
      "10 vehicles tracking",
      "1,000 orders/month",
      "Basic analytics",
      "Email support",
      "Mobile app access",
    ],
    popular: false,
  },
  {
    name: "Business",
    icon: Building2,
    price: "₦150,000",
    period: "/month",
    annualPrice: "₦1,500,000",
    annualSavings: "Save ₦300,000/year",
    description: "Ideal for growing companies with expanding logistics operations",
    features: [
      "Up to 25 users",
      "50 vehicles tracking",
      "10,000 orders/month",
      "Advanced analytics & reports",
      "Priority support",
      "ERP integrations",
      "Custom branding",
      "API access",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    icon: Rocket,
    price: "Custom",
    period: "",
    annualPrice: "Contact us",
    annualSavings: "Volume discounts available",
    description: "For large organizations with complex logistics requirements",
    features: [
      "Unlimited users",
      "Unlimited vehicles",
      "Unlimited orders",
      "Real-time analytics",
      "24/7 dedicated support",
      "Custom integrations",
      "On-premise option",
      "SLA guarantees",
      "Training & onboarding",
    ],
    popular: false,
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Pricing Plans
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Simple, Transparent{" "}
            <span className="text-accent">
              Pricing
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Choose the plan that fits your business. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <Card 
                key={index}
                className={`relative shadow-elevated hover:shadow-glow transition-smooth border-border/50 hover:border-accent/30 ${
                  plan.popular ? 'border-accent ring-2 ring-accent/20' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-4 shadow-glow">
                    <Icon className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        or {plan.annualPrice}/year
                      </p>
                      <p className="text-xs text-accent font-medium">
                        {plan.annualSavings}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-sm">
                        <Check className="w-4 h-4 text-accent flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => window.location.href = '/auth'}
                  >
                    {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-12 text-muted-foreground">
          <p className="text-sm">
            All prices are in Nigerian Naira (₦). VAT may apply. Need a custom solution?{" "}
            <a href="#" className="text-accent hover:underline">Contact our sales team</a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
