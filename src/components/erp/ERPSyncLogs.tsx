import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

export const ERPSyncLogs = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('erp_sync_logs')
        .select('*, erp_integrations(name, erp_system)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading sync logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    const icons: any = {
      completed: <CheckCircle className="w-5 h-5 text-green-500" />,
      failed: <XCircle className="w-5 h-5 text-red-500" />,
      in_progress: <Clock className="w-5 h-5 text-blue-500" />,
      pending: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    };
    return icons[status] || icons.pending;
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      in_progress: 'bg-blue-500',
      pending: 'bg-yellow-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return <div className="text-center py-8">Loading sync logs...</div>;
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No sync logs yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <Card key={log.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {getStatusIcon(log.sync_status)}
                {log.erp_integrations?.name} - {log.entity_type}
              </CardTitle>
              <Badge className={getStatusColor(log.sync_status)}>
                {log.sync_status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Direction</p>
                <p className="font-medium capitalize">{log.sync_direction}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Records Processed</p>
                <p className="font-medium">{log.records_processed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Success / Failed</p>
                <p className="font-medium">
                  {log.records_succeeded} / {log.records_failed}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Started</p>
                <p className="font-medium">
                  {new Date(log.started_at).toLocaleString()}
                </p>
              </div>
            </div>
            
            {log.error_message && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-900 font-medium">Error:</p>
                <p className="text-sm text-red-800">{log.error_message}</p>
              </div>
            )}

            {log.completed_at && (
              <p className="mt-4 text-xs text-muted-foreground">
                Completed: {new Date(log.completed_at).toLocaleString()} 
                (Duration: {Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s)
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};