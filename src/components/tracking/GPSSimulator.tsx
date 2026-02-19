import { useState, useEffect, useRef } from 'react';
import { withRateLimit } from '@/utils/rateLimiter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, RotateCcw, Truck, MapPin } from 'lucide-react';

interface Truck {
  id: string;
  plate_number: string;
  status: string;
  last_location: {
    lat: number;
    lng: number;
    timestamp?: string;
  } | null;
}

// Nigerian cities with coordinates for simulation routes
const SIMULATION_ROUTES = {
  lagos_ibadan: {
    name: 'Lagos → Ibadan',
    waypoints: [
      { lat: 6.5244, lng: 3.3792, name: 'Lagos' },
      { lat: 6.6018, lng: 3.3515, name: 'Ikeja' },
      { lat: 6.8000, lng: 3.4500, name: 'Ikorodu' },
      { lat: 6.9200, lng: 3.5800, name: 'Sagamu' },
      { lat: 7.1500, lng: 3.6500, name: 'Shagamu Junction' },
      { lat: 7.3775, lng: 3.9470, name: 'Ibadan' },
    ]
  },
  lagos_benin: {
    name: 'Lagos → Benin City',
    waypoints: [
      { lat: 6.5244, lng: 3.3792, name: 'Lagos' },
      { lat: 6.4500, lng: 3.6000, name: 'Epe' },
      { lat: 6.3500, lng: 4.1000, name: 'Ijebu-Ode' },
      { lat: 6.3000, lng: 5.0000, name: 'Ore' },
      { lat: 6.3350, lng: 5.6037, name: 'Benin City' },
    ]
  },
  lagos_port: {
    name: 'Lagos → Port Harcourt',
    waypoints: [
      { lat: 6.5244, lng: 3.3792, name: 'Lagos' },
      { lat: 6.3350, lng: 5.6037, name: 'Benin City' },
      { lat: 5.8987, lng: 5.6755, name: 'Warri' },
      { lat: 5.0527, lng: 6.8586, name: 'Yenagoa' },
      { lat: 4.8156, lng: 7.0498, name: 'Port Harcourt' },
    ]
  },
  abuja_kano: {
    name: 'Abuja → Kano',
    waypoints: [
      { lat: 9.0765, lng: 7.3986, name: 'Abuja' },
      { lat: 9.6000, lng: 7.5000, name: 'Kaduna Junction' },
      { lat: 10.5222, lng: 7.4383, name: 'Kaduna' },
      { lat: 11.0000, lng: 7.8000, name: 'Zaria' },
      { lat: 12.0022, lng: 8.5919, name: 'Kano' },
    ]
  }
};

