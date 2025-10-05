import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BarChart3, Shield, Zap, Globe, Clock } from "lucide-react";

const features = [
  {
    icon: Activity,
    title: "Real-Time Monitoring",
    description: "Track petroleum flow rates, pressure levels, and distribution metrics in real-time across your entire network.",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Leverage AI-powered insights to optimize operations, predict maintenance needs, and reduce operational costs.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-level encryption, compliance certifications, and robust access controls to protect your critical data.",
  },
  {
    icon: Zap,
    title: "Instant Alerts",
    description: "Get notified immediately of anomalies, leaks, or system issues with intelligent alerting and automated responses.",
  },
  {
    icon: Globe,
    title: "Multi-Site Management",
    description: "Manage multiple facilities, pipelines, and distribution centers from a single unified dashboard.",
  },
  {
    icon: Clock,
    title: "Historical Data",
    description: "Access years of historical data with powerful querying tools for trend analysis and regulatory reporting.",
  },
];

const Features = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">
            Everything You Need to{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Optimize Operations
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Comprehensive tools for modern petroleum flow management
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card 
                key={index} 
                className="shadow-elevated hover:shadow-glow transition-smooth border-border/50 hover:border-accent/50"
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mb-4">
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
