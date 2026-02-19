import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom truck icon
const truckIcon = new L.DivIcon({
  className: 'custom-truck-marker',
  html: `<div style="background: hsl(27 96% 61%); color: white; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
      <path d="M15 18H9"/>
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
      <circle cx="17" cy="18" r="2"/>
      <circle cx="7" cy="18" r="2"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

interface TruckLocation {
  id: string;
  plate_number: string;
  status: string;
  capacity: number;
  capacity_unit: string;
  last_location: {
    lat: number;
    lng: number;
    timestamp?: string;
  } | null;
  driver?: {
    full_name: string;
  } | null;
}

// Component to handle map center updates
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function FleetMap() {
  const { user } = useAuth();
  const [trucks, setTrucks] = useState<TruckLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState<[number, number]>([6.5244, 3.3792]); // Lagos, Nigeria default

  useEffect(() => {
    fetchTrucks();

    // Real-time updates
    const channel = supabase
      .channel('truck-locations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trucks'
        },
        (payload) => {
          console.log('Truck location update:', payload);
          setTrucks(prev => 
            prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchTrucks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .not('last_location', 'is', null);

      if (error) throw error;

      // Parse last_location JSON
      const trucksWithLocation = (data || []).map(truck => ({
        ...truck,
        last_location: truck.last_location as TruckLocation['last_location']
      })).filter(t => t.last_location?.lat && t.last_location?.lng);

      setTrucks(trucksWithLocation);

      // Center on first truck if available
      if (trucksWithLocation.length > 0 && trucksWithLocation[0].last_location) {
        setCenter([
          trucksWithLocation[0].last_location.lat,
          trucksWithLocation[0].last_location.lng
        ]);
      }
    } catch (error) {
      console.error('Error fetching trucks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'default';
      case 'in_use': return 'secondary';
      case 'maintenance': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-accent" />
            Fleet Tracking
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchTrucks} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[300px] md:h-[500px] relative">
          {trucks.length === 0 && !loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 z-10">
              <Truck className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No trucks with GPS data</p>
              <p className="text-sm text-muted-foreground mt-1">
                Update truck locations in Fleet Management
              </p>
            </div>
          ) : null}
          
          <MapContainer
            center={center}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            className="rounded-b-lg"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={center} />
            
            {trucks.map((truck) => (
              truck.last_location && (
                <Marker
                  key={truck.id}
                  position={[truck.last_location.lat, truck.last_location.lng]}
                  icon={truckIcon}
                >
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-2">
                        <Truck className="w-4 h-4" />
                        <span className="font-bold">{truck.plate_number}</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant={getStatusColor(truck.status)} className="capitalize">
                            {truck.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Capacity:</span>
                          <span>{truck.capacity} {truck.capacity_unit}</span>
                        </div>
                        {truck.last_location.timestamp && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Updated:</span>
                            <span>{new Date(truck.last_location.timestamp).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>
        </div>

        {/* Truck Legend */}
        {trucks.length > 0 && (
          <div className="p-4 border-t">
            <p className="text-sm font-medium mb-2">Active Trucks ({trucks.length})</p>
            <div className="flex flex-wrap gap-2">
              {trucks.slice(0, 5).map((truck) => (
                <Badge 
                  key={truck.id} 
                  variant={getStatusColor(truck.status)}
                  className="cursor-pointer"
                  onClick={() => {
                    if (truck.last_location) {
                      setCenter([truck.last_location.lat, truck.last_location.lng]);
                    }
                  }}
                >
                  <Truck className="w-3 h-3 mr-1" />
                  {truck.plate_number}
                </Badge>
              ))}
              {trucks.length > 5 && (
                <Badge variant="outline">+{trucks.length - 5} more</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
