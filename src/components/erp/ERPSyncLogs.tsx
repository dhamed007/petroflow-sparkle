import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Trash2, RotateCcw } from "lucide-react";

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead_letter', label: 'Dead Letter' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export const ERPSyncLogs = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<any | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      let query = supabase
        .from('erp_sync_logs')
        .select('*, erp_integrations(name, erp_system)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      toast({ title: "Error loading sync logs", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchLogs, 30_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleRetry = async (log: any) => {
    setRetryingIds((prev) => new Set(prev).add(log.id));
    try {
      const { error } = await supabase.functions.invoke('erp-sync', {
        body: {
          integration_id: log.integration_id,
          entity_type: log.entity_type,
          direction: log.sync_direction ?? 'bidirectional',
        },
      });
      if (error) throw error;
      toast({
        title: 'Sync retried',
        description: `${log.entity_type} sync queued for ${log.erp_integrations?.name ?? 'integration'}`,
      });
      fetchLogs();
    } catch (error: any) {
      toast({ title: 'Retry failed', description: error.message, variant: 'destructive' });
    } finally {
      setRetryingIds((prev) => { const s = new Set(prev); s.delete(log.id); return s; });
    }
  };

  const handleDismiss = (log: any) => {
    setDismissTarget(log);
  };

  const handleDismissConfirmed = async () => {
    if (!dismissTarget) return;
    const log = dismissTarget;
    setDismissTarget(null);
    setDismissingIds((prev) => new Set(prev).add(log.id));
    try {
      const { error } = await supabase.from('erp_sync_logs').delete().eq('id', log.id);
      if (error) throw error;
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      toast({ title: 'Log dismissed' });
    } catch (error: any) {
      toast({ title: 'Dismiss failed', description: error.message, variant: 'destructive' });
      setDismissingIds((prev) => { const s = new Set(prev); s.delete(log.id); return s; });
    }
  };

  const getStatusIcon = (status: string) => {
    const map: Record<string, React.ReactNode> = {
      completed: <CheckCircle className="w-5 h-5 text-green-500" />,
      failed: <XCircle className="w-5 h-5 text-red-500" />,
      dead_letter: <XCircle className="w-5 h-5 text-red-700" />,
      in_progress: <Clock className="w-5 h-5 text-blue-500" />,
      retrying: <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />,
      pending: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    };
    return map[status] ?? map.pending;
  };

  const getStatusBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      dead_letter: 'bg-red-800',
      in_progress: 'bg-blue-500',
      retrying: 'bg-orange-500',
      pending: 'bg-yellow-500',
    };
    return map[status] ?? 'bg-gray-500';
  };

  const failedCount = logs.filter((l) => l.sync_status === 'failed').length;
  const deadLetterCount = logs.filter((l) => l.sync_status === 'dead_letter').length;
  const retryingCount = logs.filter((l) => l.sync_status === 'retrying').length;

  if (loading) {
    return <div className="text-center py-8">Loading sync logs...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar + controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-4 text-sm">
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <XCircle className="w-4 h-4" /> {failedCount} failed
            </span>
          )}
          {deadLetterCount > 0 && (
            <span className="flex items-center gap-1 text-red-800 font-medium">
              <XCircle className="w-4 h-4" /> {deadLetterCount} dead-letter
            </span>
          )}
          {retryingCount > 0 && (
            <span className="flex items-center gap-1 text-orange-600 font-medium">
              <RefreshCw className="w-4 h-4" /> {retryingCount} retrying
            </span>
          )}
          {failedCount === 0 && deadLetterCount === 0 && retryingCount === 0 && (
            <span className="text-muted-foreground">All syncs healthy</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchLogs} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No sync logs found</p>
          </CardContent>
        </Card>
      ) : (
        logs.map((log) => (
          <Card
            key={log.id}
            className={
              log.sync_status === 'dead_letter'
                ? 'border-red-800'
                : log.sync_status === 'failed'
                ? 'border-red-400'
                : ''
            }
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {getStatusIcon(log.sync_status)}
                  {log.erp_integrations?.name ?? 'Unknown'} — {log.entity_type}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {log.retry_count != null && (
                    <span className="text-xs text-muted-foreground">
                      {log.retry_count} / {log.max_retries ?? 3} retries
                    </span>
                  )}
                  <Badge className={getStatusBadgeClass(log.sync_status)}>
                    {log.sync_status.replace('_', ' ')}
                  </Badge>
                  {(log.sync_status === 'failed' || log.sync_status === 'dead_letter') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 gap-1"
                      disabled={retryingIds.has(log.id)}
                      onClick={() => handleRetry(log)}
                    >
                      <RotateCcw className="w-3 h-3" />
                      {retryingIds.has(log.id) ? 'Retrying…' : 'Retry'}
                    </Button>
                  )}
                  {log.sync_status === 'dead_letter' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={dismissingIds.has(log.id)}
                      onClick={() => handleDismiss(log)}
                      title="Dismiss"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
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
                  <p className="font-medium">{log.records_processed ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Success / Failed</p>
                  <p className="font-medium">
                    {log.records_succeeded ?? '—'} / {log.records_failed ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Started</p>
                  <p className="font-medium">{new Date(log.started_at).toLocaleString()}</p>
                </div>
              </div>

              {log.error_message && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded">
                  <p className="text-sm font-medium text-red-900 dark:text-red-300">Error</p>
                  <p className="text-xs font-mono text-red-800 dark:text-red-400 mt-1 break-all">
                    {log.error_message}
                  </p>
                </div>
              )}

              {log.completed_at && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Completed {new Date(log.completed_at).toLocaleString()} ·{' '}
                  {Math.round(
                    (new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000
                  )}s duration
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <AlertDialog open={!!dismissTarget} onOpenChange={(open) => { if (!open) setDismissTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Dead-Letter Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete this dead-letter log for{' '}
              <strong>{dismissTarget?.erp_integrations?.name ?? 'unknown'} — {dismissTarget?.entity_type}</strong>?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDismissConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
