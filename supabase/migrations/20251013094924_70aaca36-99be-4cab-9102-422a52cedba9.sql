-- Allow users to insert their first role when joining an organization
-- This solves the chicken-and-egg problem where new users can't get their first role

CREATE POLICY "Users can insert their first role when joining"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  -- User is assigning role to themselves
  user_id = auth.uid()
  -- Only allow entry-level roles (not admin roles)
  AND role IN ('client', 'driver', 'dispatch_officer', 'sales_rep', 'sales_manager')
  -- Prevent privilege escalation: only if user has no role in this tenant yet
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = user_roles.tenant_id
  )
);