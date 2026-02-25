
-- Add missing enum values for erp_sync_status
ALTER TYPE public.erp_sync_status ADD VALUE IF NOT EXISTS 'retrying';
ALTER TYPE public.erp_sync_status ADD VALUE IF NOT EXISTS 'dead_letter';
