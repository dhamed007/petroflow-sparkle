
-- Re-apply RLS audit fix (idempotent)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert audit logs for their tenant" ON public.audit_logs;

CREATE POLICY "Users can insert audit logs for their tenant"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_trucks_driver_id ON public.trucks(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON public.deliveries(driver_id);

-- ERP retry columns (idempotent)
ALTER TABLE public.erp_sync_logs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Index using new enum values
CREATE INDEX IF NOT EXISTS idx_erp_sync_logs_retrying
  ON public.erp_sync_logs(sync_status)
  WHERE sync_status IN ('retrying', 'dead_letter');

-- Subscription cap triggers
CREATE OR REPLACE FUNCTION public.check_user_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max_users INTEGER; v_current INTEGER;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT sp.max_users INTO v_max_users FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
   WHERE ts.tenant_id = NEW.tenant_id AND ts.status IN ('active', 'trial') LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_max_users = -1 THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_current FROM public.profiles WHERE tenant_id = NEW.tenant_id;
  IF v_current >= v_max_users THEN
    RAISE EXCEPTION 'User limit reached for your subscription plan (max: %). Upgrade to add more users.', v_max_users;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS enforce_user_cap ON public.profiles;
CREATE TRIGGER enforce_user_cap BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_user_cap();

CREATE OR REPLACE FUNCTION public.check_truck_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max_trucks INTEGER; v_current INTEGER;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT sp.max_trucks INTO v_max_trucks FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
   WHERE ts.tenant_id = NEW.tenant_id AND ts.status IN ('active', 'trial') LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_max_trucks = -1 THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_current FROM public.trucks WHERE tenant_id = NEW.tenant_id;
  IF v_current >= v_max_trucks THEN
    RAISE EXCEPTION 'Truck limit reached for your subscription plan (max: %). Upgrade to add more trucks.', v_max_trucks;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS enforce_truck_cap ON public.trucks;
CREATE TRIGGER enforce_truck_cap BEFORE INSERT ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.check_truck_cap();
