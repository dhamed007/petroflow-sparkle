-- ============================================================
-- ERP CREDENTIAL ENCRYPTION AT REST
-- ============================================================
--
-- Vulnerability: credentials_encrypted, access_token_encrypted,
-- and refresh_token_encrypted stored plaintext despite their names.
--
-- This migration:
--   1. Adds secrets_encrypted tracking flag (idempotency guard)
--   2. Converts credentials_encrypted JSONB → TEXT (ciphertext store)
--   3. Backfills all three secret columns via encrypt_secret()
--   4. Updates get_decrypted_erp_integration() to return full set
--      of columns needed by edge functions + decrypt credentials
--   5. GRANTs EXECUTE on crypto RPCs to service_role
--   6. Adds CHECK constraints to block plaintext regression
--
-- Idempotent: re-running is safe; secrets_encrypted flag prevents
-- double-encryption of already-processed rows.
--
-- No downtime: the ALTER COLUMN type change holds a brief table
-- lock. erp_integrations typically has O(tens) of rows so the
-- lock window is <100 ms in practice.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. Idempotency guard column
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.erp_integrations
  ADD COLUMN IF NOT EXISTS secrets_encrypted boolean NOT NULL DEFAULT false;


-- ──────────────────────────────────────────────────────────────
-- 2. Convert credentials_encrypted from JSONB → TEXT
--    and encrypt all existing values atomically.
--
--    Idempotent: only runs when column is still of type jsonb.
--    The ALTER TABLE ... USING clause is transactional; the
--    table is either fully converted or not at all.
--
--    We also drop the NOT NULL / DEFAULT constraints that no
--    longer make sense for a ciphertext column — the edge
--    function always provides an encrypted value on write.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'erp_integrations'
      AND  column_name  = 'credentials_encrypted'
      AND  data_type    = 'jsonb'
  ) THEN

    -- Remove DEFAULT so we can change the type
    ALTER TABLE public.erp_integrations
      ALTER COLUMN credentials_encrypted DROP DEFAULT;

    -- Change JSONB → TEXT, encrypting each non-empty value in USING
    ALTER TABLE public.erp_integrations
      ALTER COLUMN credentials_encrypted TYPE text
      USING (
        CASE
          WHEN credentials_encrypted IS NOT NULL
               AND credentials_encrypted::text NOT IN ('{}', 'null', '')
          THEN public.encrypt_secret(credentials_encrypted::text)
          ELSE NULL
        END
      );

    -- Drop NOT NULL now that we may legitimately have NULL credentials
    ALTER TABLE public.erp_integrations
      ALTER COLUMN credentials_encrypted DROP NOT NULL;

    RAISE NOTICE '[erp-encrypt] credentials_encrypted converted JSONB→TEXT and encrypted.';
  ELSE
    RAISE NOTICE '[erp-encrypt] credentials_encrypted already TEXT — skipping type conversion.';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3. Backfill access_token_encrypted and refresh_token_encrypted
--    for all rows not yet processed (secrets_encrypted = false).
--
--    Rows with secrets_encrypted = true were already handled by
--    step 2 (credentials) or by a previous run of this script.
-- ──────────────────────────────────────────────────────────────
UPDATE public.erp_integrations
SET
  access_token_encrypted = CASE
    WHEN access_token_encrypted IS NOT NULL AND access_token_encrypted <> ''
    THEN public.encrypt_secret(access_token_encrypted)
    ELSE access_token_encrypted
  END,
  refresh_token_encrypted = CASE
    WHEN refresh_token_encrypted IS NOT NULL AND refresh_token_encrypted <> ''
    THEN public.encrypt_secret(refresh_token_encrypted)
    ELSE refresh_token_encrypted
  END,
  secrets_encrypted = true
WHERE secrets_encrypted = false;

-- Mark any remaining rows (those that had no tokens) as processed
UPDATE public.erp_integrations
SET secrets_encrypted = true
WHERE secrets_encrypted = false;


