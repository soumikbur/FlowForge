import { Request, Response, NextFunction } from "express";
import { ApiVersionInfo, ApiDeprecationInfo } from "@flowforge/shared";

export const API_VERSION_INFO: ApiVersionInfo = {
  version: "1.0.0",
  apiVersion: "v1",
  minSupportedVersion: "1.0.0",
  status: "active",
  releaseDate: "2026-01-01T00:00:00Z",
  documentationUrl: "https://docs.flowforge.dev/api/v1",
  supportedVersions: ["v1", "1.0.0"],
};

export const API_DEPRECATIONS: ApiDeprecationInfo[] = [
  {
    path: "/api/v1/workflows/:id/trigger",
    deprecatedSince: "2026-06-01T00:00:00Z",
    sunsetDate: "2027-01-01T00:00:00Z",
    alternativePath: "/api/v1/workflows/:id/execute",
    reason:
      "Legacy trigger endpoint is superseded by the unified /execute API.",
    docUrl: "https://docs.flowforge.dev/deprecations#trigger-to-execute",
  },
  {
    path: "/api/v1/webhooks/deliveries/:id/retry",
    deprecatedSince: "2026-09-01T00:00:00Z",
    sunsetDate: "2027-01-01T00:00:00Z",
    alternativePath: "/api/v1/webhooks/deliveries/:id/replay",
    reason:
      "Deliveries retry endpoint is superseded by the unified /replay API.",
    docUrl: "https://docs.flowforge.dev/deprecations#retry-to-replay",
  },
];

export class ApiLifecycleService {
  public getVersionInfo(): ApiVersionInfo {
    return API_VERSION_INFO;
  }

  public getDeprecations(): ApiDeprecationInfo[] {
    return API_DEPRECATIONS;
  }

  public isVersionSupported(requestedVersion: string): boolean {
    const clean = requestedVersion.trim().toLowerCase();
    return (
      clean === "v1" ||
      clean === "1" ||
      clean === "1.0" ||
      clean === "1.0.0" ||
      clean === "latest"
    );
  }
}

export const apiLifecycleService = new ApiLifecycleService();

/**
 * Middleware for header-based API version negotiation.
 * Evaluates 'Accept-Version' or 'FlowForge-Version'.
 */
export function versionNegotiationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const acceptVersion =
    (req.headers["accept-version"] as string) ||
    (req.headers["flowforge-version"] as string);

  if (acceptVersion) {
    if (!apiLifecycleService.isVersionSupported(acceptVersion)) {
      const requestId =
        (req as any).requestId ||
        (req.headers["x-request-id"] as string) ||
        "req_unknown";
      res.status(406).json({
        success: false,
        data: null,
        error: {
          code: "UNSUPPORTED_API_VERSION",
          message: `The requested API version '${acceptVersion}' is not supported. Supported versions: ${API_VERSION_INFO.supportedVersions.join(", ")}`,
          details: {
            requestedVersion: acceptVersion,
            supportedVersions: API_VERSION_INFO.supportedVersions,
            currentVersion: API_VERSION_INFO.apiVersion,
          },
          requestId,
          retryable: false,
          docUrl: "https://docs.flowforge.dev/api/versioning",
        },
      });
      return;
    }
  }

  res.setHeader("X-API-Version", API_VERSION_INFO.apiVersion);
  next();
}
