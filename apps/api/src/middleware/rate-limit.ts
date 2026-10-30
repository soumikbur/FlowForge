import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

/**
 * Enterprise Rate Limiter supporting configurable windows, headers, and key generators.
 */
export function rateLimit(
  windowMsOrOptions: number | RateLimitOptions = 60000,
  maxRequestsArg: number = 100,
) {
  const options: RateLimitOptions =
    typeof windowMsOrOptions === "object"
      ? windowMsOrOptions
      : {
          windowMs: windowMsOrOptions,
          maxRequests: maxRequestsArg,
        };

  const windowMs = options.windowMs || 60000;
  const maxRequests = options.maxRequests || 100;
  const keyGenerator =
    options.keyGenerator ||
    ((req: Request) => req.ip || req.socket.remoteAddress || "unknown-client");

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", maxRequests - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

      res.status(429).json({
        success: false,
        data: null,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            options.message ||
            `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
          details: { retryAfterSeconds },
        },
      });
      return;
    }

    record.count++;
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));
    next();
  };
}

/**
 * Helper to reset rate limits (useful in testing)
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
