import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Play } from "lucide-react";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background */}
      <div className="absolute inset-0 gradient-hero">
        <div 
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
      </div>

      {/* Content */}
      <div className="container relative z-10 px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-8 animate-fade-in">
            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Trusted by 500+ Energy Companies Worldwide</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
              The Future of{" "}
              <span className="gradient-accent bg-clip-text text-transparent">
                Petroleum Distribution
              </span>
              {" "}Management
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Streamline operations, optimize delivery routes, and maximize profitability with AI-powered insights. 
              Built for enterprises managing complex petroleum logistics.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Button size="xl" variant="hero" onClick={() => window.location.href = '/auth'}>
                Start Free 14-Day Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="xl" variant="outline" className="group">
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-smooth" />
                Watch Demo
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>Free migration support</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>24/7 enterprise support</span>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-20 max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-bold text-accent">99.9%</div>
              <div className="text-sm text-muted-foreground">System Uptime</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-bold text-accent">500+</div>
              <div className="text-sm text-muted-foreground">Enterprise Clients</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-bold text-accent">2M+</div>
              <div className="text-sm text-muted-foreground">Deliveries/Month</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-bold text-accent">35%</div>
              <div className="text-sm text-muted-foreground">Cost Reduction</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
