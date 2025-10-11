import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';

export function RoleBasedRedirect() {
  const { primaryRole, loading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (primaryRole === 'driver') {
      navigate('/driver', { replace: true });
    } else if (primaryRole === 'client') {
      navigate('/client', { replace: true });
    } else if (primaryRole === 'super_admin' || primaryRole === 'tenant_admin') {
      navigate('/dashboard', { replace: true });
    } else {
      // Default for other roles (sales_manager, dispatch_officer, etc.)
      navigate('/dashboard', { replace: true });
    }
  }, [primaryRole, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return null;
}
