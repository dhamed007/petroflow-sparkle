import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Truck, Search, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const Fleet = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [trucks, setTrucks] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState({
    plate_number: '',
    capacity: '',
    capacity_unit: 'liters',
    status: 'available',
    gps_device_id: '',
    driver_id: '',
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchTrucks();
    fetchDrivers();
  }, [user, navigate]);

  const fetchTrucks = async () => {
    try {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch driver profiles for trucks that have driver_id
      const driverIds = (data || []).filter(t => t.driver_id).map(t => t.driver_id!);
      let driverMap: Record<string, { id: string; full_name: string | null; email: string }> = {};
      if (driverIds.length > 0) {
        const { data: driverProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', driverIds);
        if (driverProfiles) {
          driverMap = Object.fromEntries(driverProfiles.map(d => [d.id, d]));
        }
      }

      const trucksWithDrivers = (data || []).map(truck => ({
        ...truck,
        profiles: truck.driver_id ? driverMap[truck.driver_id] || null : null,
      }));

      if (error) throw error;
      setTrucks(trucksWithDrivers);
    } catch (error: any) {
      toast({
        title: "Error loading fleet",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      // Get current user's tenant
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) return;

      // Get all users with driver role in this tenant
      const { data: driverRoles, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('tenant_id', profile.tenant_id)
        .eq('role', 'driver');

      if (error) throw error;

      const driverIds = driverRoles?.map((r) => r.user_id) || [];

      if (driverIds.length > 0) {
        const { data: driversData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', driverIds);

        setDrivers(driversData || []);
      }
    } catch (error: any) {
      console.error('Error loading drivers:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) {
        toast({ title: "No tenant found", variant: "destructive" });
        return;
      }

      const truckData = {
        ...formData,
        capacity: parseFloat(formData.capacity),
        driver_id: formData.driver_id || null,
        tenant_id: profile.tenant_id,
      };

      if (editingTruck) {
        const { error } = await supabase
          .from('trucks')
          .update(truckData)
          .eq('id', editingTruck.id);

        if (error) throw error;
        toast({ title: "Truck updated successfully" });
      } else {
        const { error } = await supabase
          .from('trucks')
          .insert(truckData);

        if (error) throw error;
        toast({ title: "Truck added successfully" });
      }

      setDialogOpen(false);
      setEditingTruck(null);
                setFormData({
                  plate_number: '',
                  capacity: '',
                  capacity_unit: 'liters',
                  status: 'available',
                  gps_device_id: '',
                  driver_id: '',
                });
      fetchTrucks();
    } catch (error: any) {
      toast({
        title: "Error saving truck",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (truck: any) => {
    setEditingTruck(truck);
    setFormData({
      plate_number: truck.plate_number,
      capacity: truck.capacity.toString(),
      capacity_unit: truck.capacity_unit,
      status: truck.status,
      gps_device_id: truck.gps_device_id || '',
      driver_id: truck.driver_id || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (truckId: string) => {
    if (!confirm('Are you sure you want to delete this truck?')) return;

    try {
      const { error } = await supabase
        .from('trucks')
        .delete()
        .eq('id', truckId);

      if (error) throw error;
      toast({ title: 'Truck deleted successfully' });
      fetchTrucks();
    } catch (error: any) {
      toast({
        title: 'Error deleting truck',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredTrucks = trucks.filter(truck => {
    const matchesSearch = truck.plate_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || truck.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    const colors = {
      available: 'bg-green-500',
      in_transit: 'bg-blue-500',
      maintenance: 'bg-yellow-500',
      inactive: 'bg-gray-500',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500';
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Fleet Management</h1>
            <p className="text-muted-foreground">Manage your trucks and vehicles</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => {
                setEditingTruck(null);
      setFormData({
        plate_number: '',
        capacity: '',
        capacity_unit: 'liters',
        status: 'available',
        gps_device_id: '',
        driver_id: '',
      });
              }}>
                <Plus className="w-4 h-4" />
                Add Truck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTruck ? 'Edit Truck' : 'Add New Truck'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Plate Number *</Label>
                  <Input
                    value={formData.plate_number}
                    onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Capacity *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select value={formData.capacity_unit} onValueChange={(value) => setFormData({ ...formData, capacity_unit: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="liters">Liters</SelectItem>
                        <SelectItem value="gallons">Gallons</SelectItem>
                        <SelectItem value="tons">Tons</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>GPS Device ID</Label>
                  <Input
                    value={formData.gps_device_id}
                    onChange={(e) => setFormData({ ...formData, gps_device_id: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Assign Driver (Optional)</Label>
                  <Select 
                    value={formData.driver_id} 
                    onValueChange={(value) => setFormData({ ...formData, driver_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a driver..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No driver assigned</SelectItem>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.full_name || driver.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  {editingTruck ? 'Update Truck' : 'Add Truck'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by plate number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading fleet...</div>
        ) : filteredTrucks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {trucks.length === 0 ? 'No trucks yet. Add your first truck!' : 'No trucks match your filters'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTrucks.map((truck) => (
              <Card key={truck.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Truck className="w-5 h-5" />
                      {truck.plate_number}
                    </span>
                    <Badge className={getStatusColor(truck.status)}>
                      {truck.status.replace('_', ' ')}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Capacity:</span> {truck.capacity} {truck.capacity_unit}
                    </p>
                    {truck.driver_id && truck.profiles && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Driver:</span> {truck.profiles.full_name || truck.profiles.email}
                      </p>
                    )}
                    {truck.gps_device_id && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">GPS ID:</span> {truck.gps_device_id}
                      </p>
                    )}
                    <div className="flex gap-2 pt-4">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(truck)}>
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(truck.id)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Fleet;