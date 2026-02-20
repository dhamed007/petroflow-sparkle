-- ERP sync retry cron job
-- Runs erp-sync-retry every 5 minutes via pg_cron + pg_net.
--
-- PREREQUISITE: Run the following two lines in the Supabase SQL editor
-- (Dashboard → SQL Editor) BEFORE applying this migration, replacing
-- the placeholders with your actual values:
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR-PROJECT-REF.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR-SERVICE-ROLE-KEY';
--
-- Both values are in: Supabase Dashboard → Project Settings → API

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if re-running this migration
SELECT cron.unschedule('erp-sync-retry') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'erp-sync-retry'
);

SELECT cron.schedule(
  'erp-sync-retry',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url        := current_setting('app.supabase_url') || '/functions/v1/erp-sync-retry',
    headers    := jsonb_build_object(
                    'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                    'Content-Type',  'application/json'
                  ),
    body       := '{}'::jsonb
  );
  $$
);