export function GPSSimulator() {
  const { toast } = useToast();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>('lagos_ibadan');
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentWaypoint, setCurrentWaypoint] = useState(0);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(2000); // ms between updates
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTrucks();
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const fetchTrucks = async () => {
    const { data, error } = await supabase
      .from('trucks')
      .select('id, plate_number, status, last_location');

    if (!error && data) {
      setTrucks(data as Truck[]);
      if (data.length > 0 && !selectedTruck) {
        setSelectedTruck(data[0].id);
      }
    }
  };

  const updateTruckLocation = async (lat: number, lng: number, waypointName: string) => {
    if (!selectedTruck) return;

    try {
      await withRateLimit('gps', async () => {
        const { error } = await supabase
          .from('trucks')
          .update({
            last_location: {
              lat,
              lng,
              timestamp: new Date().toISOString(),
              waypoint: waypointName
            },
            status: 'in_use',
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedTruck);

        if (error) {
          console.error('Error updating location:', error);
        }
      });
    } catch (err) {
      // Rate limited — skip this update
      console.debug('GPS update rate limited, skipping');
    }
  };

  const interpolatePosition = (start: { lat: number; lng: number }, end: { lat: number; lng: number }, progress: number) => {
    return {
      lat: start.lat + (end.lat - start.lat) * progress,
      lng: start.lng + (end.lng - start.lng) * progress
    };
  };

  const startSimulation = () => {
    if (!selectedTruck) {
      toast({
        title: 'Select a truck',
        description: 'Please select a truck to simulate',
        variant: 'destructive'
      });
      return;
    }

    const route = SIMULATION_ROUTES[selectedRoute as keyof typeof SIMULATION_ROUTES];
    if (!route) return;

    setIsSimulating(true);
    setCurrentWaypoint(0);

    let waypointIndex = 0;
    let subStep = 0;
    const stepsPerWaypoint = 5; // Smooth transition between waypoints

    // Initial position
    updateTruckLocation(route.waypoints[0].lat, route.waypoints[0].lng, route.waypoints[0].name);

    intervalRef.current = setInterval(() => {
      if (waypointIndex >= route.waypoints.length - 1) {
        // Reached destination, loop back
        waypointIndex = 0;
        subStep = 0;
        setCurrentWaypoint(0);
        return;
      }

      const currentPos = route.waypoints[waypointIndex];
      const nextPos = route.waypoints[waypointIndex + 1];
      
      subStep++;
      const progress = subStep / stepsPerWaypoint;

      if (progress >= 1) {
        // Move to next waypoint
        waypointIndex++;
        subStep = 0;
        setCurrentWaypoint(waypointIndex);
        updateTruckLocation(nextPos.lat, nextPos.lng, nextPos.name);
      } else {
        // Interpolate position
        const pos = interpolatePosition(currentPos, nextPos, progress);
        updateTruckLocation(pos.lat, pos.lng, `En route to ${nextPos.name}`);
      }
    }, simulationSpeed);

    toast({
      title: 'Simulation started',
      description: `Simulating ${route.name} route`
    });
  };

  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsSimulating(false);
    toast({
      title: 'Simulation stopped',
      description: 'GPS tracking simulation paused'
    });
  };

  const resetSimulation = async () => {
    stopSimulation();
    setCurrentWaypoint(0);

    if (selectedTruck) {
      await supabase
        .from('trucks')
        .update({
          last_location: null,
          status: 'available'
        })
        .eq('id', selectedTruck);

      toast({
        title: 'Simulation reset',
        description: 'Truck location cleared'
      });

      fetchTrucks();
    }
  };

  const route = SIMULATION_ROUTES[selectedRoute as keyof typeof SIMULATION_ROUTES];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-accent" />
          GPS Simulator
        </CardTitle>
        <CardDescription>
          Simulate truck movement along predefined routes for testing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Truck Selection */}
        <div className="space-y-2">
          <Label>Select Truck</Label>
          <Select value={selectedTruck} onValueChange={setSelectedTruck} disabled={isSimulating}>
            <SelectTrigger>
              <SelectValue placeholder="Select a truck" />
            </SelectTrigger>
            <SelectContent>
              {trucks.length === 0 ? (
                <SelectItem value="none" disabled>No trucks available</SelectItem>
              ) : (
                trucks.map((truck) => (
                  <SelectItem key={truck.id} value={truck.id}>
                    <span className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      {truck.plate_number}
                      <Badge variant={truck.status === 'available' ? 'default' : 'secondary'} className="ml-2">
                        {truck.status}
                      </Badge>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Route Selection */}
        <div className="space-y-2">
          <Label>Select Route</Label>
          <Select value={selectedRoute} onValueChange={setSelectedRoute} disabled={isSimulating}>
            <SelectTrigger>
              <SelectValue placeholder="Select a route" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SIMULATION_ROUTES).map(([key, route]) => (
                <SelectItem key={key} value={key}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Speed Control */}
        <div className="space-y-2">
          <Label>Simulation Speed</Label>
          <Select 
            value={simulationSpeed.toString()} 
            onValueChange={(v) => setSimulationSpeed(parseInt(v))}
            disabled={isSimulating}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="500">Very Fast (0.5s)</SelectItem>
              <SelectItem value="1000">Fast (1s)</SelectItem>
              <SelectItem value="2000">Normal (2s)</SelectItem>
              <SelectItem value="5000">Slow (5s)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Route Preview */}
        {route && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Route Waypoints:</p>
            <div className="flex flex-wrap gap-2">
              {route.waypoints.map((wp, index) => (
                <Badge 
                  key={index} 
                  variant={index === currentWaypoint && isSimulating ? 'default' : 'outline'}
                  className="text-xs"
                >
                  {index + 1}. {wp.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isSimulating ? (
            <Button onClick={startSimulation} className="flex-1" disabled={!selectedTruck}>
              <Play className="w-4 h-4 mr-2" />
              Start Simulation
            </Button>
          ) : (
            <Button onClick={stopSimulation} variant="secondary" className="flex-1">
              <Pause className="w-4 h-4 mr-2" />
              Stop
            </Button>
          )}
          <Button onClick={resetSimulation} variant="outline">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {isSimulating && (
          <div className="text-center text-sm text-muted-foreground">
            <p className="animate-pulse">🟢 Simulation running...</p>
            <p>Open the Fleet Tracking page to see real-time updates</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
