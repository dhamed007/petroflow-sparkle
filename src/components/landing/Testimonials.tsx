import { Card, CardContent } from "@/components/ui/card";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote: "PetroFlow reduced our operational costs by 35% in the first year. The ROI was clear within 3 months.",
    author: "Michael Chen",
    role: "COO, Global Petroleum Distribution",
    company: "Fortune 500 Energy Company"
  },
  {
    quote: "The ERP integration was seamless. We had SAP connected and data flowing in under 2 weeks.",
    author: "Sarah Johnson",
    role: "IT Director",
    company: "Regional Fuel Distributor"
  },
  {
    quote: "Real-time visibility into our 200+ vehicle fleet transformed how we operate. Game changer.",
    author: "David Rodriguez",
    role: "Fleet Manager",
    company: "Multi-State Logistics Provider"
  },
];

const Testimonials = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-block px-4 py-1 rounded-full bg-accent/10 border border-accent/20 text-sm font-medium text-accent mb-4">
            Customer Success
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Trusted by Industry{" "}
            <span className="gradient-accent bg-clip-text text-transparent">
              Leaders
            </span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              className="shadow-elevated hover:shadow-glow transition-smooth border-border/50"
            >
              <CardContent className="pt-6">
                <Quote className="w-10 h-10 text-accent/20 mb-4" />
                <p className="text-lg mb-6 leading-relaxed">{testimonial.quote}</p>
                <div className="border-t border-border pt-4">
                  <p className="font-semibold">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  <p className="text-sm text-accent mt-1">{testimonial.company}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
