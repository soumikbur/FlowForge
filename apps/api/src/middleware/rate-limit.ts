import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { apiReliabilityService } from "../services/api-reliability.service.js";

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
  category?: "auth" | "execute" | "search" | "default";
}

/**
 * Enterprise Rate Limiter supporting configurable windows, headers, multi-tenant isolation,
 * canonical error envelope, and telemetry.
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
  const category = options.category || "default";

  const keyGenerator =
    options.keyGenerator ||
    ((req: Request) => {
      const orgId = req.organizationId || (req as any).user?.organizationId;
      const principal = req.apiKey?.id || (req as any).user?.id;
      const clientIp = req.ip || req.socket.remoteAddress || "unknown-ip";

      if (orgId && principal) {
        return `rate:${category}:${orgId}:${principal}`;
      }
      if (orgId) {
        return `rate:${category}:${orgId}:${clientIp}`;
      }
      return `rate:${category}:${clientIp}`;
    });

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();
    const requestId =
      (req as any).requestId ||
      (req.headers["x-request-id"] as string) ||
      `req_${crypto.randomUUID()}`;

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
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((record.resetTime - now) / 1000),
      );
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

      apiReliabilityService.recordRateLimitHit();

      res.status(429).json({
        success: false,
        data: null,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            options.message ||
            `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
          details: { retryAfterSeconds },
          requestId,
          retryable: true,
          docUrl: "https://docs.flowforge.dev/errors#RATE_LIMIT_EXCEEDED",
        },
      });
      return;
    }

    record.count++;
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - record.count),
    );
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));
    next();
  };
}

export const authRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 60,
  category: "auth",
  message: "Authentication rate limit exceeded. Please wait before retrying.",
});

export const executeRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 120,
  category: "execute",
  message:
    "Workflow execution rate limit exceeded. Please slow down submission rate.",
});

export const searchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 60,
  category: "search",
  message: "Search query rate limit exceeded.",
});

export const defaultRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 300,
  category: "default",
});

/**
 * Helper to reset rate limits (useful in testing)
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
