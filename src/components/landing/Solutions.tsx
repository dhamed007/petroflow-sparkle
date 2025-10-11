import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Shield, Truck } from "lucide-react";

const portals = [
  {
    icon: Users,
    title: "Client Portal",
    description: "Place orders, track deliveries, and manage your petroleum supply chain",
    features: ["Browse Products", "Place Orders", "Track Deliveries", "Order History"]
  },
  {
    icon: Shield,
    title: "Admin Portal",
    description: "Comprehensive management dashboard for logistics operations",
    features: ["Manage Orders", "Fleet Management", "Driver Assignment", "Analytics"]
  },
  {
    icon: Truck,
    title: "Driver Portal",
    description: "Mobile-friendly interface for delivery personnel",
    features: ["View Assignments", "Update Status", "GPS Tracking", "Delivery Logs"]
  },
];

const Solutions = () => {
  return (
    <section id="solutions" className="py-24 bg-muted/30">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Access Portals
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Choose Your{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Access Portal
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Each portal is designed specifically for your role in the petroleum supply chain.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {portals.map((portal, index) => {
            const Icon = portal.icon;
            return (
              <Card 
                key={index}
                className="shadow-elevated hover:shadow-glow transition-smooth border-border/50 hover:border-accent/30 group"
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-smooth">
                    <Icon className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-xl mb-2">{portal.title}</CardTitle>
                  <p className="text-muted-foreground text-sm">{portal.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {portal.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button 
                    className="w-full mt-4" 
                    variant="outline"
                    onClick={() => window.location.href = '/auth'}
                  >
                    Access Portal
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Solutions;
