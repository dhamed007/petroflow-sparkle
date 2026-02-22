-- ================================================================
-- ERP ENTERPRISE HARDENING
-- ================================================================
--
-- Changes:
--   1. Add tenant_id to erp_sync_logs (for per-tenant rate limiting)
--   2. Backfill tenant_id from erp_integrations
--   3. Create erp_idempotency_keys (replay / double-submit protection)
--   4. Create audit_logs (idempotent — IF NOT EXISTS)
--   5. Add performance indices
--   6. Schedule hourly idempotency-key cleanup (via pg_cron if available)
--   7. RLS policies for new tables
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. Add tenant_id to erp_sync_logs
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.erp_sync_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ──────────────────────────────────────────────────────────────
-- 2. Backfill tenant_id from parent erp_integrations row
-- ──────────────────────────────────────────────────────────────
UPDATE public.erp_sync_logs sl
SET    tenant_id = ei.tenant_id
FROM   public.erp_integrations ei
WHERE  sl.integration_id = ei.id
  AND  sl.tenant_id IS NULL;

-- ──────────────────────────────────────────────────────────────
-- 3. Index for O(log n) per-tenant rate-limit queries
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_erp_sync_tenant_created
  ON public.erp_sync_logs (tenant_id, created_at DESC);


-- ──────────────────────────────────────────────────────────────
-- 4. Idempotency keys — replay & double-submit protection
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_idempotency_keys (
  key        text        PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_idempotency_tenant_created
  ON public.erp_idempotency_keys (tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.erp_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Only the service role (edge functions) may read/write idempotency keys.
-- No direct client access is needed or safe.
CREATE POLICY "Service role manages idempotency keys"
  ON public.erp_idempotency_keys
  AS PERMISSIVE FOR ALL
  USING (false)
  WITH CHECK (false);


-- ──────────────────────────────────────────────────────────────
-- 5. Audit logs (safe — skipped if table already exists)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  performed_by uuid,
  action_type  text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time
  ON public.audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time
  ON public.audit_logs (action_type, created_at DESC);

-- RLS (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename   = 'audit_logs'
      AND rowsecurity = true
  ) THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Tenant admins may read their own audit trail
-- NOTE: CREATE POLICY IF NOT EXISTS is not valid PostgreSQL syntax;
--       wrap in a DO block with a pg_policies existence check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'audit_logs'
      AND policyname = 'Tenant admins can view their audit logs'
  ) THEN
    CREATE POLICY "Tenant admins can view their audit logs"
      ON public.audit_logs FOR SELECT
      USING (
        tenant_id = get_user_tenant_id(auth.uid())
        AND (
          has_role(auth.uid(), 'tenant_admin'::app_role)
          OR is_super_admin(auth.uid())
        )
      );
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 6. Hourly cleanup of expired idempotency keys (24-hour TTL)
--    Runs only if pg_cron is available; silently skipped otherwise.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Upsert the cron job so re-running the migration is safe
    PERFORM cron.unschedule('erp-idempotency-cleanup');
    PERFORM cron.schedule(
      'erp-idempotency-cleanup',
      '0 * * * *',   -- every hour, on the hour
      $$
        DELETE FROM public.erp_idempotency_keys
        WHERE created_at < now() - interval '24 hours';
      $$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not enabled — skip silently; TTL enforced by application logic
  NULL;
END $$;
