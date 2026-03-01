import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardNav from '@/components/DashboardNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Truck, Archive, FileText, TrendingUp, AlertTriangle } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  plan: string;
  logo_url: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    activeDeliveries: 0,
    lowStockItems: 0,
    pendingInvoices: 0,
    recentOrders: [] as any[],
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Check if user has completed onboarding
    const checkOnboarding = async () => {
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('tenant_id').eq('id', user.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ]);

      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === 'super_admin');

      if (isSuperAdmin) {
        navigate('/admin');
        return;
      }

      if (!profile?.tenant_id) {
        navigate('/onboarding');
        return;
      }

      fetchTenantData();
    };

    checkOnboarding();
  }, [user, navigate]);

  const fetchTenantData = async () => {
    try {
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
        const [tenantData, ordersData, deliveriesData, inventoryData, invoicesData] = await Promise.all([
          supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
          supabase.from('orders').select('*, customers(name)').order('created_at', { ascending: false }),
          supabase.from('deliveries').select('*'),
          supabase.from('inventory').select('*'),
          supabase.from('invoices').select('*'),
        ]);

        if (tenantData.data) setTenant(tenantData.data);

        setStats({
          totalOrders: ordersData.data?.length || 0,
          pendingOrders: ordersData.data?.filter(o => o.status === 'pending').length || 0,
          activeDeliveries: deliveriesData.data?.filter(d => ['scheduled', 'in_transit'].includes(d.status)).length || 0,
          lowStockItems: inventoryData.data?.filter(i => i.min_threshold && i.quantity <= i.min_threshold).length || 0,
          pendingInvoices: invoicesData.data?.filter(i => i.status === 'pending').length || 0,
          recentOrders: ordersData.data?.slice(0, 5) || [],
        });
      }
    } catch (error) {
      console.error('Error in fetchTenantData:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="font-semibold mb-2">No Organization Assigned</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your account is not yet associated with an organization. Contact your administrator to get access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">{tenant.name}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="hover:shadow-glow transition-smooth">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pendingOrders} pending
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-glow transition-smooth">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeDeliveries}</div>
              <p className="text-xs text-muted-foreground">
                In transit or scheduled
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-glow transition-smooth">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.lowStockItems}</div>
              <p className="text-xs text-muted-foreground">
                Items need restocking
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-glow transition-smooth">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingInvoices}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting payment
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent Orders</span>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Latest orders from your customers</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No orders yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stats.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-smooth">
                    <div className="flex-1">
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.customers?.name} • {order.product_type} • {order.quantity} {order.unit}
                      </p>
                    </div>
                    <span className="text-sm px-3 py-1 rounded-full bg-secondary text-secondary-foreground capitalize">
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <Card className="hover:shadow-glow transition-smooth cursor-pointer" onClick={() => navigate('/orders')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-accent" />
                Orders
              </CardTitle>
              <CardDescription>Create and manage orders</CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-glow transition-smooth cursor-pointer" onClick={() => navigate('/deliveries')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="w-5 h-5 text-accent" />
                Deliveries
              </CardTitle>
              <CardDescription>Track delivery status</CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-glow transition-smooth cursor-pointer" onClick={() => navigate('/inventory')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Archive className="w-5 h-5 text-accent" />
                Inventory
              </CardTitle>
              <CardDescription>Monitor stock levels</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  );
}
