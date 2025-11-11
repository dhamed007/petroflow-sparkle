import { Card } from "@/components/ui/card";
import { Activity, TrendingUp, MapPin } from "lucide-react";

const LiveDashboard = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Live Dashboard
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Real-time Visibility{" "}
            <span className="text-accent">
              Into Your Operations
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Monitor your entire fleet, track deliveries, and gain insights with our comprehensive dashboard designed for petroleum logistics.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <Card className="p-8 shadow-elevated border-border/50">
            <div className="grid md:grid-cols-3 gap-8 mb-8">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <MapPin className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium text-muted-foreground">Live GPS tracking for all vehicles</span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium text-muted-foreground">Real-time analytics and reporting</span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Activity className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium text-muted-foreground">Inventory and fuel level monitoring</span>
                </div>
              </div>
            </div>
            
            <div className="rounded-lg bg-muted/50 border border-border/50 p-12 text-center">
              <p className="text-muted-foreground font-medium">PetroFlow Dashboard</p>
              <p className="text-sm text-muted-foreground/70 mt-2">Interactive dashboard preview</p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default LiveDashboard;
