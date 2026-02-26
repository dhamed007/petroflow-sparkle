# Incident Response Playbook
**Owner:** Engineering Lead
**Version:** 1.0 — 2026-02-26

---

## Severity Definitions

| Level | Definition | Response time |
|-------|-----------|---------------|
| **P0 — Critical** | Production down, data breach, payment failure, all tenants affected | Immediate (< 15 min) |
| **P1 — High** | Feature broken for multiple tenants, ERP sync stopped, single tenant data issue | < 1 hour |
| **P2 — Medium** | Degraded performance, non-critical feature broken, elevated error rate | < 4 hours |
| **P3 — Low** | Cosmetic issues, non-urgent alerts, single user complaint | Next business day |

---

## Detection Sources

- **Sentry** — frontend exceptions and Edge Function errors (`VITE_SENTRY_DSN`)
- **UptimeRobot** — app URL down (email alert within 2 minutes)
- **Supabase dashboard** — Edge Function logs, DB metrics, realtime connections
- **`erp_sync_logs` table** — `dead_letter` count spike indicates ERP sync failure
- **`audit_logs` table** — unexpected action types or tenants indicate possible breach
- **Customer report** — direct WhatsApp/email from tenant admin

---

## P0 Response Steps

### Step 1 — Confirm (< 5 min)
```sql
-- Check if DB is responding
SELECT COUNT(*) FROM public.tenants;

-- Check error spike in last 10 minutes
SELECT action_type, COUNT(*)
FROM public.audit_logs
WHERE created_at > now() - interval '10 minutes'
GROUP BY action_type;
```
- Open Supabase dashboard → Edge Function logs → look for 5xx spike
- Open Sentry → check error volume over last 30 minutes

### Step 2 — Contain (< 15 min)
**If data breach suspected:**
1. Revoke `SUPABASE_SERVICE_ROLE_KEY` immediately
2. Rotate JWT secret in Supabase project settings (forces all sessions to re-authenticate)
3. Disable affected ERP integration in dashboard

**If payment processing broken:**
1. Check `payment_transactions` for stuck `pending` rows
2. Verify Paystack/Flutterwave webhook logs in their dashboards
3. Manually verify test transaction via Paystack dashboard

**If ERP sync storm (dead-letter spike):**
1. Disable the affected ERP integration (`is_active = false`)
2. Check ERP provider status page
3. Clear the retry queue if needed:
```sql
UPDATE public.erp_sync_logs
SET sync_status = 'dismissed'
WHERE sync_status = 'retrying'
AND integration_id = '<affected_id>';
```

### Step 3 — Communicate (< 30 min)
- Notify affected tenant admin via WhatsApp/email: "We are aware of an issue affecting [feature]. Our team is actively working on it."
- Do NOT speculate on cause or timeline in first message.

### Step 4 — Resolve
- Apply fix via Lovable or direct code change
- For DB issues: apply fix SQL via Supabase dashboard SQL editor
- For Edge Function issues: redeploy via Supabase dashboard

### Step 5 — Post-Mortem (within 48 hours)
Write a brief post-mortem including:
- Timeline (detection → containment → resolution)
- Root cause
- What was affected and for how long
- Action items to prevent recurrence
- Update this playbook if the incident reveals a gap

---

## Common Runbooks

### ERP sync not working
```sql
-- Find integrations with recent dead-letter failures
SELECT i.name, i.erp_system, COUNT(*) as dead_letters
FROM public.erp_sync_logs l
JOIN public.erp_integrations i ON i.id = l.integration_id
WHERE l.sync_status = 'dead_letter'
AND l.created_at > now() - interval '24 hours'
GROUP BY i.name, i.erp_system;
```
Fix: retry from ERPSyncLogs dashboard UI, or check ERP provider API status.

### Payment stuck in pending
```sql
SELECT id, transaction_reference, status, created_at, tenant_id
FROM public.payment_transactions
WHERE status = 'pending'
AND created_at < now() - interval '1 hour';
```
Fix: manually verify reference against Paystack dashboard; update status if confirmed paid/failed.

### Tenant cannot log in
Check Supabase Auth dashboard → Users → find the user → check if email is confirmed, account is not banned.
If RLS is returning empty rows: check `profiles.tenant_id` is set for the user.

### High DB connection count
Check Supabase dashboard → Database → Connection pooling.
If connections are exhausted: redeploy Edge Functions to reset Deno isolates.
Verify Edge Functions are using the pooler URL (port 6543) not direct connection (port 5432).

---

## Key Contacts & Links

| Resource | URL / Contact |
|----------|---------------|
| Supabase dashboard | https://supabase.com/dashboard/project/rophutqdblgkasdooxtg |
| Sentry dashboard | https://sentry.io (project: petroflow-sparkle) |
| UptimeRobot | https://uptimerobot.com |
| Paystack dashboard | https://dashboard.paystack.com |
| Flutterwave dashboard | https://app.flutterwave.com |
| GitHub repo | https://github.com/dhamed007/petroflow-sparkle |
