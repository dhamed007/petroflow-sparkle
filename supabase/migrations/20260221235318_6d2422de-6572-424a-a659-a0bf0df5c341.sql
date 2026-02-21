
-- Fix the view to use security invoker so RLS of the querying user is applied
CREATE OR REPLACE VIEW public.payment_gateways_safe 
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, gateway_type, public_key, client_id,
  webhook_url, is_active, is_sandbox, created_at, updated_at,
  (secret_key_encrypted IS NOT NULL AND secret_key_encrypted != '') as has_secret_key,
  (client_secret_encrypted IS NOT NULL AND client_secret_encrypted != '') as has_client_secret
FROM public.payment_gateways;
