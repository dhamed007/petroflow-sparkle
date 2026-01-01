import { Activity } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-6 h-6 text-accent" />
                <span className="text-xl font-bold">PetroFlow</span>
              </div>
              <p className="text-xs text-muted-foreground">by Visionsedge Technologies</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Enterprise logistics and distribution management platform trusted by 500+ companies worldwide.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-accent transition-smooth">Features</a></li>
              <li><a href="#solutions" className="hover:text-accent transition-smooth">Solutions</a></li>
              <li><a href="#pricing" className="hover:text-accent transition-smooth">Pricing</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">Integrations</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-accent transition-smooth">About</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">Careers</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">Blog</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">Contact</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-accent transition-smooth">Documentation</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">API Reference</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">Support</a></li>
              <li><a href="#" className="hover:text-accent transition-smooth">System Status</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; 2024 Visionsedge Technologies. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-accent transition-smooth">Privacy Policy</a>
            <a href="#" className="hover:text-accent transition-smooth">Terms of Service</a>
            <a href="#" className="hover:text-accent transition-smooth">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
