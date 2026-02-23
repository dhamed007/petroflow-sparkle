-- ============================================================
-- ENCRYPT oauth_config.client_secret AT REST
-- ============================================================
--
-- Previous migration (20260223_erp_credential_encryption.sql)
-- encrypted credentials_encrypted, access_token_encrypted, and
-- refresh_token_encrypted.  The oauth_config JSONB column still
-- contained client_secret in plaintext.
--
-- This migration:
--   1. Adds oauth_client_secret_encrypted TEXT column
--   2. Backfills: extracts oauth_config->>'client_secret', encrypts
--      it, stores ciphertext in new column, removes key from JSONB
--   3. Updates get_decrypted_erp_integration() to return the
--      decrypted secret as oauth_client_secret
--   4. Adds CHECK constraint to block plaintext regression
--
-- Idempotent: rows are only processed when oauth_client_secret_encrypted
-- IS NULL (not yet encrypted) AND oauth_config ? 'client_secret'.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. New column for the encrypted OAuth client secret
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.erp_integrations
  ADD COLUMN IF NOT EXISTS oauth_client_secret_encrypted text;


-- ──────────────────────────────────────────────────────────────
-- 2. Backfill: encrypt client_secret and remove it from JSONB
--    in a single UPDATE so the two operations are atomic.
--
--    Idempotency guard: only processes rows where
--      • oauth_config contains 'client_secret' key  AND
--      • oauth_client_secret_encrypted IS NULL (not yet done)
-- ──────────────────────────────────────────────────────────────
UPDATE public.erp_integrations
SET
  oauth_client_secret_encrypted = public.encrypt_secret(
    oauth_config->>'client_secret'
  ),
  oauth_config = oauth_config - 'client_secret'
WHERE
  oauth_config ? 'client_secret'
  AND (oauth_config->>'client_secret') IS NOT NULL
  AND (oauth_config->>'client_secret') <> ''
  AND oauth_client_secret_encrypted IS NULL;   -- idempotency

-- Remove any empty/null client_secret keys left in oauth_config
-- (e.g. integrations that had no client_secret set)
UPDATE public.erp_integrations
SET oauth_config = oauth_config - 'client_secret'
WHERE oauth_config ? 'client_secret';


-- ──────────────────────────────────────────────────────────────
-- 3. Verify no client_secret remains in any oauth_config
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.erp_integrations
  WHERE oauth_config ? 'client_secret';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      '[erp-oauth-encrypt] % row(s) still have plaintext client_secret in oauth_config — aborting.',
      v_remaining;
  END IF;

  RAISE NOTICE '[erp-oauth-encrypt] Verified: no plaintext client_secret remains in oauth_config.';
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. Update get_decrypted_erp_integration() to return
--    oauth_client_secret (decrypted) alongside oauth_config
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_decrypted_erp_integration(
  p_integration_id uuid
)
RETURNS TABLE (
  id                        uuid,
  tenant_id                 uuid,
  name                      text,
  erp_system                text,
  api_endpoint              text,
  api_version               text,
  access_token              text,          -- decrypted
  refresh_token             text,          -- decrypted
  token_type                text,
  token_expires_at          timestamptz,
  credentials               text,          -- decrypted JSON string
  oauth_config              jsonb,         -- non-secret OAuth fields (no client_secret)
  oauth_client_secret       text,          -- decrypted OAuth client secret
  webhook_secret            text,
  connection_status         text,
  is_active                 boolean,
  is_sandbox                boolean,
  last_sync_at              timestamptz
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
    public.decrypt_secret(ei.access_token_encrypted)          AS access_token,
    public.decrypt_secret(ei.refresh_token_encrypted)         AS refresh_token,
    ei.token_type,
    ei.token_expires_at,
    public.decrypt_secret(ei.credentials_encrypted)           AS credentials,
    ei.oauth_config,
    public.decrypt_secret(ei.oauth_client_secret_encrypted)   AS oauth_client_secret,
    ei.webhook_secret,
    ei.connection_status::text,
    ei.is_active,
    ei.is_sandbox,
    ei.last_sync_at
  FROM public.erp_integrations ei
  WHERE ei.id = p_integration_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_decrypted_erp_integration(uuid) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 5. CHECK constraint — block plaintext regression
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_schema    = 'public'
      AND  table_name      = 'erp_integrations'
      AND  constraint_name = 'chk_oauth_client_secret_min_length'
  ) THEN
    ALTER TABLE public.erp_integrations
      ADD CONSTRAINT chk_oauth_client_secret_min_length
        CHECK (oauth_client_secret_encrypted IS NULL OR length(oauth_client_secret_encrypted) > 40);
  END IF;
END $$;
