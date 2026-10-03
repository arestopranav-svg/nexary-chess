/** Token bucket, one bucket per key (socket id). Time is injected so it is deterministic in tests. */
export interface RateLimiter { tryConsume(key: string): boolean; forget(key: string): void }

export function createRateLimiter(ratePerSec: number, burst: number = ratePerSec, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { tokens: number; last: number }>();
  return {
    tryConsume(key) {
      const t = now();
      const b = buckets.get(key) ?? { tokens: burst, last: t };
      b.tokens = Math.min(burst, b.tokens + (Math.max(0, t - b.last) / 1000) * ratePerSec);
      b.last = t;
      const ok = b.tokens >= 1;
      if (ok) b.tokens -= 1;
      buckets.set(key, b);
      return ok;
    },
    forget(key) { buckets.delete(key); },
  };
}
