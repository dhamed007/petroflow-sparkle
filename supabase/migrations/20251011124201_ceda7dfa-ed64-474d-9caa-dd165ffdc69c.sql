-- Fix 1: Drop the insecure audit_logs INSERT policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Create SECURITY DEFINER function for secure audit logging
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_tenant_id UUID;
BEGIN
  -- Get user's tenant_id
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Insert audit log
  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, user_id, tenant_id,
    old_values, new_values, created_at
  ) VALUES (
    p_action, p_entity_type, p_entity_id,
    auth.uid(), v_tenant_id,
    p_old_values, p_new_values, now()
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_audit_log TO authenticated;

-- Fix 2: Drop overly permissive customer policy and create role-based policies
DROP POLICY IF EXISTS "Users can view customers in their tenant" ON public.customers;

CREATE POLICY "Sales and admin can view customers"
ON public.customers
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND (
    has_role(auth.uid(), 'tenant_admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'sales_rep'::app_role)
  )
);

CREATE POLICY "Dispatch officers can view customer delivery info"
ON public.customers
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND has_role(auth.uid(), 'dispatch_officer'::app_role)
);

-- Fix 3: Add database constraints for orders validation
ALTER TABLE public.orders
ADD CONSTRAINT orders_quantity_positive CHECK (quantity > 0 AND quantity <= 1000000);

ALTER TABLE public.orders
ADD CONSTRAINT orders_delivery_address_length CHECK (length(delivery_address) >= 5 AND length(delivery_address) <= 500);

ALTER TABLE public.orders
ADD CONSTRAINT orders_notes_length CHECK (notes IS NULL OR length(notes) <= 2000);

ALTER TABLE public.orders
ADD CONSTRAINT orders_delivery_city_length CHECK (delivery_city IS NULL OR length(delivery_city) <= 100);

ALTER TABLE public.orders
ADD CONSTRAINT orders_delivery_region_length CHECK (delivery_region IS NULL OR length(delivery_region) <= 100);

-- Fix 4: Secure storage bucket policies
UPDATE storage.buckets 
SET public = false 
WHERE name = 'tenant-logos';

DROP POLICY IF EXISTS "Tenant admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can update their logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view logos" ON storage.objects;

CREATE POLICY "Tenant admins can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos'
  AND (storage.foldername(name))[1] = get_user_tenant_id(auth.uid())::text
  AND has_role(auth.uid(), 'tenant_admin'::app_role)
);

CREATE POLICY "Tenant admins can update their logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND (storage.foldername(name))[1] = get_user_tenant_id(auth.uid())::text
  AND has_role(auth.uid(), 'tenant_admin'::app_role)
);

CREATE POLICY "Authenticated users can view logos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'tenant-logos');