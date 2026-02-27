-- =============================================================================
-- Migration: per-IP rate limiting for the payment initialization endpoint.
--
-- Why: the existing tenant-based rate limit (5/60 s) requires a valid JWT to
-- reach the check. An adversary hammering the endpoint with invalid tokens
-- still hits Supabase auth on every request. This IP-level check runs first,
-- before any JWT validation, shutting down credential-stuffing and enumeration
-- attacks at the edge.
--
-- Design:
--   - ip_hash stores SHA-256(client_ip) — never the raw IP (GDPR / PII).
--   - Each row represents one request within the rate-limit window.
--   - The RPC atomically: counts, inserts (if allowed), prunes old rows.
--   - Window: 20 requests per IP per 300 seconds (5 minutes).
--   - Rows older than 10 minutes are pruned on each successful call.
--   - The table is NOT exposed via the PostgREST API (no SELECT grant to anon).
-- =============================================================================

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_ip_rate_limits (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      TEXT         NOT NULL,
  request_time TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index used by both the count query and the prune DELETE
CREATE INDEX IF NOT EXISTS idx_payment_ip_rl_hash_time
  ON public.payment_ip_rate_limits (ip_hash, request_time DESC);

-- RLS: only the service-role key (used by Edge Functions) may touch this table.
-- Regular authenticated users have no direct access.
ALTER TABLE public.payment_ip_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies → only the service role (which bypasses RLS) can read/write.

-- ─── RPC ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_check_payment_ip_rate_limit(
  p_ip_hash        TEXT,
  p_max_requests   INTEGER DEFAULT 20,
  p_window_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (allowed BOOLEAN, retry_after_secs INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count        INTEGER;
  v_window_start TIMESTAMPTZ;
  v_oldest       TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Count requests from this IP within the current window
  SELECT COUNT(*)
    INTO v_count
    FROM public.payment_ip_rate_limits
   WHERE ip_hash      = p_ip_hash
     AND request_time >= v_window_start;

  IF v_count >= p_max_requests THEN
    -- Compute how long until the oldest request falls out of the window
    SELECT MIN(request_time)
      INTO v_oldest
      FROM public.payment_ip_rate_limits
     WHERE ip_hash      = p_ip_hash
       AND request_time >= v_window_start;

    RETURN QUERY
      SELECT
        FALSE,
        GREATEST(0,
          EXTRACT(EPOCH FROM
            (v_oldest + (p_window_seconds || ' seconds')::INTERVAL - now())
          )::INTEGER
        );
  ELSE
    -- Record this request
    INSERT INTO public.payment_ip_rate_limits (ip_hash, request_time)
    VALUES (p_ip_hash, now());

    -- Prune entries older than 2× the window (keep the table lean)
    DELETE FROM public.payment_ip_rate_limits
     WHERE ip_hash      = p_ip_hash
       AND request_time < now() - ((p_window_seconds * 2) || ' seconds')::INTERVAL;

    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

-- Grant EXECUTE to the service role only (Edge Functions run as service role)
REVOKE ALL ON FUNCTION public.rpc_check_payment_ip_rate_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_payment_ip_rate_limit TO service_role;
