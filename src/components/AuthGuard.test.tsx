import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/contexts/AuthContext');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAuthBase = { session: null, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn() };

// Helper: configure the supabase mock for a specific user scenario
function mockSupabaseForUser({
  tenantId = 'tenant-1',
  roles = ['tenant_admin'],
}: { tenantId?: string | null; roles?: string[] } = {}) {
  const mockedSupabase = vi.mocked(supabase);

  mockedSupabase.from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { tenant_id: tenantId }, error: null }),
      } as any;
    }
    if (table === 'user_roles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: roles.map(r => ({ role: r })), error: null }),
      } as any;
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;
  });
}

describe('AuthGuard', () => {
  it('renders children when user is authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuthBase, user: { id: 'u1' } as any, loading: false });
    mockSupabaseForUser({ tenantId: 'tenant-1', roles: ['tenant_admin'] });

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('shows loading spinner while auth is resolving', () => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuthBase, user: null, loading: true });

    render(
      <MemoryRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('navigates to /auth when unauthenticated and requireAuth=true', async () => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuthBase, user: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthGuard requireAuth={true}>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth', { replace: true }));
  });

  it('renders children on public routes without auth', async () => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuthBase, user: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGuard requireAuth={false}>
          <div>Public Page</div>
        </AuthGuard>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Public Page')).toBeInTheDocument());
  });
});
