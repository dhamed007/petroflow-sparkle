-- =============================================================================
-- Hardening migration: unique constraint on payment_transactions +
-- composite indexes for RLS-filtered query patterns on orders/deliveries.
-- All statements are idempotent.
-- =============================================================================

-- Unique constraint on transaction_reference
-- Prevents double-processing on duplicate Paystack/Flutterwave webhook delivery.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_reference_unique;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_reference_unique
  UNIQUE (transaction_reference);

-- Composite indexes on orders ─────────────────────────────────────────────────
-- RLS filters on tenant_id first; these let Postgres satisfy both the RLS
-- predicate and the ORDER BY / WHERE status in a single index scan.

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
  ON public.orders(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status
  ON public.orders(tenant_id, status);

-- Composite indexes on deliveries ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant_created
  ON public.deliveries(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deliveries_tenant_status
  ON public.deliveries(tenant_id, status);

-- erp_sync_logs — tenant + status for ERPSyncLogs dashboard filter queries
CREATE INDEX IF NOT EXISTS idx_erp_sync_logs_tenant_status
  ON public.erp_sync_logs(tenant_id, sync_status);

-- invoices — tenant + status for Invoices page RLS queries
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status
  ON public.invoices(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created
  ON public.invoices(tenant_id, created_at DESC);
