import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, MapPin, Calendar, Package } from 'lucide-react';

interface OrderCardProps {
  order: any;
  onEdit: () => void;
  onDelete: () => void;
}

export function OrderCard({ order, onEdit, onDelete }: OrderCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'pending': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'normal': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Card className="hover:shadow-glow transition-smooth">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-accent" />
            <span>{order.order_number}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusColor(order.status)} className="capitalize">
              {order.status.replace('_', ' ')}
            </Badge>
            <Badge variant={getPriorityColor(order.priority)} className="capitalize">
              {order.priority}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="font-medium">{order.customers?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Product</p>
              <p className="font-medium">{order.product_type}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quantity</p>
              <p className="font-medium">{order.quantity} {order.unit}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{order.delivery_address}</p>
                {(order.delivery_city || order.delivery_region) && (
                  <p className="text-muted-foreground">
                    {[order.delivery_city, order.delivery_region].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {order.requested_delivery_date && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Requested: {new Date(order.requested_delivery_date).toLocaleDateString()}</span>
              </div>
            )}

            {order.notes && (
              <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">
                {order.notes}
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
