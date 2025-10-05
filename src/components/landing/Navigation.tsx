import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

const Navigation = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            <span className="text-xl font-bold">PetroFlow</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">
              Features
            </a>
            <a href="#solutions" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">
              Solutions
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">
              Pricing
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => window.location.href = '/auth'}>
              Sign In
            </Button>
            <Button variant="hero" onClick={() => window.location.href = '/auth'}>
              Start Free Trial
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
