# Monitoring Setup — PetroFlow Sparkle

## Stack

| Layer | Tool | Status |
|-------|------|--------|
| Error tracking + RUM | Sentry (`@sentry/react`) | ✅ Configured in `src/main.tsx` |
| Uptime monitoring | UptimeRobot | Configure below |
| Health endpoint | Supabase Edge Function `/health` | ✅ Deployed |
| CI alerts | GitHub Actions + Sentry releases | ✅ In `ci.yml` |

---

## UptimeRobot Setup (Free Tier)

Sign up at https://uptimerobot.com — free tier monitors every 5 minutes with email alerts.

### Monitor 1 — Main App

| Field | Value |
|-------|-------|
| Monitor Type | HTTPS |
| Friendly Name | PetroFlow Sparkle — App |
| URL | `https://<your-vercel-domain>/` |
| Monitoring Interval | 5 minutes |
| Alert When | Status is not 200 |

### Monitor 2 — Health Endpoint (DB connectivity)

| Field | Value |
|-------|-------|
| Monitor Type | HTTPS — Keyword |
| Friendly Name | PetroFlow Sparkle — Health |
| URL | `https://rophutqdblgkasdooxtg.supabase.co/functions/v1/health` |
| Keyword | `"status":"ok"` |
| Monitoring Interval | 5 minutes |
| Alert When | Keyword not found OR non-200 |

> The keyword match ensures both HTTP status AND DB connectivity are verified.

### Monitor 3 — Supabase Auth API

| Field | Value |
|-------|-------|
| Monitor Type | HTTPS |
| Friendly Name | PetroFlow Sparkle — Auth |
| URL | `https://rophutqdblgkasdooxtg.supabase.co/auth/v1/settings` |
| Monitoring Interval | 5 minutes |
| Alert When | Status is not 200 |

### Alert Contacts

In UptimeRobot → My Settings → Alert Contacts:
1. Add your email (default)
2. Optional: add a Slack webhook for `#incidents` channel

---

## Sentry Configuration

Sentry is already initialized in `src/main.tsx` with:
- Browser Tracing (10% sample rate in production)
- Session Replay (5% sessions, 100% error sessions)
- PII masking (all text + media blocked by default)
- Authorization header filtering in breadcrumbs

### Required GitHub Secrets (for CI release tagging)

Go to GitHub → Settings → Secrets → Actions and add:

| Secret | Where to find it |
|--------|-----------------|
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → Create Token (scope: `project:releases`) |
| `SENTRY_ORG` | Your Sentry organization slug (in the URL: `sentry.io/organizations/<slug>/`) |
| `SENTRY_PROJECT` | Your Sentry project slug |

### Recommended Sentry Alert Rules

In Sentry → Alerts → Create Alert:

1. **Error spike**: When `error.count() > 10` in 1 hour → notify via email
2. **New issue**: When a new issue is first seen → notify immediately
3. **Performance regression**: When P95 duration > 3s for any transaction → notify

---

## Vercel Deployment Checks

After each deploy, verify security headers are active:

```bash
curl -sI https://<your-domain>/ | grep -E "x-frame|x-content|strict-transport|content-security"
```

Expected output:
```
x-frame-options: DENY
x-content-type-options: nosniff
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: default-src 'self'; ...
```

---

## Incident Response

See the incident playbook committed at `Week 2` for full runbook.

### Quick reference

| Scenario | First action |
|----------|-------------|
| App down | Check UptimeRobot alert → Check Vercel dashboard → Check Supabase status page |
| DB degraded | Health endpoint returning 503 → Check Supabase → Check Edge Function logs |
| Payment failure spike | Check Sentry for `process-payment` errors → Check Paystack dashboard |
| Auth failures | Check Supabase Auth logs → Check `verify-payment` edge function logs |
