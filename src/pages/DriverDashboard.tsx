import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardNav from '@/components/DashboardNav';
import { Truck, MapPin, Package, CheckCircle, Clock, Navigation, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGPSTracking } from '@/hooks/useGPSTracking';

export default function DriverDashboard() {
  const { user } = useAuth();
  const { hasRole, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleGPSUpdate = useCallback(async (position: { lat: number; lng: number; accuracy: number; timestamp: number }) => {
    if (!user) return;
    // Find the truck assigned to this driver and update its location
    const updateData: Record<string, unknown> = {
      last_location: {
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy,
        timestamp: new Date(position.timestamp).toISOString(),
      },
      status: 'in_use',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('trucks')
      .update(updateData as any)
      .eq('driver_id', user.id);

    if (error) console.error('GPS update error:', error);
  }, [user]);

  const gps = useGPSTracking({
    onPositionUpdate: handleGPSUpdate,
    updateInterval: 10000,
  });

  useEffect(() => {
    if (!roleLoading && !hasRole('driver')) {
      navigate('/dashboard');
    }
  }, [hasRole, roleLoading, navigate]);

  useEffect(() => {
    const fetchDriverDeliveries = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('deliveries')
          .select(`
            *,
            orders (
              order_number,
              product_type,
              quantity,
              unit,
              delivery_address,
              customers (name, phone)
            )
          `)
          .eq('driver_id', user.id)
          .in('status', ['scheduled', 'in_transit'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        setDeliveries(data || []);
      } catch (error: any) {
        toast({
          title: 'Error loading deliveries',
          description: error.message,
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDriverDeliveries();

    // Real-time subscription
    const channel = supabase
      .channel('driver-deliveries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          filter: `driver_id=eq.${user?.id}`
        },
        () => fetchDriverDeliveries()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'scheduled': return 'outline';
      case 'in_transit': return 'secondary';
      case 'delivered': return 'default';
      default: return 'outline';
    }
  };

  const handleUpdateStatus = async (deliveryId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === 'in_transit') {
        updates.departure_time = new Date().toISOString();
      } else if (newStatus === 'delivered') {
        updates.arrival_time = new Date().toISOString();
      }

      const { error } = await supabase
        .from('deliveries')
        .update(updates)
        .eq('id', deliveryId);

      if (error) throw error;

      setDeliveries(prev => 
        prev.map(d => d.id === deliveryId ? { ...d, ...updates } : d)
      );

      toast({
        title: 'Status updated',
        description: `Delivery marked as ${newStatus.replace('_', ' ')}`
      });
    } catch (error: any) {
      toast({
        title: 'Error updating status',
        description: error.message,
        variant: 'destructive'
      });
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <main className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Driver Dashboard</h1>
            <p className="text-muted-foreground">Manage your deliveries and routes</p>
          </div>
          <Truck className="w-10 h-10 text-accent" />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {deliveries.filter(d => d.status === 'scheduled').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {deliveries.filter(d => d.status === 'in_transit').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveries.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* GPS Tracking Card */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              GPS Location Sharing
            </CardTitle>
            {gps.isOffline && (
              <Badge variant="outline" className="text-yellow-600">
                <WifiOff className="h-3 w-3 mr-1" />
                Offline ({gps.queuedUpdates} queued)
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button
                variant={gps.isTracking ? "default" : "outline"}
                onClick={gps.isTracking ? gps.stopTracking : gps.startTracking}
              >
                <Navigation className="h-4 w-4 mr-2" />
                {gps.isTracking ? 'Stop Sharing' : 'Start Sharing Location'}
              </Button>
              {gps.currentPosition && (
                <p className="text-sm text-muted-foreground">
                  {gps.currentPosition.lat.toFixed(5)}, {gps.currentPosition.lng.toFixed(5)}
                  {' '}({Math.round(gps.currentPosition.accuracy)}m accuracy)
                </p>
              )}
              {gps.error && (
                <p className="text-sm text-destructive">{gps.error}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Deliveries List */}
        <Card>
          <CardHeader>
            <CardTitle>My Deliveries</CardTitle>
            <CardDescription>Active delivery assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active deliveries at the moment</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deliveries.map((delivery) => (
                  <Card key={delivery.id} className="hover:shadow-glow transition-smooth">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">
                              {delivery.orders?.order_number || 'N/A'}
                            </h3>
                            <Badge variant={getStatusVariant(delivery.status)} className="capitalize">
                              {delivery.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {delivery.orders?.customers?.name || 'Unknown Customer'}
                          </p>
                          {delivery.orders?.customers?.phone && (
                            <p className="text-xs text-muted-foreground">
                              {delivery.orders?.customers?.phone}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium">
                            {delivery.orders?.quantity} {delivery.orders?.unit}
                          </p>
                          <p className="text-muted-foreground">
                            {delivery.orders?.product_type}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 mb-4">
                        <MapPin className="w-4 h-4 mt-1 text-muted-foreground flex-shrink-0" />
                        <p className="text-sm">{delivery.orders?.delivery_address}</p>
                      </div>

                      <div className="flex gap-2">
                        {delivery.status === 'scheduled' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdateStatus(delivery.id, 'in_transit')}
                          >
                            Start Delivery
                          </Button>
                        )}
                        {delivery.status === 'in_transit' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdateStatus(delivery.id, 'delivered')}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Delivered
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => navigate('/tracking')}
                        >
                          View Map
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
