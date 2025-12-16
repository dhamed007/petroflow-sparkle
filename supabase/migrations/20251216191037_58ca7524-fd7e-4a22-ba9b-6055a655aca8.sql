-- Drop existing policies first
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;

-- Recreate with proper restrictions
CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'::app_role))
  OR is_super_admin(auth.uid())
);