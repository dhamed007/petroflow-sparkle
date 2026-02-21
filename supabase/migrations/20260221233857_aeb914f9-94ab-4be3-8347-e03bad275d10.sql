
-- =============================================
-- FIX 1: Tenant enumeration vulnerability
-- Create RPC for slug lookup, restrict SELECT policy
-- =============================================

-- Create secure slug lookup function (returns minimal data)
CREATE OR REPLACE FUNCTION public.lookup_tenant_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  industry text,
  logo_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.slug,
    t.industry,
    t.logo_url
  FROM public.tenants t
  WHERE t.slug = p_slug
    AND t.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_tenant_by_slug TO authenticated;

-- Drop the overly broad SELECT policy
DROP POLICY IF EXISTS "Authenticated users can lookup tenants by slug to join" ON public.tenants;

-- =============================================
-- FIX 3: Customers email/phone exposure to dispatch
-- The existing "Dispatch officers can view customer delivery info" policy
-- grants SELECT on the full customers table. We need to ensure dispatch
-- officers query through the customers_delivery_info view instead.
-- The RLS policy already exists and is RESTRICTIVE, meaning dispatch
-- officers CAN query the customers table but only see rows matching.
-- However, they still see email/phone columns. We'll revoke and re-route.
-- =============================================

-- Drop the dispatch officer policy on customers (they should use the view)
DROP POLICY IF EXISTS "Dispatch officers can view customer delivery info" ON public.customers;
