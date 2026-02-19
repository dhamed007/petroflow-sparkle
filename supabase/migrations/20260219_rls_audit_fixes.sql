-- RLS Audit Fix: Scope audit_logs INSERT to user's tenant
-- Previously: WITH CHECK (true) allowed any authenticated user to insert logs for any tenant
-- Fix: Ensure inserted audit_logs match the user's tenant_id

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "Users can insert audit logs for their tenant"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Also allow service role to insert (for Edge Functions / triggers)
-- Service role bypasses RLS by default, so no explicit policy needed.

-- Add index on trucks.assigned_driver_id for GPS tracking performance
CREATE INDEX IF NOT EXISTS idx_trucks_assigned_driver_id ON public.trucks(assigned_driver_id);

-- Add index on deliveries.driver_id for driver dashboard performance
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON public.deliveries(driver_id);
