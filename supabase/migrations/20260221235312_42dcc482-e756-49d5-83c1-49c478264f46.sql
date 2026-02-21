
-- 1. Create a safe view for payment_gateways that excludes encrypted credentials
CREATE OR REPLACE VIEW public.payment_gateways_safe AS
SELECT 
  id, tenant_id, gateway_type, public_key, client_id,
  webhook_url, is_active, is_sandbox, created_at, updated_at,
  (secret_key_encrypted IS NOT NULL AND secret_key_encrypted != '') as has_secret_key,
  (client_secret_encrypted IS NOT NULL AND client_secret_encrypted != '') as has_client_secret
FROM public.payment_gateways;

-- Grant access to the view
GRANT SELECT ON public.payment_gateways_safe TO authenticated;

-- 2. Fix notifications INSERT policy - restrict to self-notifications only
-- (System triggers use SECURITY DEFINER and bypass RLS, so they don't need this policy)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Users can create own notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND tenant_id = get_user_tenant_id(auth.uid())
);
