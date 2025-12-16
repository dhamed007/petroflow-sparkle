import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Package, Truck, Archive, FileText, Settings, Shield, CreditCard, Users, Link, Activity, MapPin, User, BarChart3, Building2, FileDown } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsDropdown } from "@/components/notifications/NotificationsDropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; email: string } | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('profiles').select('full_name, avatar_url, email').eq('id', user.id).single()
      ]);
      
      if (!rolesResult.error && rolesResult.data) {
        setUserRoles(rolesResult.data.map((r) => r.role));
      }
      
      if (!profileResult.error && profileResult.data) {
        setProfile(profileResult.data);
      }
    };

    fetchUserData();
  }, [user]);

  const navItems: NavItem[] = [
    { label: "Dashboard", path: "/dashboard", icon: <Activity className="w-4 h-4" /> },
    { label: "Orders", path: "/orders", icon: <Package className="w-4 h-4" /> },
    { label: "Deliveries", path: "/deliveries", icon: <Truck className="w-4 h-4" /> },
    { label: "Tracking", path: "/tracking", icon: <MapPin className="w-4 h-4" /> },
    { label: "Inventory", path: "/inventory", icon: <Archive className="w-4 h-4" /> },
    { label: "Invoices", path: "/invoices", icon: <FileText className="w-4 h-4" /> },
    { label: "Analytics", path: "/analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { label: "Fleet", path: "/fleet", icon: <Truck className="w-4 h-4" /> },
    { label: "Customers", path: "/customers", icon: <Building2 className="w-4 h-4" /> },
    { label: "Reports", path: "/reports", icon: <FileDown className="w-4 h-4" /> },
    { label: "Users", path: "/settings/users", icon: <Users className="w-4 h-4" />, requiredRole: "tenant_admin" },
    { label: "Subscription", path: "/subscriptions", icon: <CreditCard className="w-4 h-4" /> },
    { label: "ERP", path: "/integrations/erp", icon: <Link className="w-4 h-4" /> },
    { label: "Settings", path: "/settings", icon: <Settings className="w-4 h-4" />, requiredRole: "tenant_admin" },
    { label: "Admin", path: "/admin", icon: <Shield className="w-4 h-4" />, requiredRole: "super_admin" },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.requiredRole) return true;
    return userRoles.includes(item.requiredRole);
  });

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <Activity className="w-6 h-6 text-accent" />
            <span className="text-xl font-bold">PetroFlow</span>
          </div>

          <div className="flex items-center gap-1">
            {filteredNavItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className="gap-2"
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
              </Button>
            ))}
            
            {/* Notifications */}
            <NotificationsDropdown />
            
            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 ml-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(profile?.full_name || null, profile?.email || '')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline">{profile?.full_name || 'Account'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNav;
