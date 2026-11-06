/**
 * Sliding-window rate limiter kept in memory.
 * On Vercel each server instance has its own memory, so this is a speed bump, not a hard wall.
 * For a strict, shared limit swap the Map for Redis (for example Upstash) with the same interface.
 */
export function createLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function take(key: string, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false as const, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value!); // keep memory bounded
    return { ok: true as const, retryAfter: 0 };
  };
}
