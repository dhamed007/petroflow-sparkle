import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardNav from '@/components/DashboardNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';
import { TrendingUp, Package, Truck, DollarSign, Clock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns';

const COLORS = ['hsl(27, 96%, 61%)', 'hsl(220, 91%, 14%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

interface OrderStats {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  inProgress: number;
}

interface DeliveryStats {
  total: number;
  onTime: number;
  delayed: number;
  avgDuration: number;
}

interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export default function Analytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');
  
  const [orderStats, setOrderStats] = useState<OrderStats>({ total: 0, pending: 0, completed: 0, cancelled: 0, inProgress: 0 });
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>({ total: 0, onTime: 0, delayed: 0, avgDuration: 0 });
  const [orderTrends, setOrderTrends] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [productDistribution, setProductDistribution] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [deliveryPerformance, setDeliveryPerformance] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchAnalytics();
  }, [user, navigate, timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const days = parseInt(timeRange);
      const startDate = startOfDay(subDays(new Date(), days));
      const endDate = endOfDay(new Date());

      // Fetch orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (ordersError) throw ordersError;

      // Fetch deliveries
      const { data: deliveries, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (deliveriesError) throw deliveriesError;

      // Fetch invoices for revenue
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (invoicesError) throw invoicesError;

      // Calculate order stats
      const ordersArr = orders || [];
      setOrderStats({
        total: ordersArr.length,
        pending: ordersArr.filter(o => o.status === 'pending').length,
        completed: ordersArr.filter(o => o.status === 'completed' || o.status === 'delivered').length,
        cancelled: ordersArr.filter(o => o.status === 'cancelled').length,
        inProgress: ordersArr.filter(o => o.status === 'in_progress' || o.status === 'confirmed').length,
      });

      // Calculate delivery stats
      const deliveriesArr = deliveries || [];
      const completedDeliveries = deliveriesArr.filter(d => d.status === 'delivered' && d.arrival_time);
      let totalDuration = 0;
      let onTimeCount = 0;

      completedDeliveries.forEach(d => {
        if (d.departure_time && d.arrival_time) {
          const duration = new Date(d.arrival_time).getTime() - new Date(d.departure_time).getTime();
          totalDuration += duration;
          // Consider on-time if delivered within 24 hours
          if (duration < 24 * 60 * 60 * 1000) onTimeCount++;
        }
      });

      setDeliveryStats({
        total: deliveriesArr.length,
        onTime: onTimeCount,
        delayed: completedDeliveries.length - onTimeCount,
        avgDuration: completedDeliveries.length > 0 ? Math.round(totalDuration / completedDeliveries.length / (1000 * 60 * 60)) : 0,
      });

      // Order trends by day
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const trendsData = dateRange.map(date => {
        const dayOrders = ordersArr.filter(o => 
          format(parseISO(o.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        );
        return {
          date: format(date, 'MMM dd'),
          orders: dayOrders.length,
          completed: dayOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length,
        };
      });
      setOrderTrends(trendsData);

      // Status distribution
      const statusCounts = [
        { name: 'Pending', value: orderStats.pending, color: COLORS[3] },
        { name: 'In Progress', value: orderStats.inProgress, color: COLORS[0] },
        { name: 'Completed', value: orderStats.completed, color: COLORS[2] },
        { name: 'Cancelled', value: orderStats.cancelled, color: COLORS[4] },
      ].filter(s => s.value > 0);
      setStatusDistribution(statusCounts);

      // Product distribution
      const productCounts: Record<string, number> = {};
      ordersArr.forEach(o => {
        productCounts[o.product_type] = (productCounts[o.product_type] || 0) + 1;
      });
      setProductDistribution(
        Object.entries(productCounts).map(([name, value], i) => ({
          name,
          value,
          color: COLORS[i % COLORS.length],
        }))
      );

      // Revenue data
      const invoicesArr = invoices || [];
      const revenueByDay = dateRange.map(date => {
        const dayInvoices = invoicesArr.filter(inv => 
          format(parseISO(inv.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        );
        return {
          date: format(date, 'MMM dd'),
          revenue: dayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
          orders: dayInvoices.length,
        };
      });
      setRevenueData(revenueByDay);

      // Delivery performance
      const perfData = dateRange.map(date => {
        const dayDeliveries = deliveriesArr.filter(d => 
          format(parseISO(d.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        );
        return {
          date: format(date, 'MMM dd'),
          scheduled: dayDeliveries.filter(d => d.status === 'scheduled').length,
          inTransit: dayDeliveries.filter(d => d.status === 'in_transit').length,
          delivered: dayDeliveries.filter(d => d.status === 'delivered').length,
        };
      });
      setDeliveryPerformance(perfData);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-muted-foreground">Business insights and performance metrics</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orderStats.total}</div>
              <p className="text-xs text-muted-foreground">
                {orderStats.pending} pending • {orderStats.completed} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveryStats.total}</div>
              <p className="text-xs text-muted-foreground">
                {deliveryStats.onTime} on-time • {deliveryStats.delayed} delayed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Delivery Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveryStats.avgDuration}h</div>
              <p className="text-xs text-muted-foreground">
                From dispatch to delivery
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₦{revenueData.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Last {timeRange} days
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Order Trends */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Trends</CardTitle>
                  <CardDescription>Daily order volume</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={orderTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="orders" stackId="1" stroke="hsl(220, 91%, 14%)" fill="hsl(220, 91%, 14%)" fillOpacity={0.6} name="Total Orders" />
                        <Area type="monotone" dataKey="completed" stackId="2" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.6} name="Completed" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Status</CardTitle>
                  <CardDescription>Distribution by status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {statusDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {statusDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No order data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Product Distribution */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Orders by Product</CardTitle>
                  <CardDescription>Product type distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {productDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productDistribution} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="value" name="Orders">
                            {productDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No product data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="deliveries" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Performance</CardTitle>
                <CardDescription>Daily delivery status breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deliveryPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="scheduled" name="Scheduled" fill="hsl(38, 92%, 50%)" />
                      <Bar dataKey="inTransit" name="In Transit" fill="hsl(27, 96%, 61%)" />
                      <Bar dataKey="delivered" name="Delivered" fill="hsl(142, 71%, 45%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>Daily revenue from invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ fill: 'hsl(142, 71%, 45%)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
