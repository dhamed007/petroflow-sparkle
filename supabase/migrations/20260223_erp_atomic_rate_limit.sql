-- ================================================================
-- ERP SECURITY PATCH — ATOMIC RATE LIMITING & IDEMPOTENCY PK FIX
-- ================================================================
--
-- Fixes three weaknesses identified in the security audit:
--
--  W-2  TOCTOU in sync rate limit  — replace COUNT+check with
--       SELECT FOR UPDATE on a per-tenant state row so concurrent
--       Deno isolates serialize at the DB level.
--
--  W-3  TOCTOU in AI rate limit    — same pattern for AI cost cap.
--
--  W-4  Idempotency key PK design  — change PRIMARY KEY from
--       (key) to (tenant_id, key) so each tenant has its own
--       key namespace; a cross-tenant upsert can no longer stomp
--       another tenant's replay protection record.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. Fix erp_idempotency_keys: composite primary key
--    (tenant_id, key) prevents cross-tenant key stomping.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only run if the old single-column PK still exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'erp_idempotency_keys'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'erp_idempotency_keys_pkey'
  ) THEN
    ALTER TABLE public.erp_idempotency_keys DROP CONSTRAINT erp_idempotency_keys_pkey;
    ALTER TABLE public.erp_idempotency_keys ADD PRIMARY KEY (tenant_id, key);
  END IF;
END $$;

-- If the table was created fresh (original migration skipped), create it correctly.
CREATE TABLE IF NOT EXISTS public.erp_idempotency_keys (
  tenant_id  uuid        NOT NULL,
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_erp_idempotency_tenant_created
  ON public.erp_idempotency_keys (tenant_id, created_at DESC);

ALTER TABLE public.erp_idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'erp_idempotency_keys'
      AND policyname = 'Service role manages idempotency keys'
  ) THEN
    CREATE POLICY "Service role manages idempotency keys"
      ON public.erp_idempotency_keys
      AS PERMISSIVE FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 2. Sync rate-limit state table
--    One row per tenant; SELECT FOR UPDATE serialises concurrent
--    Deno isolates within the same Postgres transaction.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_sync_rate_state (
  tenant_id        uuid        PRIMARY KEY,
  last_sync_at     timestamptz,                       -- 60-second window gate
  sync_count_1h    integer     NOT NULL DEFAULT 0,    -- hourly counter
  window_start_1h  timestamptz NOT NULL DEFAULT now() -- when current hourly window began
);

ALTER TABLE public.erp_sync_rate_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'erp_sync_rate_state'
      AND policyname = 'Service role manages sync rate state'
  ) THEN
    CREATE POLICY "Service role manages sync rate state"
      ON public.erp_sync_rate_state
      AS PERMISSIVE FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3. AI rate-limit state table
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_ai_rate_state (
  tenant_id        uuid        PRIMARY KEY,
  ai_count_1h      integer     NOT NULL DEFAULT 0,
  window_start_1h  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_ai_rate_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'erp_ai_rate_state'
      AND policyname = 'Service role manages AI rate state'
  ) THEN
    CREATE POLICY "Service role manages AI rate state"
      ON public.erp_ai_rate_state
      AS PERMISSIVE FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. Atomic sync rate-limit check + claim
--
--    Returns TABLE(allowed boolean, retry_after_secs integer).
--    SELECT FOR UPDATE on the tenant row serialises every
--    concurrent Deno isolate that calls this function for the
--    same tenant — eliminating the TOCTOU race.
--
--    Limits: 1 sync per 60 s  AND  30 syncs per hour.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_check_erp_sync_rate_limit(p_tenant_id uuid)
RETURNS TABLE(allowed boolean, retry_after_secs integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec     erp_sync_rate_state%ROWTYPE;
  now_ts  timestamptz := clock_timestamp();
BEGIN
  -- Ensure a state row exists for this tenant (no-op if already present).
  INSERT INTO erp_sync_rate_state (tenant_id, last_sync_at, sync_count_1h, window_start_1h)
  VALUES (p_tenant_id, NULL, 0, now_ts)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Lock the row — subsequent concurrent calls for this tenant will WAIT here
  -- until this transaction commits, guaranteeing a consistent count.
  SELECT * INTO rec
  FROM erp_sync_rate_state
  WHERE erp_sync_rate_state.tenant_id = p_tenant_id
  FOR UPDATE;

  -- Reset hourly window if it has expired.
  IF rec.window_start_1h < now_ts - INTERVAL '1 hour' THEN
    rec.sync_count_1h   := 0;
    rec.window_start_1h := now_ts;
  END IF;

  -- 60-second cooldown check.
  IF rec.last_sync_at IS NOT NULL
     AND rec.last_sync_at >= now_ts - INTERVAL '60 seconds' THEN
    RETURN QUERY SELECT false, 60;
    RETURN;
  END IF;

  -- Hourly cap check.
  IF rec.sync_count_1h >= 30 THEN
    RETURN QUERY SELECT false, 3600;
    RETURN;
  END IF;

  -- Claim the slot atomically.
  UPDATE erp_sync_rate_state
  SET last_sync_at    = now_ts,
      sync_count_1h   = rec.sync_count_1h + 1,
      window_start_1h = rec.window_start_1h
  WHERE erp_sync_rate_state.tenant_id = p_tenant_id;

  RETURN QUERY SELECT true, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_check_erp_sync_rate_limit(uuid)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 5. Atomic AI rate-limit check + claim
--
--    Limit: 10 AI mapping calls per tenant per hour.
--    The slot is claimed HERE — before the AI API call —
--    so a concurrent burst cannot bypass the cost cap.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_check_ai_rate_limit(p_tenant_id uuid)
RETURNS TABLE(allowed boolean, retry_after_secs integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec     erp_ai_rate_state%ROWTYPE;
  now_ts  timestamptz := clock_timestamp();
BEGIN
  INSERT INTO erp_ai_rate_state (tenant_id, ai_count_1h, window_start_1h)
  VALUES (p_tenant_id, 0, now_ts)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO rec
  FROM erp_ai_rate_state
  WHERE erp_ai_rate_state.tenant_id = p_tenant_id
  FOR UPDATE;

  IF rec.window_start_1h < now_ts - INTERVAL '1 hour' THEN
    rec.ai_count_1h     := 0;
    rec.window_start_1h := now_ts;
  END IF;

  IF rec.ai_count_1h >= 10 THEN
    RETURN QUERY SELECT false, 3600;
    RETURN;
  END IF;

  UPDATE erp_ai_rate_state
  SET ai_count_1h     = rec.ai_count_1h + 1,
      window_start_1h = rec.window_start_1h
  WHERE erp_ai_rate_state.tenant_id = p_tenant_id;

  RETURN QUERY SELECT true, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_check_ai_rate_limit(uuid)
  TO authenticated, service_role;
