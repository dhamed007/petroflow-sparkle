-- Add token management fields to erp_integrations
ALTER TABLE public.erp_integrations
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS token_type text DEFAULT 'Bearer',
ADD COLUMN IF NOT EXISTS oauth_config jsonb DEFAULT '{}'::jsonb;

-- Add index for token expiry checks
CREATE INDEX IF NOT EXISTS idx_erp_integrations_token_expires_at 
ON public.erp_integrations(token_expires_at) 
WHERE token_expires_at IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.erp_integrations.access_token_encrypted IS 'Encrypted OAuth access token';
COMMENT ON COLUMN public.erp_integrations.refresh_token_encrypted IS 'Encrypted OAuth refresh token for automatic renewal';
COMMENT ON COLUMN public.erp_integrations.token_expires_at IS 'Timestamp when access token expires';
COMMENT ON COLUMN public.erp_integrations.oauth_config IS 'OAuth configuration including client_id, token_url, scopes';