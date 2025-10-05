import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Deliveries = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    fetchDeliveries();
  }, [user, navigate]);

  const fetchDeliveries = async () => {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDeliveries(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading deliveries",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Deliveries</h1>
          <p className="text-muted-foreground">Track delivery status</p>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading deliveries...</div>
        ) : deliveries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No deliveries yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {deliveries.map((delivery) => (
              <Card key={delivery.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Order #{delivery.orders?.order_number}</span>
                    <span className="text-sm font-normal text-muted-foreground capitalize">
                      {delivery.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Vehicle</p>
                      <p className="font-medium">{delivery.vehicle_number || 'Not assigned'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Departure</p>
                      <p className="font-medium">
                        {delivery.departure_time 
                          ? new Date(delivery.departure_time).toLocaleString()
                          : 'Not scheduled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Arrival</p>
                      <p className="font-medium">
                        {delivery.arrival_time 
                          ? new Date(delivery.arrival_time).toLocaleString()
                          : 'Pending'}
                      </p>
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

export default Deliveries;
