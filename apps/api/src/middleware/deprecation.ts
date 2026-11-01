import { Request, Response, NextFunction } from "express";

export interface DeprecationOptions {
  successorUrl: string;
  sunsetDate?: string;
  deprecatedSinceTimestamp?: number;
}

/**
 * RFC 8594 Deprecation & Sunset Header Middleware.
 * Emits:
 * - Deprecation: @<epoch_seconds> (or true)
 * - Sunset: <HTTP-date>
 * - Link: <successorUrl>; rel="successor-version"
 */
export function deprecationNotice(options: DeprecationOptions | string) {
  const opts: DeprecationOptions =
    typeof options === "string" ? { successorUrl: options } : options;

  const sunsetDate = opts.sunsetDate || "Fri, 01 Jan 2027 00:00:00 GMT";
  const deprecationValue = opts.deprecatedSinceTimestamp
    ? `@${opts.deprecatedSinceTimestamp}`
    : "@1735689600";

  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Deprecation", deprecationValue);
    res.setHeader("Sunset", sunsetDate);
    res.setHeader("Link", `<${opts.successorUrl}>; rel="successor-version"`);
    next();
  };
}
