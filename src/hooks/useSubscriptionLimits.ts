import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth } from 'date-fns';

interface Limits {
  plan_name: string;
  tier: string;
  max_trucks: number;
  max_users: number;
  max_monthly_transactions: number;
}

interface Usage {
  trucks: number;
  users: number;
  monthly_orders: number;
}

export interface SubscriptionLimitsResult {
  limits: Limits | null;
  usage: Usage | null;
  loading: boolean;
  canAddTruck: boolean;
  canAddUser: boolean;
  canCreateOrder: boolean;
}

export function useSubscriptionLimits(): SubscriptionLimitsResult {
  const { user } = useAuth();
  const [limits, setLimits] = useState<Limits | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchLimits();
  }, [user]);

  const fetchLimits = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user!.id)
        .single();

      if (!profile?.tenant_id) return;

      const tenantId = profile.tenant_id;

      const [subRes, trucksRes, usersRes, ordersRes] = await Promise.all([
        supabase
          .from('tenant_subscriptions')
          .select('subscription_plans(name, tier, max_trucks, max_users, max_monthly_transactions)')
          .eq('tenant_id', tenantId)
          .single(),
        supabase
          .from('trucks')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', startOfMonth(new Date()).toISOString()),
      ]);

      if (subRes.data?.subscription_plans) {
        const plan = subRes.data.subscription_plans as any;
        setLimits({
          plan_name: plan.name,
          tier: plan.tier,
          max_trucks: plan.max_trucks,
          max_users: plan.max_users,
          max_monthly_transactions: plan.max_monthly_transactions,
        });
      }

      setUsage({
        trucks: trucksRes.count ?? 0,
        users: usersRes.count ?? 0,
        monthly_orders: ordersRes.count ?? 0,
      });
    } catch (error) {
      console.error('Error fetching subscription limits:', error);
    } finally {
      setLoading(false);
    }
  };

  // If no subscription found, default to allowing all actions
  const canAddTruck = !limits || !usage || usage.trucks < limits.max_trucks;
  const canAddUser = !limits || !usage || usage.users < limits.max_users;
  const canCreateOrder = !limits || !usage || usage.monthly_orders < limits.max_monthly_transactions;

  return { limits, usage, loading, canAddTruck, canAddUser, canCreateOrder };
}
