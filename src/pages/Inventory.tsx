import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Archive, AlertTriangle, Plus, Edit2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type InventoryItem = {
  id: string;
  product_type: string;
  location: string;
  quantity: number;
  unit: string;
  min_threshold: number | null;
  max_capacity: number | null;
  tenant_id: string;
};

const emptyForm = {
  product_type: '',
  location: '',
  quantity: '',
  unit: '',
  min_threshold: '',
  max_capacity: '',
};

const Inventory = () => {
  const { user } = useAuth();
  const { hasAnyRole } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canManage = hasAnyRole('tenant_admin', 'dispatch_officer', 'super_admin');

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchInventory();
  }, [user, navigate]);

  const fetchInventory = async () => {
    try {
      // Fetch tenant_id for inserts
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();
      if (profile?.tenant_id) setTenantId(profile.tenant_id);

      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('location');

      if (error) throw error;
      setInventory(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading inventory",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      product_type: item.product_type,
      location: item.location,
      quantity: String(item.quantity),
      unit: item.unit,
      min_threshold: item.min_threshold != null ? String(item.min_threshold) : '',
      max_capacity: item.max_capacity != null ? String(item.max_capacity) : '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_type || !form.location || !form.quantity || !form.unit) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        product_type: form.product_type,
        location: form.location,
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        min_threshold: form.min_threshold ? parseFloat(form.min_threshold) : null,
        max_capacity: form.max_capacity ? parseFloat(form.max_capacity) : null,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('inventory')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: 'Inventory item updated' });
      } else {
        payload.tenant_id = tenantId;
        const { error } = await supabase
          .from('inventory')
          .insert(payload as any);
        if (error) throw error;
        toast({ title: 'Inventory item added' });
      }

      setDialogOpen(false);
      fetchInventory();
    } catch (error: any) {
      toast({ title: 'Error saving item', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', deleteId);
      if (error) throw error;
      toast({ title: 'Item deleted' });
      fetchInventory();
    } catch (error: any) {
      toast({ title: 'Error deleting item', description: error.message, variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const isLowStock = (item: InventoryItem) =>
    item.min_threshold != null && item.quantity <= item.min_threshold;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Inventory</h1>
            <p className="text-muted-foreground">Monitor stock levels</p>
          </div>
          {canManage && (
            <Button className="gap-2" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">Loading inventory...</div>
        ) : inventory.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Archive className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No inventory items yet</p>
              {canManage && (
                <Button className="mt-4 gap-2" onClick={openAdd}>
                  <Plus className="w-4 h-4" />
                  Add First Item
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{item.product_type}</span>
                    {isLowStock(item) && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Low Stock
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{item.location}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Quantity</p>
                      <p className="font-medium">{item.quantity} {item.unit}</p>
                    </div>
                    {item.max_capacity && (
                      <div>
                        <p className="text-sm text-muted-foreground">Capacity</p>
                        <p className="font-medium">
                          {((item.quantity / item.max_capacity) * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setDeleteId(item.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Type *</Label>
                <Input
                  value={form.product_type}
                  onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                  placeholder="e.g., Diesel"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="e.g., litres"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location *</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g., Tank Farm A"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Threshold</Label>
                <Input
                  type="number"
                  value={form.min_threshold}
                  onChange={(e) => setForm({ ...form, min_threshold: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Capacity</Label>
                <Input
                  type="number"
                  value={form.max_capacity}
                  onChange={(e) => setForm({ ...form, max_capacity: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inventory Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Inventory;
