import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleGuard } from './RoleGuard';
import { useUserRole } from '@/hooks/useUserRole';

vi.mock('@/hooks/useUserRole');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('RoleGuard', () => {
  it('renders children when user has an allowed role', () => {
    vi.mocked(useUserRole).mockReturnValue({
      roles: ['tenant_admin'],
      primaryRole: 'tenant_admin',
      loading: false,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['tenant_admin', 'super_admin']}>
          <div>Admin Panel</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('renders nothing and redirects when role is not allowed', () => {
    vi.mocked(useUserRole).mockReturnValue({
      roles: ['driver'],
      primaryRole: 'driver',
      loading: false,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['tenant_admin', 'super_admin']}>
          <div>Admin Panel</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/driver', { replace: true });
  });

  it('redirects client users to /client', () => {
    vi.mocked(useUserRole).mockReturnValue({
      roles: ['client'],
      primaryRole: 'client',
      loading: false,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['tenant_admin']}>
          <div>Admin Only</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/client', { replace: true });
  });

  it('redirects to custom redirectTo path for unrecognised roles', () => {
    vi.mocked(useUserRole).mockReturnValue({
      roles: ['manager'],
      primaryRole: 'manager',
      loading: false,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['tenant_admin']} redirectTo="/forbidden">
          <div>Restricted</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/forbidden', { replace: true });
  });

  it('shows loading spinner while roles are resolving', () => {
    vi.mocked(useUserRole).mockReturnValue({
      roles: [],
      primaryRole: null,
      loading: true,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['tenant_admin']}>
          <div>Admin Panel</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });
});
