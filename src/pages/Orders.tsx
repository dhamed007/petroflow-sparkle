import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Package, Search, UserPlus } from "lucide-react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OrderDialog } from "@/components/orders/OrderDialog";
import { OrderCard } from "@/components/orders/OrderCard";
import { AssignmentDialog } from "@/components/orders/AssignmentDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const Orders = () => {
  const { user } = useAuth();
  const { hasAnyRole } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { limits, usage, canCreateOrder } = useSubscriptionLimits();
  const [orders, setOrders] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [assignmentDialog, setAssignmentDialog] = useState<{ open: boolean; order: any }>({ open: false, order: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    fetchOrders();
  }, [user, navigate]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading orders",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = [...orders];
    
    if (searchTerm) {
      filtered = filtered.filter(order => 
        order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.product_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    setFilteredOrders(filtered);
  };

  const handleCreateOrder = () => {
    setEditingOrder(null);
    setDialogOpen(true);
  };

  const handleEditOrder = (order: any) => {
    setEditingOrder(order);
    setDialogOpen(true);
  };

  const handleDeleteClick = (orderId: string) => {
    setDeleteDialog({ open: true, orderId });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.orderId) return;

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', deleteDialog.orderId);

      if (error) throw error;

      toast({ title: 'Order deleted successfully' });
      fetchOrders();
    } catch (error: any) {
      toast({
        title: 'Error deleting order',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeleteDialog({ open: false, orderId: null });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="text-muted-foreground">Manage customer orders</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {limits && usage && (
              <span className="text-sm text-muted-foreground">
                {usage.monthly_orders} / {limits.max_monthly_transactions} orders this month
              </span>
            )}
            <Button
              className="gap-2"
              disabled={!canCreateOrder}
              onClick={handleCreateOrder}
            >
              <Plus className="w-4 h-4" />
              New Order
            </Button>
            {!canCreateOrder && (
              <p className="text-xs text-destructive">
                Monthly order limit reached.{' '}
                <button
                  className="underline font-medium"
                  onClick={() => navigate('/subscriptions')}
                >
                  Upgrade plan
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders, customers, or products..."
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {orders.length === 0 ? 'No orders yet. Create your first order!' : 'No orders match your filters'}
              </p>
              {orders.length === 0 && (
                <Button className="mt-4" onClick={handleCreateOrder}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Order
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="relative">
                <OrderCard
                  order={order}
                  onEdit={() => handleEditOrder(order)}
                  onDelete={() => handleDeleteClick(order.id)}
                />
                {order.status === 'pending' && hasAnyRole('tenant_admin', 'dispatch_officer', 'sales_manager', 'super_admin') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-4 right-24 gap-1"
                    onClick={() => setAssignmentDialog({ open: true, order })}
                  >
                    <UserPlus className="w-4 h-4" />
                    Assign
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <OrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchOrders}
        order={editingOrder}
        canCreateOrder={canCreateOrder}
      />

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignmentDialog
        open={assignmentDialog.open}
        onOpenChange={(open) => setAssignmentDialog({ ...assignmentDialog, open })}
        order={assignmentDialog.order}
        onSuccess={fetchOrders}
      />
    </div>
  );
};

export default Orders;
