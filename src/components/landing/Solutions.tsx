import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Factory, Ship, Fuel } from "lucide-react";

const solutions = [
  {
    icon: Building2,
    title: "Distribution Companies",
    description: "Manage complex multi-depot operations with centralized oversight and local autonomy.",
    benefits: ["Route optimization", "Fleet management", "Customer portals"]
  },
  {
    icon: Factory,
    title: "Refineries & Terminals",
    description: "Track inventory movements, optimize loading schedules, and ensure compliance.",
    benefits: ["Inventory tracking", "Scheduling", "Compliance reporting"]
  },
  {
    icon: Ship,
    title: "Marine Logistics",
    description: "Coordinate vessel deliveries, monitor bunker operations, and manage documentation.",
    benefits: ["Vessel tracking", "Bunker management", "Documentation"]
  },
  {
    icon: Fuel,
    title: "Fuel Retailers",
    description: "Connect stations to distribution networks with automated ordering and delivery tracking.",
    benefits: ["Auto-ordering", "Delivery tracking", "POS integration"]
  },
];

const Solutions = () => {
  return (
    <section id="solutions" className="py-24 bg-muted/30">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Industry Solutions
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Built for Every{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Petroleum Business
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Tailored workflows for each segment of the petroleum supply chain
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {solutions.map((solution, index) => {
            const Icon = solution.icon;
            return (
              <Card 
                key={index}
                className="shadow-elevated hover:shadow-glow transition-smooth border-border/50 hover:border-accent/30 group"
              >
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-smooth">
                      <Icon className="w-6 h-6 text-accent-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{solution.title}</CardTitle>
                      <p className="text-muted-foreground">{solution.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {solution.benefits.map((benefit, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
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
