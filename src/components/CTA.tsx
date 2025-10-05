import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      
      <div className="container relative z-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold">
            Ready to Transform Your{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Operations?
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join hundreds of enterprises already using PetroFlow to optimize their petroleum distribution networks.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button size="xl" variant="hero" onClick={() => window.location.href = '/auth'}>
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="xl" variant="ghost" className="text-foreground hover:text-accent">
              Contact Sales
            </Button>
          </div>

          <p className="text-sm text-muted-foreground pt-4">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTA;
