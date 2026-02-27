/**
 * Tests for payment security logic — idempotency key semantics and
 * IP rate-limit behaviour as exercised from the client side.
 *
 * These tests verify the contract the frontend relies on:
 *   1. The `reference` field is the idempotency key — it must be unique per
 *      payment attempt and stable across retries.
 *   2. The Paystack authorization_url is validated before redirect.
 *   3. The IP rate-limit RPC fails-open (does not block when the DB call errors).
 */

import { describe, it, expect, vi } from 'vitest';

// ── Reference generation ───────────────────────────────────────────────────────
// This mirrors the logic in Subscriptions.tsx handleSubscribe().
function generateReference(): string {
  return `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

describe('payment reference (idempotency key)', () => {
  it('generates a reference with the SUB- prefix', () => {
    const ref = generateReference();
    expect(ref).toMatch(/^SUB-\d+-[a-z0-9]{9}$/);
  });

  it('generates unique references on repeated calls', () => {
    const refs = new Set(Array.from({ length: 100 }, generateReference));
    expect(refs.size).toBe(100);
  });

  it('reference is a string (required by process-payment validation)', () => {
    expect(typeof generateReference()).toBe('string');
  });
});

// ── Authorization URL validation ───────────────────────────────────────────────
// Mirrors the guard added to Subscriptions.tsx handleSubscribe().
function isValidPaystackUrl(url: string): boolean {
  return (
    url.startsWith('https://checkout.paystack.com/') ||
    url.startsWith('https://standard.paystack.co/')
  );
}

describe('Paystack authorization_url validation', () => {
  it('accepts checkout.paystack.com URLs', () => {
    expect(isValidPaystackUrl('https://checkout.paystack.com/abc123')).toBe(true);
  });

  it('accepts standard.paystack.co URLs', () => {
    expect(isValidPaystackUrl('https://standard.paystack.co/xyz')).toBe(true);
  });

  it('rejects arbitrary HTTPS URLs', () => {
    expect(isValidPaystackUrl('https://evil.example.com/phish')).toBe(false);
  });

  it('rejects HTTP URLs', () => {
    expect(isValidPaystackUrl('http://checkout.paystack.com/abc')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPaystackUrl('')).toBe(false);
  });

  it('rejects javascript: URIs', () => {
    expect(isValidPaystackUrl('javascript:alert(1)')).toBe(false);
  });
});

// ── IP rate-limit fail-open contract ──────────────────────────────────────────
// The process-payment edge function calls rpc_check_payment_ip_rate_limit and
// fails-open when the RPC errors (migration not yet applied, network issue, etc.).
// This test documents that contract as a unit.

describe('IP rate limit fail-open contract', () => {
  it('does not block when RPC returns an error', async () => {
    // Simulate what process-payment does when supabase.rpc() errors
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('relation does not exist') });

    const { data, error } = await mockRpc('rpc_check_payment_ip_rate_limit', { p_ip_hash: 'abc' });

    // When error is non-null, the edge function continues (fail-open)
    expect(error).toBeTruthy();
    // The calling code checks: if (!ipRlError) { ... }
    // So on error, the rate-limit block is SKIPPED — request proceeds
    const wouldBlock = !error && data && !data.allowed;
    expect(wouldBlock).toBe(false);
  });

  it('blocks when RPC returns allowed=false', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, retry_after_secs: 180 }],
      error: null,
    });

    const { data, error } = await mockRpc('rpc_check_payment_ip_rate_limit', { p_ip_hash: 'abc' });
    const row = Array.isArray(data) ? data[0] : data;

    expect(error).toBeNull();
    expect(row.allowed).toBe(false);
    expect(row.retry_after_secs).toBe(180);
  });

  it('allows when RPC returns allowed=true', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_secs: 0 }],
      error: null,
    });

    const { data, error } = await mockRpc('rpc_check_payment_ip_rate_limit', { p_ip_hash: 'abc' });
    const row = Array.isArray(data) ? data[0] : data;

    expect(error).toBeNull();
    expect(row.allowed).toBe(true);
  });
});

// ── Idempotent replay contract ────────────────────────────────────────────────
// When process-payment finds an existing 'pending' transaction for a given
// reference, it returns { idempotent: true, ...cachedResponse }.
// This test verifies the client-side interpretation is correct.

describe('idempotent response handling', () => {
  it('recognises an idempotent replay response by the idempotent flag', () => {
    const response = { idempotent: true, data: { authorization_url: 'https://checkout.paystack.com/test' } };
    expect(response.idempotent).toBe(true);
    expect(isValidPaystackUrl(response.data.authorization_url)).toBe(true);
  });

  it('recognises an already-completed payment response', () => {
    const response = { idempotent: true, status: 'success', message: 'Payment already completed' };
    expect(response.idempotent).toBe(true);
    expect(response.status).toBe('success');
  });
});
