import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Activity, 
  BarChart3, 
  Shield, 
  Zap, 
  Globe, 
  Clock,
  Truck,
  Database,
  Users
} from "lucide-react";

const features = [
  {
    icon: Activity,
    title: "Real-Time Fleet Monitoring",
    description: "Track every vehicle, monitor fuel levels, and get instant alerts on anomalies. GPS-enabled tracking with 99.9% accuracy.",
  },
  {
    icon: Truck,
    title: "Smart Route Optimization",
    description: "AI-powered algorithms reduce fuel costs by up to 30% and delivery times by 25% through intelligent routing.",
  },
  {
    icon: BarChart3,
    title: "Predictive Analytics",
    description: "Forecast demand, prevent stockouts, and optimize inventory with machine learning models trained on industry data.",
  },
  {
    icon: Database,
    title: "ERP Integration",
    description: "Seamless connectivity with SAP, Oracle, Dynamics, and Odoo. Bi-directional sync with real-time data exchange.",
  },
  {
    icon: Shield,
    title: "Enterprise-Grade Security",
    description: "SOC 2 Type II certified, GDPR compliant, with role-based access control and comprehensive audit trails.",
  },
  {
    icon: Users,
    title: "Multi-Tenant Architecture",
    description: "Manage multiple companies, sites, and teams with complete data isolation and customizable branding per tenant.",
  },
  {
    icon: Zap,
    title: "Automated Workflows",
    description: "Eliminate manual processes with smart automation for order creation, dispatch, invoicing, and compliance reporting.",
  },
  {
    icon: Globe,
    title: "Global Scale",
    description: "Built on AWS infrastructure supporting operations in 50+ countries with localized compliance and multi-currency support.",
  },
  {
    icon: Clock,
    title: "Historical Intelligence",
    description: "Access 7+ years of data with advanced querying, trend analysis, and regulatory reporting tools at your fingertips.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16 animate-fade-in">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Platform Features
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Everything You Need for{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Modern Petroleum Logistics
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Purpose-built for the complexities of petroleum distribution with enterprise-grade reliability
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card 
                key={index} 
                className="shadow-elevated hover:shadow-glow transition-smooth border-border/50 hover:border-accent/30 group animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-smooth shadow-glow">
                    <Icon className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
