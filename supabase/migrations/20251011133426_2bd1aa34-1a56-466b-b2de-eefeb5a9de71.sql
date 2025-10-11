-- Add payment gateway configurations
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_type TEXT NOT NULL CHECK (gateway_type IN ('paystack', 'flutterwave', 'interswitch')),
  is_active BOOLEAN DEFAULT false,
  is_sandbox BOOLEAN DEFAULT true,
  public_key TEXT,
  secret_key_encrypted TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, gateway_type)
);

-- Add subscription plans
CREATE TYPE subscription_tier AS ENUM ('starter', 'business', 'enterprise');

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier subscription_tier NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL,
  price_annual NUMERIC(10,2) NOT NULL,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_trucks INTEGER NOT NULL DEFAULT 10,
  max_monthly_transactions INTEGER NOT NULL DEFAULT 1000,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add tenant subscriptions
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  trial_ends_at DATE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Add fleet/trucks table
CREATE TABLE IF NOT EXISTS public.trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  capacity NUMERIC(10,2) NOT NULL,
  capacity_unit TEXT DEFAULT 'liters',
  driver_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_transit', 'maintenance', 'inactive')),
  gps_device_id TEXT,
  last_location JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, plate_number)
);

-- Add payment transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  subscription_id UUID REFERENCES public.tenant_subscriptions(id),
  gateway_type TEXT NOT NULL,
  transaction_reference TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  gateway_response JSONB,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, tier, price_monthly, price_annual, max_users, max_trucks, max_monthly_transactions, features) VALUES
('Starter Plan', 'starter', 25000, 250000, 5, 10, 1000, '["Basic order management", "Up to 10 trucks", "Email support", "Basic analytics"]'::jsonb),
('Business Plan', 'business', 75000, 750000, 20, 50, 5000, '["Advanced order management", "Up to 50 trucks", "Priority support", "Advanced analytics", "API access", "Custom reports"]'::jsonb),
('Enterprise Plan', 'enterprise', 200000, 2000000, -1, -1, -1, '["Unlimited users", "Unlimited trucks", "24/7 dedicated support", "Advanced analytics", "API access", "Custom integrations", "White-label options"]'::jsonb)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_gateways
CREATE POLICY "Tenant admins can manage their payment gateways"
ON public.payment_gateways FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'));

-- RLS Policies for subscription_plans
CREATE POLICY "Anyone can view active plans"
ON public.subscription_plans FOR SELECT
USING (is_active = true);

-- RLS Policies for tenant_subscriptions
CREATE POLICY "Tenants can view their subscription"
ON public.tenant_subscriptions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage their subscription"
ON public.tenant_subscriptions FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'));

-- RLS Policies for trucks
CREATE POLICY "Users can view trucks in their tenant"
ON public.trucks FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Authorized users can manage trucks"
ON public.trucks FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'tenant_admin') OR has_role(auth.uid(), 'dispatch_officer')));

-- RLS Policies for payment_transactions
CREATE POLICY "Users can view transactions in their tenant"
ON public.payment_transactions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage transactions"
ON public.payment_transactions FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'));

-- Add triggers for updated_at
CREATE TRIGGER update_payment_gateways_updated_at BEFORE UPDATE ON public.payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_subscriptions_updated_at BEFORE UPDATE ON public.tenant_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON public.trucks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();