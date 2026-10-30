import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { apiStore } from "../store.js";
import { Role } from "@flowforge/shared";
import { ApiKeyRecord } from "@flowforge/test-utils";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
      };
      organizationId?: string;
      role?: Role;
      isApiKey?: boolean;
      apiKey?: ApiKeyRecord;
      apiKeyScopes?: string[];
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKeyHeader = (req.headers["x-api-key"] as string) || undefined;
  const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const sessionCookie = req.cookies?.flowforge_session;

  const rawToken = apiKeyHeader || authHeader || sessionCookie;

  if (!rawToken) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to access this resource.",
      },
    });
    return;
  }

  // 1. Check if token is an API Key (starts with "ff_" or passed via x-api-key)
  if (apiKeyHeader || rawToken.startsWith("ff_")) {
    const keyHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const apiKey = Array.from(apiStore.apiKeys.values()).find(
      (k) => k.keyHash === keyHash,
    );

    if (!apiKey) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_API_KEY",
          message: "API key is invalid or unknown.",
        },
      });
      return;
    }

    if (apiKey.revokedAt) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "REVOKED_API_KEY",
          message: "API key has been revoked.",
        },
      });
      return;
    }

    if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "EXPIRED_API_KEY",
          message: "API key has expired.",
        },
      });
      return;
    }

    const org = apiStore.organizations.get(apiKey.organizationId);
    if (!org) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "ORGANIZATION_NOT_FOUND",
          message: "Organization associated with this API key no longer exists.",
        },
      });
      return;
    }

    // Update last used timestamp
    apiKey.lastUsedAt = new Date();
    apiStore.apiKeys.set(apiKey.id, apiKey);

    const creator = apiStore.users.get(apiKey.createdById);

    req.isApiKey = true;
    req.apiKey = apiKey;
    req.apiKeyScopes = apiKey.scopes;
    req.organizationId = apiKey.organizationId;
    req.role = "MEMBER";
    req.user = creator
      ? {
          id: creator.id,
          email: creator.email,
          firstName: creator.firstName,
          lastName: creator.lastName,
        }
      : {
          id: apiKey.createdById,
          email: "service-account@flowforge.internal",
        };

    return next();
  }

  // 2. Otherwise look up User Session
  const session = Array.from(apiStore.sessions.values()).find(
    (s) => s.token === rawToken,
  );

  if (!session || new Date() > new Date(session.expiresAt)) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_SESSION",
        message: "Session has expired or is invalid.",
      },
    });
    return;
  }

  const user = apiStore.users.get(session.userId);
  if (!user) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "USER_NOT_FOUND",
        message: "Associated user could not be found.",
      },
    });
    return;
  }

  // Find user membership
  const userMemberships = Array.from(apiStore.memberships.values()).filter(
    (m) => m.userId === user.id,
  );

  const requestedOrgId = (req.headers["x-organization-id"] as string) || undefined;
  const membership = requestedOrgId
    ? userMemberships.find((m) => m.organizationId === requestedOrgId)
    : userMemberships[0];

  req.user = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  if (membership) {
    req.organizationId = membership.organizationId;
    req.role = membership.role;
  }

  next();
}
