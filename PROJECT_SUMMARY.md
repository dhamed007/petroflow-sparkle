# PetroFlow Sparkle — Project Summary

## What It Is
A **multi-tenant SaaS logistics & fleet management platform** built for the Nigerian market. It enables companies to manage orders, track deliveries in real-time via GPS, manage fleet vehicles, handle inventory, and integrate with enterprise ERP systems.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | shadcn/ui (Radix UI) + Tailwind CSS |
| **State** | TanStack React Query + React Hook Form + Zod |
| **Backend/DB** | Supabase (PostgreSQL) with RLS & real-time subscriptions |
| **Mapping** | Leaflet + React Leaflet (GPS tracking) |
| **Payments** | Paystack, Flutterwave, Interswitch |
| **Exports** | jsPDF + xlsx |
| **Platform** | Lovable.dev (AI-assisted development) |

---

## Core Features
- **Order Management** — Create, assign, track, and filter orders
- **Real-time GPS Tracking** — Leaflet map with live truck locations (Lagos-centered)
- **Fleet Management** — Vehicle registration, driver assignment, maintenance tracking
- **Inventory** — Stock levels by location with low-stock alerts
- **Invoicing & Payments** — Multi-gateway payment processing with encrypted credentials
- **ERP Integrations** — SAP, Odoo, QuickBooks, Sage, Dynamics 365 with AI-suggested field mapping
- **Analytics & Reports** — Charts (Recharts), PDF/Excel export
- **Multi-tenancy** — Tenant isolation via RLS, 8 RBAC roles (super_admin to client)
- **Role-based Dashboards** — Separate views for admin, driver, and client roles
- **Onboarding Wizard** — Guided setup for new organizations

---

## Pricing (NGN)
| Tier | Price | Users | Vehicles |
|------|-------|-------|----------|
| Starter | NGN 50,000/mo | 5 | 10 |
| Business | NGN 150,000/mo | 25 | 50 |
| Enterprise | Custom | Unlimited | Unlimited |

---

## Project Structure (Key Dirs)
- **`src/pages/`** — 22 route pages (Dashboard, Orders, Fleet, Tracking, Invoices, etc.)
- **`src/components/`** — Feature-grouped components (landing, orders, tracking, fleet, erp, ui)
- **`src/contexts/`** — AuthContext (Supabase auth state)
- **`src/integrations/supabase/`** — Client config + auto-generated DB types
- **`src/components/ui/`** — 40+ shadcn base components

---

## Security
- Supabase Auth (JWT) with session persistence
- Row-Level Security for tenant data isolation
- Encrypted storage for ERP credentials, payment secrets, and OAuth tokens
- Audit logging via database functions
- Protected routes via `AuthGuard` + `RoleBasedRedirect`

---

## Dev Commands
```bash
npm run dev        # Dev server on port 8080
npm run build      # Production build
npm run lint       # ESLint
```
