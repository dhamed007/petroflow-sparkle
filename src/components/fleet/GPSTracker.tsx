import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Truck, Navigation } from 'lucide-react';

interface TruckLocation {
  id: string;
  plate_number: string;
  status: string;
  last_location: {
    latitude: number;
    longitude: number;
    timestamp: string;
  } | null;
  driver: {
    full_name: string;
    email: string;
  } | null;
}

export function GPSTracker() {
  const [trucks, setTrucks] = useState<TruckLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTruckLocations();
    
    // Set up realtime subscription for truck location updates
    const channel = supabase
      .channel('truck-locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trucks',
        },
        (payload) => {
          console.log('Truck location updated:', payload);
          fetchTruckLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTruckLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('trucks')
        .select(`
          id,
          plate_number,
          status,
          last_location,
          profiles:driver_id (
            full_name,
            email
          )
        `)
        .not('last_location', 'is', null);

      if (error) throw error;
      
      setTrucks(data as any || []);
    } catch (error) {
      console.error('Error fetching truck locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      available: 'bg-green-500',
      in_transit: 'bg-blue-500',
      maintenance: 'bg-yellow-500',
      inactive: 'bg-gray-500',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Loading GPS data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-accent" />
            Live Fleet Tracking
          </CardTitle>
          <CardDescription>Real-time GPS locations of your fleet</CardDescription>
        </CardHeader>
        <CardContent>
          {trucks.length === 0 ? (
            <div className="text-center py-8">
              <Navigation className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No GPS data available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Truck locations will appear here when GPS devices are active
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {trucks.map((truck) => (
                <Card key={truck.id} className="border">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{truck.plate_number}</h3>
                          {truck.driver && (
                            <p className="text-sm text-muted-foreground">
                              {truck.driver.full_name || truck.driver.email}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge className={getStatusColor(truck.status)}>
                        {truck.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    {truck.last_location && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Location:</span>
                          <span className="font-mono">
                            {truck.last_location.latitude.toFixed(6)}, {truck.last_location.longitude.toFixed(6)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Navigation className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Last updated:</span>
                          <span>{formatTimestamp(truck.last_location.timestamp)}</span>
                        </div>
                        
                        {/* Google Maps link */}
                        <a
                          href={`https://www.google.com/maps?q=${truck.last_location.latitude},${truck.last_location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-accent hover:underline mt-2"
                        >
                          <MapPin className="w-3 h-3" />
                          View on Google Maps
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-accent mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-medium">GPS Tracking Information</h4>
              <p className="text-sm text-muted-foreground">
                GPS locations update automatically when drivers are on delivery routes. 
                Locations are tracked via GPS devices installed in each truck.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                To enable GPS tracking, ensure each truck has a GPS device ID configured 
                in the Fleet Management section.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