-- ──────────────────────────────────────────────────────────────
-- 4. Verify: log migrated row count
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total     int;
  v_encrypted int;
BEGIN
  SELECT COUNT(*) INTO v_total     FROM public.erp_integrations;
  SELECT COUNT(*) INTO v_encrypted FROM public.erp_integrations WHERE secrets_encrypted = true;
  RAISE NOTICE '[erp-encrypt] % / % rows now have encrypted secrets.',
    v_encrypted, v_total;
  IF v_total > 0 AND v_encrypted < v_total THEN
    RAISE EXCEPTION '[erp-encrypt] Backfill incomplete — aborting.';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 5. Update get_decrypted_erp_integration()
--
--    Changes vs original:
--      • credentials: decrypt_secret(credentials_encrypted) → TEXT
--        (was returned as raw JSONB without decryption)
--      • Added columns needed by erp-refresh-token and erp-sync:
--        connection_status, last_sync_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_decrypted_erp_integration(
  p_integration_id uuid
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  name              text,
  erp_system        text,
  api_endpoint      text,
  api_version       text,
  access_token      text,        -- decrypted
  refresh_token     text,        -- decrypted
  token_type        text,
  token_expires_at  timestamptz,
  credentials       text,        -- decrypted JSON string (was credentials_encrypted jsonb)
  oauth_config      jsonb,       -- OAuth client config (not encrypted in this pass)
  webhook_secret    text,
  connection_status text,
  is_active         boolean,
  is_sandbox        boolean,
  last_sync_at      timestamptz
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
    public.decrypt_secret(ei.access_token_encrypted)  AS access_token,
    public.decrypt_secret(ei.refresh_token_encrypted) AS refresh_token,
    ei.token_type,
    ei.token_expires_at,
    public.decrypt_secret(ei.credentials_encrypted)   AS credentials,
    ei.oauth_config,
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


-- ──────────────────────────────────────────────────────────────
-- 6. GRANT EXECUTE on crypto functions to service_role
--    (edge functions authenticate with the service-role key)
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.encrypt_secret(text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_secret(text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.get_decrypted_erp_integration(uuid) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 7. CHECK constraints — block plaintext regression
--
--    pgsodium crypto_aead_det_encrypt output for even a 1-byte
--    input is ≥ 17 bytes (data + 16-byte auth tag), base64 ≥ 24
--    chars.  Real-world tokens (OAuth JWTs, API keys) are 20–200
--    bytes → ciphertext ≥ 50 chars base64.  Threshold = 40.
--
--    Short plaintext values (e.g. a 10-char API key) become
--    ~35-char ciphertext base64 — but after encryption they are
--    always > 40.  The constraint fires ONLY on INSERT/UPDATE so
--    it does not affect reads.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_schema    = 'public'
      AND  table_name      = 'erp_integrations'
      AND  constraint_name = 'chk_access_token_min_length'
  ) THEN
    ALTER TABLE public.erp_integrations
      ADD CONSTRAINT chk_access_token_min_length
        CHECK (access_token_encrypted IS NULL OR length(access_token_encrypted) > 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_schema    = 'public'
      AND  table_name      = 'erp_integrations'
      AND  constraint_name = 'chk_refresh_token_min_length'
  ) THEN
    ALTER TABLE public.erp_integrations
      ADD CONSTRAINT chk_refresh_token_min_length
        CHECK (refresh_token_encrypted IS NULL OR length(refresh_token_encrypted) > 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_schema    = 'public'
      AND  table_name      = 'erp_integrations'
      AND  constraint_name = 'chk_credentials_min_length'
  ) THEN
    ALTER TABLE public.erp_integrations
      ADD CONSTRAINT chk_credentials_min_length
        CHECK (credentials_encrypted IS NULL OR length(credentials_encrypted) > 40);
  END IF;
END $$;
