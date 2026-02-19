-- Add retry tracking columns to erp_sync_logs
ALTER TABLE public.erp_sync_logs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add index for finding retryable sync logs
CREATE INDEX IF NOT EXISTS idx_erp_sync_logs_retrying
  ON public.erp_sync_logs(sync_status)
  WHERE sync_status IN ('retrying', 'dead_letter');
