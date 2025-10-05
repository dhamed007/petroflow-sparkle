-- Fix the tenants insert policy to properly check for authenticated users
DROP POLICY IF EXISTS "Users can create tenants" ON public.tenants;

CREATE POLICY "Users can create tenants"
ON public.tenants
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);