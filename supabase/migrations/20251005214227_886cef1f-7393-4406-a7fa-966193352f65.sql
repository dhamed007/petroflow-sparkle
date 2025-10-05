-- Drop the conflicting super admin insert policy
DROP POLICY IF EXISTS "Super admins can insert tenants" ON public.tenants;

-- Recreate a cleaner policy that handles both authenticated users and super admins
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;

CREATE POLICY "Users can create tenants"
ON public.tenants
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');