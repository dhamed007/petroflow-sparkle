# Secrets Rotation Policy
**Owner:** Engineering Lead
**Review cadence:** Annually, or after any suspected compromise

---

## Secrets Inventory

| Secret | Location | Rotation period | Last rotated |
|--------|----------|-----------------|--------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard + GitHub Actions secret | 12 months | On project creation |
| `SUPABASE_ANON_KEY` | `.env` + Vercel/Netlify env | 12 months | On project creation |
| `VISIONSEDGE_PAYSTACK_SECRET_KEY` | Supabase Edge Function env | 12 months or on Paystack rotation | — |
| `PAYSTACK_WEBHOOK_SECRET` | Supabase Edge Function env | 12 months | — |
| `FLUTTERWAVE_SECRET_KEY` | Supabase Edge Function env | 12 months | — |
| `VITE_SENTRY_DSN` | `.env` + CI env | On team change | — |
| Supabase JWT secret | Supabase project settings | On compromise only | On project creation |
| ERP `client_secret` (per tenant) | Encrypted column in DB | Per tenant's ERP policy | — |

---

## Rotation Procedures

### Supabase Service Role Key
1. Go to Supabase dashboard → Project Settings → API
2. Generate a new service role key
3. Update GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY`
4. Update Supabase Edge Function environment variables (Settings → Edge Functions → Secrets)
5. Deploy Edge Functions to pick up the new key
6. Revoke the old key
7. Update this table above

### Paystack / Flutterwave Keys
1. Log in to the payment provider dashboard
2. Generate new API key
3. Update in Supabase dashboard → Edge Functions → Secrets
4. Verify a test transaction succeeds
5. Revoke old key in provider dashboard

### CORS ALLOWED_ORIGIN
- Set in Supabase Edge Functions → Secrets as `ALLOWED_ORIGIN`
- Value: your production frontend URL (e.g. `https://app.petroflowsparkle.com`)
- Update whenever the frontend domain changes

---

## Compromise Response

If any secret is suspected compromised:

1. **Immediately** revoke the compromised secret in the originating system
2. Generate a replacement and deploy
3. Check `audit_logs` table for suspicious activity in the 30-day window before detection
4. Check `erp_sync_logs` for unexpected sync activity
5. Notify affected tenants if their data was at risk
6. File an incident report using the Incident Response Playbook

---

## GitHub Actions Secrets Required

Set these in GitHub → Repository Settings → Secrets → Actions:

```
SUPABASE_SERVICE_ROLE_KEY   (for migration deploys, if CI applies migrations)
SUPABASE_PROJECT_REF        (rophutqdblgkasdooxtg)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SENTRY_AUTH_TOKEN           (for source map uploads)
VERCEL_TOKEN or NETLIFY_AUTH_TOKEN (for frontend deploys)
```
