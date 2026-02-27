# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@visionsedge.io** (do not open public GitHub issues for security bugs).

We aim to respond within 48 hours and patch critical issues within 7 days.

---

## Known `npm audit` Findings — Risk Assessment

The following vulnerabilities appear in `npm audit` but are mitigated by our specific usage patterns.
They are tracked here to avoid confusion in CI.

### jspdf (CRITICAL upstream CVEs)

**Vulnerabilities:** Path traversal, XSS via `doc.html()`, DoS via malformed image dimensions, PDF injection via AcroForm.

**Our usage:** `src/pages/Reports.tsx` uses only:
- `doc.text()` — plain string rendering, no HTML parsing
- `autoTable(doc, { body: [...] })` — structured data from Supabase (user's own tenant data)
- `doc.save()` — local download, never served back over HTTP

**Why risk is low:** The XSS/injection CVEs require calling `doc.html(userControlledString)` or constructing AcroForm fields with unsanitized input. We do neither. The DoS via BMP/GIF dimensions requires parsing a malicious image file — we never load user-uploaded images into jsPDF.

**Mitigation:** Never add `doc.html()` calls. Never pass unvalidated user strings to AcroForm APIs.

---

### xlsx (HIGH — Prototype Pollution + ReDoS)

**Vulnerabilities:** Prototype pollution when parsing workbooks; ReDoS on certain cell patterns.

**Our usage:** Export only — we call `XLSX.utils.json_to_sheet()` + `XLSX.writeFile()` on structured JS arrays from Supabase. We never call `XLSX.read()` on user-uploaded files.

**Why risk is low:** Prototype pollution requires parsing an adversarially crafted workbook. We never import/parse workbooks from external sources.

---

### react-router / @remix-run/router (HIGH — Open Redirect)

**Vulnerability:** XSS via open redirect when user-controlled strings are passed to `<Link to>` or `navigate()`.

**Our usage:** All navigation calls use hardcoded paths (e.g., `navigate('/dashboard')`, `navigate('/auth')`). No URL parameters or user input are passed directly to `navigate()`.

**Why risk is low:** The CVE requires a developer to write `navigate(userInput)` with unsanitized input. Our codebase does not do this. Reviewed in `src/components/AuthGuard.tsx`, `src/components/RoleGuard.tsx`, `src/pages/Auth.tsx`.

---

### glob / minimatch (HIGH — ReDoS)

**Context:** Dev-only build tooling (Vite internals). Not included in the production client bundle.

**Risk:** None for production users.

---

## Controls in Production

| Control | Status |
|---------|--------|
| Supabase RLS on all tables | ✅ |
| JWT auth on all Edge Functions | ✅ |
| CORS restricted via `ALLOWED_ORIGIN` env var | ✅ |
| HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) | ✅ via `vercel.json` |
| Credentials encrypted at rest (pgsodium) | ✅ |
| Rate limiting (client + server-side) | ✅ |
| Idempotency keys on payment + ERP | ✅ |
| Audit logging | ✅ |
| Error sanitization (no credential leaks in responses) | ✅ |
| Sentry with PII masking | ✅ |
| Input validation (Zod) on all Edge Functions | ✅ |
