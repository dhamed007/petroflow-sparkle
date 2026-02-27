import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, withRateLimit } from './rateLimiter';

// The rateLimiter uses a module-level Map. Reset it between tests by
// mocking Date.now so the sliding window is always clean.

describe('checkRateLimit', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  it('allows requests within the limit', () => {
    // payment category allows 5/min
    for (let i = 0; i < 5; i++) {
      // Advance time slightly so each timestamp is unique
      vi.spyOn(Date, 'now').mockReturnValue(now + i);
      const result = checkRateLimit('payment');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks after exceeding the limit', () => {
    // Exhaust the payment limit (5/min) by using a unique time bucket per test
    const base = Date.now() + 100_000; // far-future bucket
    for (let i = 0; i < 5; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(base + i);
      checkRateLimit('payment');
    }
    vi.spyOn(Date, 'now').mockReturnValue(base + 5);
    const blocked = checkRateLimit('payment');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('returns correct remaining count', () => {
    const base = Date.now() + 200_000;
    vi.spyOn(Date, 'now').mockReturnValue(base);
    const first = checkRateLimit('erp'); // erp: 10/min
    expect(first.remaining).toBe(9);
  });

  it('falls back to general limits for unknown categories', () => {
    const base = Date.now() + 300_000;
    vi.spyOn(Date, 'now').mockReturnValue(base);
    const result = checkRateLimit('unknown_category');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59); // general: 60/min, 1 used
  });
});

describe('withRateLimit', () => {
  it('executes the function when allowed', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const base = Date.now() + 400_000;
    vi.spyOn(Date, 'now').mockReturnValue(base);
    const result = await withRateLimit('general', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('rejects with an error when rate limited', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const base = Date.now() + 500_000;
    // Exhaust payment limit
    for (let i = 0; i < 5; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(base + i);
      try { await withRateLimit('payment', fn); } catch { /* expected */ }
    }
    vi.spyOn(Date, 'now').mockReturnValue(base + 5);
    await expect(withRateLimit('payment', fn)).rejects.toThrow(/Rate limited/);
  });
});
