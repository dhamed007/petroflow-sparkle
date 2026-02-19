/**
 * Client-side Rate Limiter (Sliding Window)
 *
 * Prevents excessive API calls to Supabase.
 * Configurable per endpoint category.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const timestamps: Map<string, number[]> = new Map();

const LIMITS: Record<string, RateLimitConfig> = {
  gps: { maxRequests: 6, windowMs: 60000 },       // 6/min (every 10s)
  erp: { maxRequests: 10, windowMs: 60000 },       // 10/min
  payment: { maxRequests: 5, windowMs: 60000 },    // 5/min
  general: { maxRequests: 60, windowMs: 60000 },   // 60/min
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // ms until next allowed request
  remaining: number;
}

/**
 * Check if a request is allowed under the rate limit
 */
export function checkRateLimit(category: string): RateLimitResult {
  const config = LIMITS[category] || LIMITS.general;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get timestamps for this category
  let times = timestamps.get(category) || [];

  // Remove expired timestamps
  times = times.filter(t => t > windowStart);

  if (times.length >= config.maxRequests) {
    const oldestInWindow = times[0];
    const retryAfter = oldestInWindow + config.windowMs - now;
    timestamps.set(category, times);
    return {
      allowed: false,
      retryAfter: Math.max(0, retryAfter),
      remaining: 0,
    };
  }

  // Allow and record
  times.push(now);
  timestamps.set(category, times);

  return {
    allowed: true,
    remaining: config.maxRequests - times.length,
  };
}

/**
 * Wrap an async function with rate limiting
 */
export function withRateLimit<T>(
  category: string,
  fn: () => Promise<T>
): Promise<T> {
  const result = checkRateLimit(category);
  if (!result.allowed) {
    return Promise.reject(
      new Error(`Rate limited (${category}). Retry in ${Math.ceil((result.retryAfter || 0) / 1000)}s`)
    );
  }
  return fn();
}

/**
 * Throttle function - ensures minimum delay between calls
 */
export function createThrottle(minIntervalMs: number): (fn: () => void) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (fn: () => void) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (timeoutId) clearTimeout(timeoutId);

    if (elapsed >= minIntervalMs) {
      lastCall = now;
      fn();
    } else {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn();
      }, minIntervalMs - elapsed);
    }
  };
}
