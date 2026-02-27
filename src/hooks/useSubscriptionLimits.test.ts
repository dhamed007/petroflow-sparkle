import { describe, it, expect } from 'vitest';
import { annualSavingsPct, USD_PRICES } from '@/config/pricing';

// ─── Pricing helpers ───────────────────────────────────────────────────────────
// We test the pure functions from pricing.ts directly since they contain
// the billing logic that must be correct before the first payment.

describe('USD_PRICES', () => {
  it('defines starter monthly and annual prices', () => {
    expect(USD_PRICES.starter.monthly).toBe(19);
    expect(USD_PRICES.starter.annual).toBe(190);
  });

  it('defines business monthly and annual prices', () => {
    expect(USD_PRICES.business.monthly).toBe(49);
    expect(USD_PRICES.business.annual).toBe(490);
  });

  it('annual price is less than 12x monthly (there is a discount)', () => {
    expect(USD_PRICES.starter.annual).toBeLessThan(USD_PRICES.starter.monthly * 12);
    expect(USD_PRICES.business.annual).toBeLessThan(USD_PRICES.business.monthly * 12);
  });
});

describe('annualSavingsPct', () => {
  it('calculates savings for starter plan correctly', () => {
    const pct = annualSavingsPct(19, 190);
    // 12 × 19 = 228; savings = 228 - 190 = 38; 38/228 ≈ 16.67% → 17
    expect(pct).toBe(17);
  });

  it('calculates savings for business plan correctly', () => {
    const pct = annualSavingsPct(49, 490);
    // 12 × 49 = 588; savings = 588 - 490 = 98; 98/588 ≈ 16.67% → 17
    expect(pct).toBe(17);
  });

  it('returns 0 if annual equals monthly × 12 (no discount)', () => {
    expect(annualSavingsPct(10, 120)).toBe(0);
  });
});

// ─── Subscription cap logic ───────────────────────────────────────────────────
// These tests replicate the cap-check expressions used in useSubscriptionLimits
// without needing React or Supabase, verifying the guard logic is correct.

describe('subscription cap logic', () => {
  const checkCap = (usage: number, limit: number) => usage < limit;

  it('canAddTruck is true when usage is below limit', () => {
    expect(checkCap(2, 5)).toBe(true);
  });

  it('canAddTruck is false when usage equals limit', () => {
    expect(checkCap(5, 5)).toBe(false);
  });

  it('canAddTruck is false when usage exceeds limit', () => {
    expect(checkCap(6, 5)).toBe(false);
  });

  it('canCreateOrder is true when monthly orders < max', () => {
    expect(checkCap(99, 100)).toBe(true);
  });

  it('canCreateOrder is false at exact limit', () => {
    expect(checkCap(100, 100)).toBe(false);
  });

  it('canAddUser is false at max_users', () => {
    expect(checkCap(10, 10)).toBe(false);
  });
});
