import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardNav from '@/components/DashboardNav';
import { Package, FileText, Truck, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function ClientDashboard() {
  const { user } = useAuth();
  const { hasRole, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !hasRole('client')) {
      navigate('/dashboard');
    }
  }, [hasRole, roleLoading, navigate]);

  useEffect(() => {
    const fetchClientData = async () => {
      if (!user) return;

      // Fetch orders for this client
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name, phone),
          deliveries (status, departure_time, arrival_time)
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch invoices for this client
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('*')
        .in('order_id', ordersData?.map(o => o.id) || [])
        .order('created_at', { ascending: false });

      if (ordersData) setOrders(ordersData);
      if (invoicesData) setInvoices(invoicesData);
      
      setLoading(false);
    };

    fetchClientData();
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <AlertCircle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'confirmed': return 'bg-blue-500';
      case 'in_transit': return 'bg-purple-500';
      case 'delivered': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen">
        <DashboardNav />
        <div className="container mx-auto p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const pendingInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'draft');
  const activeOrders = orders.filter(ord => 
    ord.status === 'pending' || ord.status === 'confirmed' || ord.status === 'in_transit'
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <main className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Client Dashboard</h1>
            <p className="text-muted-foreground">Track your orders and manage invoices</p>
          </div>
          <Package className="w-10 h-10 text-accent" />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeOrders.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingInvoices.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter(o => o.status === 'in_transit').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Orders</CardTitle>
                  <CardDescription>Your latest order activity</CardDescription>
                </div>
                <Button onClick={() => navigate('/orders')}>View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No orders yet</p>
                  <Button className="mt-4" onClick={() => navigate('/orders')}>
                    Place Your First Order
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(order.status)}
                        <div>
                          <p className="font-medium">{order.order_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {order.quantity} {order.unit} - {order.product_type}
                          </p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>Payment status</CardDescription>
                </div>
                <Button onClick={() => navigate('/invoices')}>View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No invoices yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {invoices.slice(0, 5).map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {invoice.currency} {invoice.total_amount?.toLocaleString()}
                        </p>
                        <Badge 
                          className={
                            invoice.status === 'paid' ? 'bg-green-500' :
                            invoice.status === 'pending' ? 'bg-yellow-500' : 
                            'bg-gray-500'
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
