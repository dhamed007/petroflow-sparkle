# Backup & Restore — PetroFlow Sparkle

## Overview

| Tier | Mechanism | Retention | RPO | RTO |
|------|-----------|-----------|-----|-----|
| Continuous | Supabase PITR (WAL shipping) | 7 days (Pro), 30 days (Team) | ~0 s | ~15 min |
| Daily snapshot | Supabase nightly logical backup | 7 days | 24 h | ~30 min |
| Edge functions | Git (GitHub) | Forever | 0 s | ~5 min re-deploy |
| Storage bucket | Supabase Storage replication | 7 days (PITR) | ~0 s | ~15 min |

**Current Supabase project:** `rophutqdblgkasdooxtg` (sparkle)

---

## What Supabase Backs Up Automatically

### Point-in-Time Recovery (PITR)
Available on **Pro plan and above**. Supabase streams WAL (Write-Ahead Log) to object storage continuously. You can restore to any second within the retention window.

Enable at: Supabase Dashboard → Project Settings → Database → Point in Time Recovery

### Daily Snapshots
Every project gets daily logical backups (pg_dump) regardless of plan. Accessible at:
**Dashboard → Project Settings → Database → Backups**

### What is NOT backed up automatically
- Supabase Edge Function environment secrets (Vault) — must be documented separately
- `.env` variables on Vercel — must be documented separately
- `VISIONSEDGE_PAYSTACK_SECRET_KEY` — stored in Supabase Vault, not in DB dumps

---

## Quarterly Restore Drill Procedure

Run this drill every 3 months to verify backup integrity. Use a **disposable test project** — never restore to production.

### Step 1 — Create a test project

1. Go to https://supabase.com/dashboard → New Project
2. Name: `petroflow-restore-test-YYYY-MM`
3. Region: same as production
4. Note the new project URL and anon key

### Step 2 — Export production dump

```bash
# Install pg_dump if needed: brew install postgresql
# Get connection string from: Dashboard → Project Settings → Database → Connection string (Direct)

pg_dump \
  "postgres://postgres.<project-ref>:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" \
  --no-owner \
  --no-acl \
  --schema=public \
  -f petroflow-backup-$(date +%Y%m%d).sql

echo "Dump size: $(du -sh petroflow-backup-$(date +%Y%m%d).sql)"
```

Or use the Supabase Dashboard: Settings → Database → Backups → Download.

### Step 3 — Restore to test project

```bash
psql \
  "postgres://postgres.<test-project-ref>:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" \
  -f petroflow-backup-$(date +%Y%m%d).sql
```

### Step 4 — Validate restore

Run these queries on the test project:

```sql
-- 1. Row counts should be non-zero
SELECT COUNT(*) FROM public.tenants;
SELECT COUNT(*) FROM public.profiles;
SELECT COUNT(*) FROM public.orders;
SELECT COUNT(*) FROM public.payment_transactions;

-- 2. RLS policies are present
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. Critical constraints exist
SELECT conname, contype
FROM pg_constraint
WHERE conname IN (
  'payment_transactions_reference_unique',
  'tenants_pkey',
  'profiles_pkey'
);

-- 4. Indexes are present
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
```

**Pass criteria:** All row counts > 0, all RLS policies present, unique constraint on `payment_transactions_reference_unique` exists.

### Step 5 — Record results and delete test project

Fill in the drill log below, then delete the test project from the Supabase dashboard.

---

## Drill Log

| Date | Operator | Backup date used | Restore time | Row count check | RLS check | Constraint check | Notes |
|------|----------|-----------------|--------------|-----------------|-----------|-----------------|-------|
| YYYY-MM-DD | | | min | ✅/❌ | ✅/❌ | ✅/❌ | |

---

## PITR Restore (Emergency)

Use this only for production incidents where data was accidentally deleted or corrupted.

1. **Estimate the last-known-good timestamp** from audit logs or Sentry breadcrumbs
2. Go to: Supabase Dashboard → Project Settings → Database → Point in Time Recovery
3. Enter the target timestamp (UTC)
4. Supabase creates a new project at the restored state
5. **Update Vercel env vars** to point to the new Supabase project URL
6. **Re-deploy** the Vercel project to pick up the new connection

> **Warning:** PITR restores the entire database. Any changes made after the target timestamp are lost. Coordinate with on-call before proceeding.

---

## Secret Recovery

Database backups do NOT contain Supabase Vault secrets (encrypted credentials for ERP and payment gateways). After a PITR restore:

1. Re-enter all secrets via: Supabase Dashboard → Vault → Secrets
2. Required secrets:
   - `VISIONSEDGE_PAYSTACK_SECRET_KEY`
   - ERP credentials (Dynamics 365 tokens, etc.)
   - `ALLOWED_ORIGIN` edge function env var

3. Re-deploy all Edge Functions:
   ```bash
   supabase functions deploy --project-ref <new-project-ref>
   ```

---

## Vercel Env Vars (if project URL changes after PITR)

```
VITE_SUPABASE_URL=https://<new-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<new-anon-key>
VITE_SUPABASE_PROJECT_ID=<new-project-ref>
```

Update in: Vercel Dashboard → Project → Settings → Environment Variables → Redeploy.

---

## Monitoring Backup Health

- **Daily snapshot succeeded?** Supabase emails alerts if backups fail (Pro+)
- **PITR gap check:** Supabase dashboard shows the "last WAL received" timestamp — alert if this is > 5 minutes behind real-time
- **Add a UptimeRobot check** on `https://rophutqdblgkasdooxtg.supabase.co/functions/v1/health` (see `docs/monitoring.md`) — sustained downtime may indicate WAL shipping issues

---

## RTO / RPO Summary

| Scenario | Target RPO | Target RTO | Mechanism |
|----------|-----------|-----------|-----------|
| Accidental row delete | < 1 min | < 30 min | PITR restore |
| Table drop | < 1 min | < 45 min | PITR restore |
| Full DB corruption | < 24 h | < 1 h | Daily snapshot |
| Edge function bug | 0 | < 10 min | Git revert + redeploy |
| Vercel deployment rollback | 0 | < 5 min | Vercel instant rollback |
