import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'super_admin' | 'tenant_admin' | 'sales_manager' | 'sales_rep' | 'dispatch_officer' | 'driver' | 'client';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [primaryRole, setPrimaryRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const fetchUserRoles = async () => {
      // Wait for auth to settle before making any role decisions.
      // Without this guard, useUserRole sets loading=false while user is
      // still null (auth pending), then AuthGuard fires with primaryRole=null
      // and redirects super_admins to onboarding before roles are fetched.
      if (authLoading) return;

      if (!user) {
        setRoles([]);
        setPrimaryRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (!error && data) {
        const userRoles = data.map((r) => r.role as UserRole);
        setRoles(userRoles);

        // Determine primary role (highest privilege)
        if (userRoles.includes('super_admin')) {
          setPrimaryRole('super_admin');
        } else if (userRoles.includes('tenant_admin')) {
          setPrimaryRole('tenant_admin');
        } else if (userRoles.includes('dispatch_officer')) {
          setPrimaryRole('dispatch_officer');
        } else if (userRoles.includes('sales_manager')) {
          setPrimaryRole('sales_manager');
        } else if (userRoles.includes('driver')) {
          setPrimaryRole('driver');
        } else if (userRoles.includes('client')) {
          setPrimaryRole('client');
        } else {
          setPrimaryRole(userRoles[0] || null);
        }
      }

      setLoading(false);
    };

    fetchUserRoles();
  }, [user, authLoading]);

  const hasRole = (role: UserRole) => roles.includes(role);
  const hasAnyRole = (...checkRoles: UserRole[]) => checkRoles.some(role => roles.includes(role));

  return { roles, primaryRole, loading, hasRole, hasAnyRole };
}
