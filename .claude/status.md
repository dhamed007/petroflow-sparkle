# PetroFlow Sparkle — Project Status

Last updated: 2026-02-20

---

## Recent Work (this session)

| Commit | Description |
|--------|-------------|
| `18086c9` | Close 3 security gaps: payment rate limiting, subscription caps, data export |
| `eb18782` | Reduce initial bundle from 2.19MB to ~500KB via code splitting |
| `f9134f1` | Refactored GPS update — fix filter column `driver_id` (pulled from remote) |
| `9dde0c7` | Add mobile responsiveness, PWA support, GPS tracking, RLS fixes, ERP retry, rate limiting |

---

## Feature Checklist

| Item | Status | Notes |
|------|--------|-------|
| RLS cross-tenant isolation | ✅ Done | All tables use `get_user_tenant_id()`, audit_logs fix applied |
| Rate limiting on payment endpoints | ✅ Done | Server-side in `process-payment` (5/60s) and `verify-payment` (10/60s) |
| Subscription cap enforcement | ✅ Done | DB triggers `enforce_user_cap` + `enforce_truck_cap` on INSERT |
| Background jobs for ERP sync | ⚠️ Partial | Client-side retry queue (60s poll). No server-side cron yet. |
| Backup + disaster recovery | ✅ Done | `export-tenant-data` edge function + Settings UI card + PITR docs |
| Mobile responsiveness | ✅ Done | DashboardNav hamburger menu, FleetMap/Tracking responsive |
| PWA support | ✅ Done | vite-plugin-pwa, workbox caching, service worker |
| GPS tracking | ✅ Done | `useGPSTracking` hook, offline queue, auto-resync |
| Bundle size optimisation | ✅ Done | 2.19MB → ~500KB initial load via React.lazy + manualChunks |

---

## Known Remaining Gaps

| Gap | Detail |
|-----|--------|
| ERP sync background job | Retry queue is client-side only — stops if browser closes. Needs Supabase cron (pg_cron or Edge Function scheduler) |

---

## Tech Stack
- React 18 + TypeScript + Vite
- shadcn/ui + Tailwind CSS
- TanStack Query + React Hook Form + Zod
- Supabase (PostgreSQL, RLS, Edge Functions, Auth)
- Leaflet + React Leaflet (GPS/fleet tracking)
- Paystack, Flutterwave, Interswitch (payments)
- jsPDF + xlsx (reports — dynamically imported)
- vite-plugin-pwa (PWA + offline)

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `create-order` | Validates and inserts orders with audit log |
| `create-tenant` | Tenant onboarding, slug generation, role assignment |
| `erp-connect` | ERP auth setup (OAuth/API key) |
| `erp-field-mapping-ai` | AI-suggested ERP field mappings (Gemini) |
| `erp-refresh-token` | OAuth token refresh for QuickBooks, Dynamics365 |
| `erp-sync` | Bidirectional ERP sync with retry + dead-letter |
| `erp-webhook` | HMAC-verified ERP webhook receiver |
| `process-payment` | Payment initiation (Paystack, Flutterwave, Interswitch) — rate limited |
| `verify-payment` | Payment verification + subscription activation — rate limited |
| `export-tenant-data` | Full tenant data export (tenant_admin only, audit logged) |

---

## Migrations Applied
- `20260220_subscription_cap_triggers.sql` — user + truck cap enforcement
- `20260219_rls_audit_fixes.sql` — audit_logs INSERT policy scoped to tenant
- `20260219_erp_retry_columns.sql` — retry_count + max_retries on erp_sync_logs
