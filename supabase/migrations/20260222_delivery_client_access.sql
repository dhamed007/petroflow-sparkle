-- ================================================================
-- GAP-03: Clients can view deliveries for their own orders
-- ================================================================
-- Deliveries were previously only accessible to staff/admin roles.
-- Clients need read access to deliveries linked to orders they created.

CREATE POLICY "Clients can view deliveries for their own orders"
ON public.deliveries FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND has_role(auth.uid(), 'client'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = deliveries.order_id
      AND orders.created_by = auth.uid()
  )
);
