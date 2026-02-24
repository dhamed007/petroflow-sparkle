import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  order?: any;
  canCreateOrder?: boolean;
}

export function OrderDialog({ open, onOpenChange, onSuccess, order, canCreateOrder = true }: OrderDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    customer_id: '',
    product_type: 'Diesel',
    quantity: '',
    unit: 'liters',
    delivery_address: '',
    delivery_city: '',
    delivery_region: '',
    requested_delivery_date: '',
    priority: 'normal',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetchCustomers();
      if (order) {
        setFormData({
          customer_id: order.customer_id || '',
          product_type: order.product_type || 'Diesel',
          quantity: order.quantity?.toString() || '',
          unit: order.unit || 'liters',
          delivery_address: order.delivery_address || '',
          delivery_city: order.delivery_city || '',
          delivery_region: order.delivery_region || '',
          requested_delivery_date: order.requested_delivery_date || '',
          priority: order.priority || 'normal',
          notes: order.notes || '',
        });
      } else {
        resetForm();
      }
    }
  }, [open, order]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    if (data) setCustomers(data);
  };

  const resetForm = () => {
    setFormData({
      customer_id: '',
      product_type: 'Diesel',
      quantity: '',
      unit: 'liters',
      delivery_address: '',
      delivery_city: '',
      delivery_region: '',
      requested_delivery_date: '',
      priority: 'normal',
      notes: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!order && !canCreateOrder) {
      toast({
        title: 'Monthly order limit reached',
        description: 'Upgrade your plan to create more orders this month.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile?.tenant_id) throw new Error('No tenant found');

      const orderData = {
        ...formData,
        quantity: parseFloat(formData.quantity),
        tenant_id: profile.tenant_id,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        order_number: order?.order_number || `ORD-${Date.now()}`,
        status: order?.status || 'pending',
      };

      if (order) {
        const { error } = await supabase
          .from('orders')
          .update(orderData)
          .eq('id', order.id);
        
        if (error) throw error;
        
        toast({ title: 'Order updated successfully' });
      } else {
        const { error } = await supabase
          .from('orders')
          .insert([orderData]);
        
        if (error) throw error;
        
        toast({ title: 'Order created successfully' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Error saving order',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? 'Edit Order' : 'Create New Order'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                required
              >
                <SelectTrigger id="customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product Type *</Label>
              <Select
                value={formData.product_type}
                onValueChange={(value) => setFormData({ ...formData, product_type: value })}
                required
              >
                <SelectTrigger id="product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Diesel">Diesel</SelectItem>
                  <SelectItem value="Petrol">Petrol</SelectItem>
                  <SelectItem value="Kerosene">Kerosene</SelectItem>
                  <SelectItem value="Jet Fuel">Jet Fuel</SelectItem>
                  <SelectItem value="Lubricants">Lubricants</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Select
                value={formData.unit}
                onValueChange={(value) => setFormData({ ...formData, unit: value })}
                required
              >
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="liters">Liters</SelectItem>
                  <SelectItem value="gallons">Gallons</SelectItem>
                  <SelectItem value="barrels">Barrels</SelectItem>
                  <SelectItem value="tons">Tons</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_date">Requested Delivery Date</Label>
              <Input
                id="delivery_date"
                type="date"
                value={formData.requested_delivery_date}
                onChange={(e) => setFormData({ ...formData, requested_delivery_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Delivery Address *</Label>
            <Input
              id="address"
              value={formData.delivery_address}
              onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.delivery_city}
                onChange={(e) => setFormData({ ...formData, delivery_city: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={formData.delivery_region}
                onChange={(e) => setFormData({ ...formData, delivery_region: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : order ? 'Update Order' : 'Create Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
