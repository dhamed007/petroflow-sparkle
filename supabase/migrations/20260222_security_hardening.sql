-- ================================================================
-- SECURITY HARDENING: Closes 7 RLS & role-assignment gaps
-- ================================================================
--
-- GAP 1  orders UPDATE was tenant-wide (any member could change any order)
-- GAP 2  clients had no invoice SELECT (their own-order invoices were blocked)
-- GAP 3  drivers had no orders SELECT (no access to orders for their deliveries)
-- GAP 4  user_roles SELECT exposed all tenant roles to any tenant member
-- GAP 5  user_roles INSERT allowed self-assigning elevated roles (dispatch_officer,
--         sales_rep, sales_manager) — restricted to client / driver only
-- GAP 6  erp_entities ALL policy allowed any tenant member to INSERT/UPDATE/DELETE
-- GAP 7  erp_field_mappings ALL policy — same issue as GAP 6


-- ──────────────────────────────────────────────────────────────
-- GAP 1: ORDERS — restrict UPDATE to authorised roles only
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update orders in their tenant" ON public.orders;

CREATE POLICY "Authorized users can update orders"
ON public.orders FOR UPDATE
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (
    has_role(auth.uid(), 'tenant_admin'::app_role)
    OR has_role(auth.uid(), 'dispatch_officer'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'sales_rep'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    -- clients may cancel / update their own orders only
    OR created_by = auth.uid()
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 2: INVOICES — clients can view invoices for their own orders
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Clients can view invoices for their own orders"
ON public.invoices FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND has_role(auth.uid(), 'client'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = invoices.order_id
      AND orders.created_by = auth.uid()
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 3: ORDERS SELECT — drivers see orders linked to their deliveries
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Drivers can view orders linked to their deliveries"
ON public.orders FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND has_role(auth.uid(), 'driver'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.deliveries
    WHERE deliveries.order_id = orders.id
      AND deliveries.driver_id = auth.uid()
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 4: USER_ROLES SELECT — users see only their own roles;
--         admins see all roles in their tenant
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles in their tenant"
ON public.user_roles FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (
    has_role(auth.uid(), 'tenant_admin'::app_role)
    OR is_super_admin(auth.uid())
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 5: USER_ROLES INSERT — restrict self-assignment to
--         client / driver only on first join; remove elevated roles
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their first role when joining" ON public.user_roles;

CREATE POLICY "Users can self-assign client or driver role on first join"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  -- Only assigning role to themselves
  user_id = auth.uid()
  -- Only entry-level roles; dispatch_officer / sales_* require admin approval
  AND role IN ('client'::app_role, 'driver'::app_role)
  -- Prevent re-assignment: no existing role in this tenant yet
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles existing_role
    WHERE existing_role.user_id = auth.uid()
      AND existing_role.tenant_id = user_roles.tenant_id
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 6: ERP_ENTITIES — split ALL into SELECT (any tenant member)
--         + INSERT / UPDATE / DELETE (tenant_admin only)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage entities for their tenant's integrations" ON public.erp_entities;

CREATE POLICY "Tenant members can view ERP entities"
ON public.erp_entities FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_entities.integration_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Tenant admins can insert ERP entities"
ON public.erp_entities FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_entities.integration_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);

CREATE POLICY "Tenant admins can update ERP entities"
ON public.erp_entities FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_entities.integration_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);

CREATE POLICY "Tenant admins can delete ERP entities"
ON public.erp_entities FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_entities.integration_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);


-- ──────────────────────────────────────────────────────────────
-- GAP 7: ERP_FIELD_MAPPINGS — same split as erp_entities
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage field mappings for their tenant" ON public.erp_field_mappings;

CREATE POLICY "Tenant members can view ERP field mappings"
ON public.erp_field_mappings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.erp_entities
    JOIN public.erp_integrations ON erp_integrations.id = erp_entities.integration_id
    WHERE erp_entities.id = erp_field_mappings.entity_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Tenant admins can insert ERP field mappings"
ON public.erp_field_mappings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.erp_entities
    JOIN public.erp_integrations ON erp_integrations.id = erp_entities.integration_id
    WHERE erp_entities.id = erp_field_mappings.entity_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);

CREATE POLICY "Tenant admins can update ERP field mappings"
ON public.erp_field_mappings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.erp_entities
    JOIN public.erp_integrations ON erp_integrations.id = erp_entities.integration_id
    WHERE erp_entities.id = erp_field_mappings.entity_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);

CREATE POLICY "Tenant admins can delete ERP field mappings"
ON public.erp_field_mappings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.erp_entities
    JOIN public.erp_integrations ON erp_integrations.id = erp_entities.integration_id
    WHERE erp_entities.id = erp_field_mappings.entity_id
      AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
      AND has_role(auth.uid(), 'tenant_admin'::app_role)
  )
);
