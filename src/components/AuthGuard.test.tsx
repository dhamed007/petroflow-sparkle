import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

vi.mock('@/contexts/AuthContext');
vi.mock('@/hooks/useUserRole');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('AuthGuard', () => {
  it('renders children when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } as any, loading: false });
    vi.mocked(useUserRole).mockReturnValue({ roles: ['tenant_admin'], primaryRole: 'tenant_admin', loading: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('shows loading spinner while auth is resolving', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true });
    vi.mocked(useUserRole).mockReturnValue({ roles: [], primaryRole: null, loading: true });

    render(
      <MemoryRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    // Loading spinner shown, children not rendered
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('navigates to /auth when unauthenticated and requireAuth=true', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    vi.mocked(useUserRole).mockReturnValue({ roles: [], primaryRole: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthGuard requireAuth={true}>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/auth', { replace: true });
  });

  it('renders children on public routes without auth', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    vi.mocked(useUserRole).mockReturnValue({ roles: [], primaryRole: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGuard requireAuth={false}>
          <div>Public Page</div>
        </AuthGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Public Page')).toBeInTheDocument();
  });
});
