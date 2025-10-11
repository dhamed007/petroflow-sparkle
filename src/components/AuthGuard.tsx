import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { primaryRole, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuthAndRole = async () => {
      if (authLoading || roleLoading) return;

      // Not authenticated but auth required
      if (requireAuth && !user) {
        navigate('/auth', { replace: true });
        return;
      }

      // Authenticated but no redirect needed for public routes
      if (!requireAuth) return;

      // Check if user has tenant
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single();

        // No tenant - send to onboarding
        if (!profile?.tenant_id && location.pathname !== '/onboarding') {
          navigate('/onboarding', { replace: true });
          return;
        }

        // Has tenant - check role-based routing
        if (profile?.tenant_id && location.pathname === '/dashboard') {
          if (primaryRole === 'driver') {
            navigate('/driver', { replace: true });
          } else if (primaryRole === 'client') {
            navigate('/client', { replace: true });
          }
        }
      }
    };

    checkAuthAndRole();
  }, [user, primaryRole, authLoading, roleLoading, navigate, location, requireAuth]);

  if (authLoading || roleLoading) {
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
