-- ============================================
-- FIX SECURITY DEFINER VIEW WARNINGS
-- Drop the views and rely only on secure RPC functions
-- ============================================

-- Drop the security definer views (they're not needed since we have RPC functions)
DROP VIEW IF EXISTS public.payment_gateways_decrypted;
DROP VIEW IF EXISTS public.erp_integrations_decrypted;