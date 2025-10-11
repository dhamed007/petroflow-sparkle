-- Allow authenticated users to find tenants by slug for joining
CREATE POLICY "Authenticated users can lookup tenants by slug to join"
ON public.tenants
FOR SELECT
TO authenticated
USING (is_active = true);

-- Add index on slug for better performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);