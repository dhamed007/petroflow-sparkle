
-- Migration 1: IP Rate Limiting
CREATE TABLE IF NOT EXISTS public.payment_ip_rate_limits (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      TEXT         NOT NULL,
  request_time TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_ip_rl_hash_time
  ON public.payment_ip_rate_limits (ip_hash, request_time DESC);

ALTER TABLE public.payment_ip_rate_limits ENABLE ROW LEVEL SECURITY;

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

  SELECT COUNT(*) INTO v_count
    FROM public.payment_ip_rate_limits
   WHERE ip_hash = p_ip_hash AND request_time >= v_window_start;

  IF v_count >= p_max_requests THEN
    SELECT MIN(request_time) INTO v_oldest
      FROM public.payment_ip_rate_limits
     WHERE ip_hash = p_ip_hash AND request_time >= v_window_start;

    RETURN QUERY SELECT FALSE,
      GREATEST(0, EXTRACT(EPOCH FROM
        (v_oldest + (p_window_seconds || ' seconds')::INTERVAL - now()))::INTEGER);
  ELSE
    INSERT INTO public.payment_ip_rate_limits (ip_hash, request_time)
    VALUES (p_ip_hash, now());

    DELETE FROM public.payment_ip_rate_limits
     WHERE ip_hash = p_ip_hash
       AND request_time < now() - ((p_window_seconds * 2) || ' seconds')::INTERVAL;

    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_payment_ip_rate_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_payment_ip_rate_limit TO service_role;

-- Migration 2: Atomic Payment Activation
CREATE OR REPLACE FUNCTION public.complete_payment_and_activate_subscription(
  p_transaction_reference TEXT,
  p_gateway_response       JSONB,
  p_invoice_id             UUID    DEFAULT NULL,
  p_plan_id                UUID    DEFAULT NULL,
  p_tenant_id              UUID    DEFAULT NULL,
  p_billing_cycle          TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id      UUID;
  v_tx_status  TEXT;
  v_sub_id     UUID;
  v_period_end TIMESTAMPTZ;
BEGIN
  SELECT id, status INTO v_tx_id, v_tx_status
    FROM public.payment_transactions
   WHERE transaction_reference = p_transaction_reference
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found');
  END IF;

  IF v_tx_status = 'success' THEN
    SELECT (gateway_response->>'subscription_id')::UUID INTO v_sub_id
      FROM public.payment_transactions WHERE id = v_tx_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'subscription_id', v_sub_id);
  END IF;

  UPDATE public.payment_transactions
     SET status = 'success', paid_at = now(), gateway_response = p_gateway_response
   WHERE id = v_tx_id;

  IF p_invoice_id IS NOT NULL THEN
    UPDATE public.invoices SET status = 'paid', paid_date = now()
     WHERE id = p_invoice_id;
  END IF;

  IF p_plan_id IS NOT NULL AND p_tenant_id IS NOT NULL AND p_billing_cycle IS NOT NULL THEN
    v_period_end := CASE
      WHEN p_billing_cycle = 'annual' THEN now() + INTERVAL '1 year'
      ELSE now() + INTERVAL '1 month'
    END;

    INSERT INTO public.tenant_subscriptions
      (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
    VALUES
      (p_tenant_id, p_plan_id, 'active', p_billing_cycle, now(), v_period_end)
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_id              = EXCLUDED.plan_id,
      status               = 'active',
      billing_cycle        = EXCLUDED.billing_cycle,
      current_period_start = now(),
      current_period_end   = v_period_end,
      updated_at           = now()
    RETURNING id INTO v_sub_id;

    UPDATE public.payment_transactions SET subscription_id = v_sub_id WHERE id = v_tx_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'subscription_id', v_sub_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_and_activate_subscription FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_activate_subscription TO service_role;

ALTER TABLE public.tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_tenant_id_unique;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_tenant_id_unique UNIQUE (tenant_id);
