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
    title: "Real-time Tracking",
    description: "Track your deliveries and fleet in real-time with GPS integration",
  },
  {
    icon: Database,
    title: "Product Management",
    description: "Manage petroleum products including diesel, petrol, and kerosene",
  },
  {
    icon: Users,
    title: "Multi-role Access",
    description: "Separate portals for clients, administrators, and drivers",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Comprehensive analytics and reporting for business insights",
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with role-based access control",
  },
  {
    icon: Clock,
    title: "24/7 Operations",
    description: "Round-the-clock support for your logistics operations",
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
              Petroleum Logistics
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            From order placement to delivery tracking, PetroFlow handles every aspect of your petroleum supply chain.
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
