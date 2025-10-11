-- Create ERP integration types enum
CREATE TYPE erp_system_type AS ENUM ('sap', 'odoo', 'quickbooks', 'sage', 'dynamics365', 'custom_api');
CREATE TYPE erp_sync_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'cancelled');
CREATE TYPE erp_sync_direction AS ENUM ('import', 'export', 'bidirectional');
CREATE TYPE erp_entity_type AS ENUM ('orders', 'customers', 'products', 'invoices', 'payments', 'inventory');

-- ERP integrations table
CREATE TABLE IF NOT EXISTS public.erp_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  erp_system erp_system_type NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_sandbox BOOLEAN DEFAULT true,
  
  -- Encrypted credentials (store as JSONB encrypted on app level)
  credentials_encrypted JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Connection details
  api_endpoint TEXT,
  api_version TEXT,
  webhook_secret TEXT,
  
  -- Sync configuration
  sync_frequency_minutes INTEGER DEFAULT 60,
  auto_sync_enabled BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Connection health
  connection_status TEXT DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
  last_test_at TIMESTAMP WITH TIME ZONE,
  test_error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(tenant_id, erp_system)
);

-- ERP entities configuration
CREATE TABLE IF NOT EXISTS public.erp_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.erp_integrations(id) ON DELETE CASCADE,
  entity_type erp_entity_type NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  sync_direction erp_sync_direction DEFAULT 'bidirectional',
  
  -- ERP-specific entity names
  erp_entity_name TEXT,
  erp_endpoint TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(integration_id, entity_type)
);

-- Field mappings table
CREATE TABLE IF NOT EXISTS public.erp_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.erp_entities(id) ON DELETE CASCADE,
  
  -- PetroFlow field
  petroflow_field TEXT NOT NULL,
  petroflow_field_type TEXT,
  
  -- ERP field
  erp_field TEXT NOT NULL,
  erp_field_type TEXT,
  
  -- Transformation rules
  is_required BOOLEAN DEFAULT false,
  transform_function TEXT, -- e.g., 'uppercase', 'format_date', 'currency_convert'
  default_value TEXT,
  
  -- AI suggestions
  ai_confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  ai_suggested BOOLEAN DEFAULT false,
  manually_verified BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(entity_id, petroflow_field)
);

-- Sync logs table
CREATE TABLE IF NOT EXISTS public.erp_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.erp_integrations(id) ON DELETE CASCADE,
  entity_type erp_entity_type NOT NULL,
  
  sync_status erp_sync_status NOT NULL DEFAULT 'pending',
  sync_direction erp_sync_direction NOT NULL,
  
  -- Sync details
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  records_processed INTEGER DEFAULT 0,
  records_succeeded INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Metadata
  triggered_by UUID REFERENCES auth.users(id),
  is_manual BOOLEAN DEFAULT false,
  sync_metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for performance
CREATE INDEX idx_erp_sync_logs_integration ON public.erp_sync_logs(integration_id, created_at DESC);
CREATE INDEX idx_erp_sync_logs_status ON public.erp_sync_logs(sync_status);
CREATE INDEX idx_erp_integrations_tenant ON public.erp_integrations(tenant_id);

-- Enable RLS
ALTER TABLE public.erp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for erp_integrations
CREATE POLICY "Tenant admins can manage their ERP integrations"
ON public.erp_integrations FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'tenant_admin')
);

CREATE POLICY "Users can view their tenant's ERP integrations"
ON public.erp_integrations FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- RLS Policies for erp_entities
CREATE POLICY "Users can manage entities for their tenant's integrations"
ON public.erp_entities FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_entities.integration_id
    AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- RLS Policies for erp_field_mappings
CREATE POLICY "Users can manage field mappings for their tenant"
ON public.erp_field_mappings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.erp_entities
    JOIN public.erp_integrations ON erp_integrations.id = erp_entities.integration_id
    WHERE erp_entities.id = erp_field_mappings.entity_id
    AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- RLS Policies for erp_sync_logs
CREATE POLICY "Users can view sync logs for their tenant"
ON public.erp_sync_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_sync_logs.integration_id
    AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "System can insert sync logs"
ON public.erp_sync_logs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.erp_integrations
    WHERE erp_integrations.id = erp_sync_logs.integration_id
    AND erp_integrations.tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_erp_integrations_updated_at BEFORE UPDATE ON public.erp_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_erp_entities_updated_at BEFORE UPDATE ON public.erp_entities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_erp_field_mappings_updated_at BEFORE UPDATE ON public.erp_field_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();