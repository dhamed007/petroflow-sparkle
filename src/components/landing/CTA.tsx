import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      
      <div className="container relative z-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/20 border border-accent/30 text-sm font-medium text-accent mb-4">
            Get Started Today
          </div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold">
            Ready to Transform Your{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Logistics Operations?
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join leading petroleum companies who trust PetroFlow for their supply chain management.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button size="xl" variant="hero" onClick={() => window.location.href = '/auth'}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button 
              size="xl" 
              variant="ghost" 
              className="text-foreground hover:text-accent border border-border/50 hover:border-accent/50"
            >
              Schedule Demo
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>Free migration support</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
