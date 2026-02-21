
-- Fix: customers_delivery_info view has no RLS
-- Views with security_invoker inherit the calling user's permissions,
-- but we need explicit RLS on the underlying table or use security_definer.
-- Since this is a view (not a table), we need to recreate it with security_invoker = true
-- so it respects the customers table RLS policies.

-- Drop and recreate the view with security_invoker enabled
DROP VIEW IF EXISTS public.customers_delivery_info;

CREATE VIEW public.customers_delivery_info
WITH (security_invoker = true) AS
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

-- Grant access to authenticated users
GRANT SELECT ON public.customers_delivery_info TO authenticated;
