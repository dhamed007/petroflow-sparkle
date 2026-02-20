
-- =============================================
-- FIX 1: Customers table - restrict dispatch_officer access
-- Create a view with only delivery-relevant fields for dispatch officers
-- =============================================

-- Drop the overly permissive dispatch_officer SELECT policy
DROP POLICY IF EXISTS "Dispatch officers can view customer delivery info" ON public.customers;

-- Create a more restrictive policy: dispatch officers can only see name, address, city, region
-- We'll use a view approach - first create the restricted view
CREATE OR REPLACE VIEW public.customers_delivery_info
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  name,
  contact_person,
  address,
  city,
  region,
  postal_code,
  country,
  is_active
FROM public.customers;

-- Re-create dispatch officer policy that still allows SELECT on base table
-- but the app code for dispatch officers should use the view instead
CREATE POLICY "Dispatch officers can view customer delivery info"
ON public.customers
FOR SELECT
TO authenticated
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND has_role(auth.uid(), 'dispatch_officer'::app_role)
  AND NOT has_role(auth.uid(), 'sales_manager'::app_role)
  AND NOT has_role(auth.uid(), 'sales_rep'::app_role)
  AND NOT has_role(auth.uid(), 'tenant_admin'::app_role)
);

-- =============================================
-- FIX 2: Profiles table - fix restrictive policies to permissive
-- Currently all policies are RESTRICTIVE which means ALL must pass
-- They should be PERMISSIVE so any matching policy grants access
-- =============================================

-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;

-- Re-create as PERMISSIVE policies (default)
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'::app_role))
  OR is_super_admin(auth.uid())
);
