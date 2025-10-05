import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Activity, Package, Truck, Archive, FileText, Settings, Shield } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  requiredRole?: string;
}

const DashboardNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserRoles = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      if (!error && data) {
        setUserRoles(data.map((r) => r.role));
      }
    };

    fetchUserRoles();
  }, [user]);

  const navItems: NavItem[] = [
    { label: "Dashboard", path: "/dashboard", icon: <Activity className="w-4 h-4" /> },
    { label: "Orders", path: "/orders", icon: <Package className="w-4 h-4" /> },
    { label: "Deliveries", path: "/deliveries", icon: <Truck className="w-4 h-4" /> },
    { label: "Inventory", path: "/inventory", icon: <Archive className="w-4 h-4" /> },
    { label: "Invoices", path: "/invoices", icon: <FileText className="w-4 h-4" /> },
    { label: "Settings", path: "/settings", icon: <Settings className="w-4 h-4" />, requiredRole: "tenant_admin" },
    { label: "Admin", path: "/admin", icon: <Shield className="w-4 h-4" />, requiredRole: "super_admin" },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.requiredRole) return true;
    return userRoles.includes(item.requiredRole);
  });

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            <span className="text-xl font-bold">PetroFlow</span>
          </div>

          <div className="flex items-center gap-2">
            {filteredNavItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className="gap-2"
              >
                {item.icon}
                <span className="hidden md:inline">{item.label}</span>
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNav;
