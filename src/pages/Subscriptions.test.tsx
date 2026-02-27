import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Subscriptions from './Subscriptions';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/contexts/AuthContext');

// Stub the nav to avoid real-time subscription side-effects in unit tests
vi.mock('@/components/DashboardNav', () => ({
  default: () => <nav data-testid="dashboard-nav" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockPlans = [
  {
    id: 'plan-starter',
    name: 'Starter',
    tier: 'starter',
    price_monthly: 50000,
    price_annual: 500000,
    features: ['Up to 5 trucks', 'Basic GPS tracking'],
  },
  {
    id: 'plan-business',
    name: 'Business',
    tier: 'business',
    price_monthly: 150000,
    price_annual: 1500000,
    features: ['Up to 25 trucks', 'Advanced analytics'],
  },
];

function renderSubscriptions() {
  return render(
    <MemoryRouter>
      <Subscriptions />
    </MemoryRouter>
  );
}

describe('Subscriptions page', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' } as any,
      loading: false,
    });

    // Mock supabase.from chain to return plans
    const fromMock = vi.mocked(supabase.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: 'tenant-1', email: 'test@example.com' }, error: null }),
        } as any;
      }
      if (table === 'subscription_plans') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockPlans, error: null }),
        } as any;
      }
      if (table === 'tenant_subscriptions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        } as any;
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    });
  });

  it('shows NGN prices by default', async () => {
    renderSubscriptions();
    await waitFor(() => {
      expect(screen.getByText(/₦50k/i)).toBeInTheDocument();
    });
  });

  it('switches to USD prices when USD toggle is clicked', async () => {
    renderSubscriptions();
    await waitFor(() => screen.getByText(/₦50k/i));

    fireEvent.click(screen.getByRole('button', { name: /\$ USD/i }));

    await waitFor(() => {
      expect(screen.getByText('$19')).toBeInTheDocument();
      expect(screen.getByText('$49')).toBeInTheDocument();
    });
  });

  it('persists currency selection to localStorage', async () => {
    renderSubscriptions();
    await waitFor(() => screen.getByText(/₦50k/i));

    fireEvent.click(screen.getByRole('button', { name: /\$ USD/i }));

    expect(localStorage.setItem).toHaveBeenCalledWith('pf_currency', 'USD');
  });

  it('switches back to NGN when NGN toggle is clicked', async () => {
    renderSubscriptions();
    await waitFor(() => screen.getByText(/₦50k/i));

    fireEvent.click(screen.getByRole('button', { name: /\$ USD/i }));
    await waitFor(() => screen.getByText('$19'));

    fireEvent.click(screen.getByRole('button', { name: /₦ NGN/i }));
    await waitFor(() => {
      expect(screen.getByText(/₦50k/i)).toBeInTheDocument();
    });
  });

  it('calls process-payment with USD currency when subscribing in USD mode', async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { data: { authorization_url: 'https://checkout.paystack.com/test123' } },
      error: null,
    });

    // Mock getSession
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token123' } as any },
      error: null,
    });

    renderSubscriptions();
    await waitFor(() => screen.getByText(/₦50k/i));

    fireEvent.click(screen.getByRole('button', { name: /\$ USD/i }));
    await waitFor(() => screen.getByText('$19'));

    const subscribeButtons = screen.getAllByRole('button', { name: /Subscribe Monthly/i });
    fireEvent.click(subscribeButtons[0]);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'process-payment',
        expect.objectContaining({
          body: expect.objectContaining({
            currency: 'USD',
            amount: 19,
          }),
        })
      );
    });
  });

  it('redirects unauthenticated users to /auth', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    renderSubscriptions();
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });
});
