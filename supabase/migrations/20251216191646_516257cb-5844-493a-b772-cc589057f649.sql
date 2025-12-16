-- Fix profiles: Drop any remaining permissive policies and ensure strict access
DROP POLICY IF EXISTS "Users can view own profile or same tenant profiles" ON public.profiles;

-- Verify only these two policies exist for SELECT:
-- 1. Users can view their own profile (id = auth.uid())
-- 2. Tenant admins can view profiles in their tenant