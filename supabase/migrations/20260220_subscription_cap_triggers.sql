-- Subscription cap enforcement triggers
-- Prevents creating users or trucks beyond the limits of the tenant's active subscription plan.
-- max_users / max_trucks = -1 means unlimited (Enterprise tier).

-- ─────────────────────────────────────────────
-- User cap: fires BEFORE INSERT on profiles
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_user_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_users  INTEGER;
  v_current    INTEGER;
BEGIN
  -- No tenant scoping → skip cap check
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the active/trial plan limit for this tenant
  SELECT sp.max_users
    INTO v_max_users
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
   WHERE ts.tenant_id = NEW.tenant_id
     AND ts.status IN ('active', 'trial')
   LIMIT 1;

  -- No subscription found → no cap enforced
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- -1 means unlimited
  IF v_max_users = -1 THEN
    RETURN NEW;
  END IF;

  -- Count current users in this tenant
  SELECT COUNT(*)
    INTO v_current
    FROM public.profiles
   WHERE tenant_id = NEW.tenant_id;

  IF v_current >= v_max_users THEN
    RAISE EXCEPTION 'User limit reached for your subscription plan (max: %). Upgrade to add more users.', v_max_users;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_user_cap
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_user_cap();

-- ─────────────────────────────────────────────
-- Truck cap: fires BEFORE INSERT on trucks
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_truck_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_trucks INTEGER;
  v_current    INTEGER;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sp.max_trucks
    INTO v_max_trucks
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
   WHERE ts.tenant_id = NEW.tenant_id
     AND ts.status IN ('active', 'trial')
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_max_trucks = -1 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_current
    FROM public.trucks
   WHERE tenant_id = NEW.tenant_id;

  IF v_current >= v_max_trucks THEN
    RAISE EXCEPTION 'Truck limit reached for your subscription plan (max: %). Upgrade to add more trucks.', v_max_trucks;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_truck_cap
  BEFORE INSERT ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.check_truck_cap();
