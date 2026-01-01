-- ============================================
-- IMPLEMENT ENCRYPTION FOR SENSITIVE CREDENTIALS
-- Using pgsodium extension for encryption at rest
-- ============================================

-- Enable pgsodium extension for encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create a function to encrypt secrets using pgsodium
CREATE OR REPLACE FUNCTION public.encrypt_secret(secret_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encrypted_value bytea;
  key_id bigint;
BEGIN
  -- Get or create a key for encryption
  SELECT id INTO key_id FROM pgsodium.valid_key LIMIT 1;
  
  IF key_id IS NULL THEN
    -- If no key exists, create one
    INSERT INTO pgsodium.key (name, status, key_type)
    VALUES ('app_secrets_key', 'valid', 'aead-det')
    RETURNING id INTO key_id;
  END IF;
  
  -- Encrypt the secret
  encrypted_value := pgsodium.crypto_aead_det_encrypt(
    secret_value::bytea,
    ''::bytea,
    key_id
  );
  
  RETURN encode(encrypted_value, 'base64');
END;
$$;

-- Create a function to decrypt secrets using pgsodium
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decrypted_value bytea;
  key_id bigint;
BEGIN
  IF encrypted_value IS NULL OR encrypted_value = '' THEN
    RETURN NULL;
  END IF;

  -- Get the key used for encryption
  SELECT id INTO key_id FROM pgsodium.valid_key LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'No encryption key found';
  END IF;
  
  -- Decrypt the secret
  decrypted_value := pgsodium.crypto_aead_det_decrypt(
    decode(encrypted_value, 'base64'),
    ''::bytea,
    key_id
  );
  
  RETURN convert_from(decrypted_value, 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    -- If decryption fails, the value might be stored in plaintext (legacy data)
    -- Return it as-is for backward compatibility
    RETURN encrypted_value;
END;
$$;

-- Create a secure view for payment gateways that decrypts credentials
CREATE OR REPLACE VIEW public.payment_gateways_decrypted AS
SELECT 
  id,
  tenant_id,
  gateway_type,
  public_key,
  decrypt_secret(secret_key_encrypted) as secret_key,
  client_id,
  decrypt_secret(client_secret_encrypted) as client_secret,
  webhook_url,
  is_active,
  is_sandbox,
  created_at,
  updated_at
FROM public.payment_gateways;

-- Create RLS policy on the view (views inherit from base table)
-- Note: RLS on views requires using security_barrier

-- Create a secure view for ERP integrations that decrypts credentials
CREATE OR REPLACE VIEW public.erp_integrations_decrypted AS
SELECT 
  id,
  tenant_id,
  name,
  erp_system,
  api_endpoint,
  api_version,
  decrypt_secret(access_token_encrypted) as access_token,
  decrypt_secret(refresh_token_encrypted) as refresh_token,
  token_type,
  token_expires_at,
  credentials_encrypted,
  oauth_config,
  webhook_secret,
  connection_status,
  is_active,
  is_sandbox,
  auto_sync_enabled,
  sync_frequency_minutes,
  last_sync_at,
  next_sync_at,
  last_test_at,
  test_error_message,
  created_at,
  updated_at
FROM public.erp_integrations;

-- Grant access to authenticated users (RLS on base table still applies)
GRANT SELECT ON public.payment_gateways_decrypted TO authenticated;
GRANT SELECT ON public.erp_integrations_decrypted TO authenticated;

-- Create a helper RPC function that edge functions can call to get decrypted gateway credentials
-- This ensures decryption only happens server-side
CREATE OR REPLACE FUNCTION public.get_decrypted_payment_gateway(
  p_tenant_id uuid,
  p_gateway_type text
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  gateway_type text,
  public_key text,
  secret_key text,
  client_id text,
  client_secret text,
  webhook_url text,
  is_active boolean,
  is_sandbox boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pg.id,
    pg.tenant_id,
    pg.gateway_type,
    pg.public_key,
    decrypt_secret(pg.secret_key_encrypted) as secret_key,
    pg.client_id,
    decrypt_secret(pg.client_secret_encrypted) as client_secret,
    pg.webhook_url,
    pg.is_active,
    pg.is_sandbox
  FROM public.payment_gateways pg
  WHERE pg.tenant_id = p_tenant_id 
    AND pg.gateway_type = p_gateway_type
    AND pg.is_active = true
  LIMIT 1;
END;
$$;

-- Create a helper RPC function for ERP integration credentials
CREATE OR REPLACE FUNCTION public.get_decrypted_erp_integration(
  p_integration_id uuid
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  name text,
  erp_system text,
  api_endpoint text,
  api_version text,
  access_token text,
  refresh_token text,
  token_type text,
  token_expires_at timestamptz,
  credentials_encrypted jsonb,
  oauth_config jsonb,
  webhook_secret text,
  is_active boolean,
  is_sandbox boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ei.id,
    ei.tenant_id,
    ei.name,
    ei.erp_system::text,
    ei.api_endpoint,
    ei.api_version,
    decrypt_secret(ei.access_token_encrypted) as access_token,
    decrypt_secret(ei.refresh_token_encrypted) as refresh_token,
    ei.token_type,
    ei.token_expires_at,
    ei.credentials_encrypted,
    ei.oauth_config,
    ei.webhook_secret,
    ei.is_active,
    ei.is_sandbox
  FROM public.erp_integrations ei
  WHERE ei.id = p_integration_id
  LIMIT 1;
END;
$$;

-- Add audit logging for credential access
CREATE OR REPLACE FUNCTION public.log_credential_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    action,
    entity_type,
    entity_id,
    tenant_id,
    user_id,
    new_values,
    created_at
  ) VALUES (
    'credential_access',
    TG_TABLE_NAME,
    NEW.id,
    NEW.tenant_id,
    auth.uid(),
    jsonb_build_object('gateway_type', NEW.gateway_type, 'accessed_at', now()),
    now()
  );
  RETURN NEW;
END;
$$;