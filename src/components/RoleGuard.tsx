import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole, UserRole } from '@/hooks/useUserRole';

interface RoleGuardProps {
  children: React.ReactNode;
  /**
   * At least one of these roles must be present in the user's role list.
   * If the user has none, they are redirected to `redirectTo`.
   */
  allowedRoles: UserRole[];
  /**
   * Where to send unauthorised users. Defaults to '/dashboard'.
   * Driver-primary users will land on '/driver'; client-primary users on '/client'.
   */
  redirectTo?: string;
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

/**
 * Server-verified role guard for route-level access control.
 *
 * Wraps a route in AuthGuard first, then wraps the page component
 * in RoleGuard. RLS remains the authoritative data-access control;
 * this component provides a clean UX redirect instead of an empty page.
 *
 * Usage in App.tsx:
 *   <AuthGuard>
 *     <RoleGuard allowedRoles={['tenant_admin', 'super_admin']}>
 *       <UserManagement />
 *     </RoleGuard>
 *   </AuthGuard>
 */
export function RoleGuard({
  children,
  allowedRoles,
  redirectTo = '/dashboard',
}: RoleGuardProps) {
  const { roles, primaryRole, loading } = useUserRole();
  const navigate = useNavigate();

  // Compute access once roles are loaded
  const hasAccess = !loading && roles.some((r) => allowedRoles.includes(r));

  useEffect(() => {
    if (loading) return;
    if (!hasAccess) {
      // Send drivers to their dashboard, clients to theirs, others to default
      if (primaryRole === 'driver') {
        navigate('/driver', { replace: true });
      } else if (primaryRole === 'client') {
        navigate('/client', { replace: true });
      } else {
        navigate(redirectTo, { replace: true });
      }
    }
  }, [loading, hasAccess, primaryRole, navigate, redirectTo]);

  if (loading) return <PageLoader />;

  // Render nothing while the redirect fires (avoids flash of content)
  if (!hasAccess) return null;

  return <>{children}</>;
}
