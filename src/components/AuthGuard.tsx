import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

/**
 * AuthGuard fetches profile + role in a single async check after auth
 * settles. It does NOT depend on useUserRole's state timing — that hook
 * was causing a race where roleLoading=false before the DB fetch completed,
 * making primaryRole=null and redirecting super_admins to onboarding.
 */
export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const check = async () => {
      setChecking(true);

      // Not authenticated
      if (!user) {
        if (requireAuth) navigate('/auth', { replace: true });
        setChecking(false);
        return;
      }

      if (!requireAuth) {
        setChecking(false);
        return;
      }

      // Fetch profile and role in parallel
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('tenant_id').eq('id', user.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ]);

      const roles = (roleRows ?? []).map((r: any) => r.role as string);
      const isSuperAdmin = roles.includes('super_admin');
      const tenantId = profile?.tenant_id ?? null;

      // No tenant and not a super_admin → onboarding
      if (!tenantId && !isSuperAdmin && location.pathname !== '/onboarding') {
        navigate('/onboarding', { replace: true });
        setChecking(false);
        return;
      }

      // Role-based dashboard redirect
      if (location.pathname === '/dashboard') {
        if (roles.includes('driver')) {
          navigate('/driver', { replace: true });
        } else if (roles.includes('client') && !roles.includes('tenant_admin') && !isSuperAdmin) {
          navigate('/client', { replace: true });
        }
      }

      setChecking(false);
    };

    check();
  }, [user, authLoading, navigate, location.pathname, requireAuth]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
