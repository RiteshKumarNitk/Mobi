import type { Request, Response, NextFunction } from "express";

/**
 * In-memory fixed-window rate limiter. Per-process: with several API replicas,
 * each keeps its own counters — move to Redis (or enforce at the proxy) when
 * scaling out. Expired windows are swept so memory stays bounded.
 */
const hits = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 50_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
}, 60_000).unref();

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  /** Optional extra key material derived from the request (e.g. phone number). */
  keyFrom?: (req: Request) => string | undefined;
}

export function rateLimit({ windowMs = 60_000, max = 60, keyFrom }: RateLimitOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "test") return next(); // tests must not trip limits
    const extra = keyFrom ? keyFrom(req) ?? "" : "";
    const key = `${req.method}:${req.path}:${req.ip ?? "unknown"}:${extra}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value as string);
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many requests. Please try again in a minute." },
      });
      return;
    }
    next();
  };
}
