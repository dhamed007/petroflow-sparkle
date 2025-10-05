import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, LogOut, Building2 } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  plan: string;
  logo_url: string | null;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    fetchTenantData();
  }, [user, navigate]);

  const fetchTenantData = async () => {
    try {
      // Get user's profile with tenant info
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return;
      }

      if (profile?.tenant_id) {
        // Fetch tenant details
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profile.tenant_id)
          .single();

        if (tenantError) {
          console.error('Error fetching tenant:', tenantError);
        } else {
          setTenant(tenantData);
        }
      }
    } catch (error) {
      console.error('Error in fetchTenantData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Activity className="w-12 h-12 text-accent animate-pulse mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-accent" />
            <div>
              <h1 className="text-xl font-bold">PetroFlow</h1>
              {tenant && (
                <p className="text-sm text-muted-foreground">{tenant.name}</p>
              )}
            </div>
          </div>
          
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Welcome Card */}
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle>Welcome back!</CardTitle>
              <CardDescription>
                {user?.email}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tenant ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <Building2 className="w-6 h-6 text-accent mt-1" />
                    <div>
                      <h3 className="font-semibold">{tenant.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Industry: {tenant.industry || 'Not specified'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Plan: {tenant.plan}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Building2 className="w-12 h-12 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="font-semibold mb-2">No Company Assigned</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your account is not yet associated with a company. Contact your administrator to get access.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {tenant && (
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="hover:shadow-glow transition-smooth">
                <CardHeader>
                  <CardTitle className="text-lg">Orders</CardTitle>
                  <CardDescription>Manage petroleum orders</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="secondary">
                    View Orders
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-glow transition-smooth">
                <CardHeader>
                  <CardTitle className="text-lg">Deliveries</CardTitle>
                  <CardDescription>Track delivery status</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="secondary">
                    View Deliveries
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-glow transition-smooth">
                <CardHeader>
                  <CardTitle className="text-lg">Inventory</CardTitle>
                  <CardDescription>Monitor stock levels</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="secondary">
                    View Inventory
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
