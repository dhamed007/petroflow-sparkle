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
import { FileText, Plus, Edit2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Invoice = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  total_amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  tenant_id: string;
  orders?: { order_number: string } | null;
};

type Order = { id: string; order_number: string };

const statusOptions = ['pending', 'paid', 'overdue', 'cancelled'];

const emptyForm = {
  order_id: '',
  total_amount: '',
  currency: 'NGN',
  status: 'pending',
  due_date: '',
};

const Invoices = () => {
  const { user } = useAuth();
  const { hasAnyRole } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const canManage = hasAnyRole('tenant_admin', 'sales_manager', 'super_admin');

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchInvoices();
  }, [user, navigate]);

  const fetchInvoices = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();
      if (profile?.tenant_id) {
        setTenantId(profile.tenant_id);

        // Fetch orders for the dropdown (admin only)
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, order_number')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false })
          .limit(100);
        setOrders(ordersData || []);
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('*, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading invoices",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingInvoice(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setForm({
      order_id: invoice.order_id || '',
      total_amount: String(invoice.total_amount),
      currency: invoice.currency,
      status: invoice.status,
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.total_amount || !form.currency) {
      toast({ title: 'Please fill in required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        order_id: form.order_id || null,
        total_amount: parseFloat(form.total_amount),
        currency: form.currency,
        status: form.status,
        due_date: form.due_date || null,
      };

      if (form.status === 'paid' && editingInvoice?.status !== 'paid') {
        payload.paid_date = new Date().toISOString();
      }

      if (editingInvoice) {
        const { error } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', editingInvoice.id);
        if (error) throw error;
        toast({ title: 'Invoice updated' });
      } else {
        // Generate invoice number
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        payload.invoice_number = invoiceNumber;
        payload.tenant_id = tenantId;
        const { error } = await supabase
          .from('invoices')
          .insert(payload);
        if (error) throw error;
        toast({ title: `Invoice ${invoiceNumber} created` });
      }

      setDialogOpen(false);
      fetchInvoices();
    } catch (error: any) {
      toast({ title: 'Error saving invoice', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (invoice: Invoice) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_date: new Date().toISOString() })
        .eq('id', invoice.id);
      if (error) throw error;
      toast({ title: `Invoice ${invoice.invoice_number} marked as paid` });
      fetchInvoices();
    } catch (error: any) {
      toast({ title: 'Error updating invoice', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'pending': return 'secondary';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Track payments and billing</p>
          </div>
          {canManage && (
            <Button className="gap-2" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              New Invoice
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No invoices yet</p>
              {canManage && (
                <Button className="mt-4 gap-2" onClick={openAdd}>
                  <Plus className="w-4 h-4" />
                  Create First Invoice
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {invoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{invoice.invoice_number}</span>
                    <Badge variant={getStatusColor(invoice.status)} className="capitalize">
                      {invoice.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Order</p>
                      <p className="font-medium">{invoice.orders?.order_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Amount</p>
                      <p className="font-medium">
                        {invoice.currency} {invoice.total_amount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Due Date</p>
                      <p className="font-medium">
                        {invoice.due_date
                          ? new Date(invoice.due_date).toLocaleDateString()
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Paid Date</p>
                      <p className="font-medium">
                        {invoice.paid_date
                          ? new Date(invoice.paid_date).toLocaleDateString()
                          : 'Unpaid'}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(invoice)}>
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {invoice.status !== 'paid' && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(invoice)}>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Order (optional)</Label>
              <Select value={form.order_id} onValueChange={(v) => setForm({ ...form, order_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select order..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— No order —</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.order_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Amount *</Label>
                <Input
                  type="number"
                  value={form.total_amount}
                  onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency *</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingInvoice ? 'Save Changes' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
