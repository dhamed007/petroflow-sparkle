import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Truck, User, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Driver {
  id: string;
  full_name: string;
  email: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  capacity: number;
  capacity_unit: string;
  status: string;
}

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  onSuccess: () => void;
}

export function AssignmentDialog({ open, onOpenChange, order, onSuccess }: AssignmentDialogProps) {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDriversAndVehicles();
      setScheduledDate(new Date().toISOString().split('T')[0]);
    }
  }, [open]);

  const fetchDriversAndVehicles = async () => {
    try {
      // Fetch drivers (users with driver role)
      const { data: driverRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'driver');

      if (rolesError) throw rolesError;

      if (driverRoles && driverRoles.length > 0) {
        const driverIds = driverRoles.map(r => r.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', driverIds);

        if (!profilesError && profiles) {
          setDrivers(profiles);
        }
      }

      // Fetch available trucks
      const { data: trucksData, error: trucksError } = await supabase
        .from('trucks')
        .select('*')
        .eq('status', 'available');

      if (!trucksError && trucksData) {
        setVehicles(trucksData);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error loading data',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleAssign = async () => {
    if (!selectedDriver) {
      toast({
        title: 'Driver required',
        description: 'Please select a driver to assign',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      // Create delivery record
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .single();

      if (!profile?.tenant_id) throw new Error('No tenant found');

      const { error: deliveryError } = await supabase
        .from('deliveries')
        .insert({
          tenant_id: profile.tenant_id,
          order_id: order.id,
          driver_id: selectedDriver,
          vehicle_number: selectedVehicle ? vehicles.find(v => v.id === selectedVehicle)?.plate_number : null,
          status: 'scheduled',
          notes: notes || null,
          departure_time: scheduledDate ? new Date(scheduledDate).toISOString() : null
        });

      if (deliveryError) throw deliveryError;

      // Update order status to confirmed
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // Update truck status if selected
      if (selectedVehicle) {
        await supabase
          .from('trucks')
          .update({ status: 'in_use', driver_id: selectedDriver })
          .eq('id', selectedVehicle);
      }

      toast({
        title: 'Assignment successful',
        description: `Order ${order.order_number} assigned to driver`
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: 'Assignment failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDriver('');
    setSelectedVehicle('');
    setNotes('');
    setScheduledDate('');
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Driver & Vehicle</DialogTitle>
          <DialogDescription>
            Assign a driver and vehicle to order {order.order_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Summary */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p><strong>Product:</strong> {order.product_type}</p>
            <p><strong>Quantity:</strong> {order.quantity} {order.unit}</p>
            <p><strong>Delivery:</strong> {order.delivery_address}</p>
          </div>

          {/* Driver Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Driver *
            </Label>
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger>
                <SelectValue placeholder="Select a driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.length === 0 ? (
                  <SelectItem value="none" disabled>No drivers available</SelectItem>
                ) : (
                  drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.full_name || driver.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Vehicle (Optional)
            </Label>
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No vehicle</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate_number} ({vehicle.capacity} {vehicle.capacity_unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scheduled Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Scheduled Date
            </Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              placeholder="Add any special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading || !selectedDriver}>
            {loading ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
