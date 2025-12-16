-- Fix 1: Add explicit tenant-scoped policy for profiles to prevent cross-tenant access
-- Users should only see profiles within their own tenant

CREATE POLICY "Users can only view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  tenant_id IS NULL AND id = auth.uid()  -- Users without tenant can only see their own
  OR tenant_id = get_user_tenant_id(auth.uid())  -- Users with tenant can see same tenant profiles
);

-- Fix 2: Add SELECT policy for payment_gateways restricting to tenant admins only
CREATE POLICY "Only tenant admins can view payment gateways"
ON public.payment_gateways
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'tenant_admin'::app_role)
);