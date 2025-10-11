import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Settings, RefreshCw, Activity, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ERPConnectForm } from "@/components/erp/ERPConnectForm";
import { ERPFieldMapping } from "@/components/erp/ERPFieldMapping";
import { ERPSyncLogs } from "@/components/erp/ERPSyncLogs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ERPIntegrations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchIntegrations();
  }, [user, navigate]);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('erp_integrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIntegrations(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading integrations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (integrationId: string) => {
    try {
      toast({ title: "Testing connection..." });
      
      // This would call the erp-connect function to test
      const { data, error } = await supabase.functions.invoke('erp-connect', {
        body: { test: true, integration_id: integrationId }
      });

      if (error) throw error;

      toast({ 
        title: "Connection successful!", 
        description: "ERP connection is working properly"
      });
      
      fetchIntegrations();
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSync = async (integrationId: string, entityType: string) => {
    try {
      toast({ title: "Starting sync..." });
      
      const { data, error } = await supabase.functions.invoke('erp-sync', {
        body: {
          integration_id: integrationId,
          entity_type: entityType,
          direction: 'bidirectional'
        }
      });

      if (error) throw error;

      toast({ 
        title: "Sync completed", 
        description: `${data.result.records_succeeded} records synced successfully`
      });
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getERPIcon = (system: string) => {
    const icons: any = {
      sap: '🟦',
      odoo: '🟣',
      quickbooks: '🟢',
      sage: '🟡',
      dynamics365: '🔵',
      custom_api: '⚙️',
    };
    return icons[system] || '🔗';
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      connected: 'bg-green-500',
      disconnected: 'bg-gray-500',
      error: 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading ERP integrations...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">ERP Integrations</h1>
            <p className="text-muted-foreground">Connect and sync with your ERP systems</p>
          </div>
          <Button onClick={() => setConnectDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Connect ERP
          </Button>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="integrations">Active Integrations</TabsTrigger>
            <TabsTrigger value="logs">Sync Logs</TabsTrigger>
            <TabsTrigger value="health">Health Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations">
            {integrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    No ERP integrations configured yet
                  </p>
                  <Button onClick={() => setConnectDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Connect Your First ERP
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {integrations.map((integration) => (
                  <Card key={integration.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <span className="text-2xl">{getERPIcon(integration.erp_system)}</span>
                          {integration.name}
                        </CardTitle>
                        <Badge className={getStatusColor(integration.connection_status)}>
                          {integration.connection_status}
                        </Badge>
                      </div>
                      <CardDescription className="capitalize">
                        {integration.erp_system.replace('_', ' ')} • 
                        {integration.is_sandbox ? ' Sandbox' : ' Production'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Last Sync:</span>{' '}
                          {integration.last_sync_at 
                            ? new Date(integration.last_sync_at).toLocaleString()
                            : 'Never'}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Auto-sync:</span>{' '}
                          {integration.auto_sync_enabled ? 'Enabled' : 'Disabled'}
                          {integration.auto_sync_enabled && ` (${integration.sync_frequency_minutes}min)`}
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleTestConnection(integration.id)}
                          >
                            Test Connection
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedIntegration(integration);
                              setMappingDialogOpen(true);
                            }}
                          >
                            <Settings className="w-4 h-4 mr-1" />
                            Configure
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => handleSync(integration.id, 'orders')}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Sync Now
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs">
            <ERPSyncLogs />
          </TabsContent>

          <TabsContent value="health">
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-500" />
                    Active Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {integrations.filter(i => i.connection_status === 'connected').length}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    of {integrations.length} total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-blue-500" />
                    Auto-sync Enabled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {integrations.filter(i => i.auto_sync_enabled).length}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    integrations syncing
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    Connection Errors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {integrations.filter(i => i.connection_status === 'error').length}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    require attention
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect ERP System</DialogTitle>
          </DialogHeader>
          <ERPConnectForm 
            onSuccess={() => {
              setConnectDialogOpen(false);
              fetchIntegrations();
            }}
          />
        </DialogContent>
      </Dialog>

      {selectedIntegration && (
        <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Field Mapping - {selectedIntegration.name}</DialogTitle>
            </DialogHeader>
            <ERPFieldMapping 
              integrationId={selectedIntegration.id}
              erpSystem={selectedIntegration.erp_system}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ERPIntegrations;