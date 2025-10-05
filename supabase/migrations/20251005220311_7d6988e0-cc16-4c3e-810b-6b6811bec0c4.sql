-- Fix profiles table RLS to prevent unauthorized access to user contact information
-- Drop the overly permissive policy that allows any tenant member to view all profiles
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

-- Create a more restrictive policy: only tenant admins can view other profiles in their tenant
CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'::app_role))
  OR is_super_admin(auth.uid())
);

-- The existing "Users can view their own profile" policy remains unchanged
-- This ensures users can still see their own profile data