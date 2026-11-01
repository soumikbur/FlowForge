import { Router, Request, Response } from "express";
import {
  CreateOAuthClientSchema,
  UpdateOAuthClientSchema,
  OAuthTokenRequestSchema,
  hasPermission,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { oauthService, OAuthError } from "../services/oauth.service.js";
import { rateLimit } from "../middleware/rate-limit.js";

// Router for RFC 6749 token exchange (POST /token)
export const oauthTokenRouter = Router();

// Stricter rate limiting on token endpoint to defend against brute force
oauthTokenRouter.use(rateLimit(60000, 60));

/**
 * POST /token: OAuth 2.0 Client Credentials Token Endpoint
 */
oauthTokenRouter.post("/token", (req: Request, res: Response) => {
  let clientId: string | undefined = req.body?.client_id;
  let clientSecret: string | undefined = req.body?.client_secret;

  // 1. Check HTTP Basic Authentication Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const credentials = Buffer.from(authHeader.slice(6), "base64").toString(
        "utf8",
      );
      const colonIdx = credentials.indexOf(":");
      if (colonIdx !== -1) {
        clientId = decodeURIComponent(credentials.slice(0, colonIdx));
        clientSecret = decodeURIComponent(credentials.slice(colonIdx + 1));
      }
    } catch {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Malformed Authorization header.",
      });
      return;
    }
  }

  // 2. Validate grant_type
  const grantType = req.body?.grant_type;
  if (!grantType || grantType !== "client_credentials") {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Grant type must be 'client_credentials'.",
    });
    return;
  }

  if (!clientId || !clientSecret) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing client_id or client_secret.",
    });
    return;
  }

  const requestedScope = req.body?.scope;

  try {
    const tokenResponse = oauthService.issueToken({
      clientId,
      clientSecret,
      requestedScope,
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.json(tokenResponse);
  } catch (err: any) {
    if (err instanceof OAuthError) {
      res.status(err.status).json({
        error: err.error,
        error_description: err.description,
      });
      return;
    }

    res.status(500).json({
      error: "server_error",
      error_description: "An unexpected error occurred while issuing token.",
    });
  }
});

// Organization-scoped OAuth Client Administration Router
export const oauthClientAdminRouter = Router({ mergeParams: true });
oauthClientAdminRouter.use(requireAuth);

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function resolveCallerMembership(req: Request, res: Response, orgId: string) {
  if (req.isApiKey) {
    if (req.organizationId !== orgId) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API key is not authorized for this organization.",
        },
      });
      return null;
    }
    return { role: req.role || "MEMBER" };
  }

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === req.user!.id && m.organizationId === orgId,
  );

  if (!membership) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You are not a member of this organization.",
      },
    });
    return null;
  }

  return membership;
}

/**
 * 1. POST /: Register confidential OAuth client
 */
oauthClientAdminRouter.post("/", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID required." },
    });
    return;
  }

  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot register OAuth clients.",
      },
    });
    return;
  }

  if (!hasPermission(callerMem.role, "api-keys:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'api-keys:write'.",
      },
    });
    return;
  }

  const parseResult = CreateOAuthClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid OAuth client payload.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { name, scopes, workspaceId } = parseResult.data;

  // If workspaceId is provided, verify workspace exists and belongs to organization
  if (workspaceId) {
    const ws = apiStore.workspaces.get(workspaceId);
    if (!ws || ws.organizationId !== orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_WORKSPACE",
          message: "Workspace not found in this organization.",
        },
      });
      return;
    }
  }

  const { client, clientSecret } = oauthService.createClient({
    organizationId: orgId,
    workspaceId,
    name,
    scopes,
    createdById: req.user!.id,
  });

  res.status(201).json({
    success: true,
    data: {
      id: client.id,
      organizationId: client.organizationId,
      workspaceId: client.workspaceId,
      name: client.name,
      clientId: client.clientId,
      scopes: client.scopes,
      enabled: client.enabled,
      clientSecret, // Revealed ONLY once upon registration!
      createdAt: client.createdAt,
    },
    error: null,
  });
});

/**
 * 2. GET /: List registered OAuth clients
 */
oauthClientAdminRouter.get("/", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID required." },
    });
    return;
  }

  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "api-keys:read")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'api-keys:read'.",
      },
    });
    return;
  }

  const clients = Array.from(apiStore.oauthClients.values())
    .filter((c) => c.organizationId === orgId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      workspaceId: c.workspaceId,
      name: c.name,
      clientId: c.clientId,
      scopes: c.scopes,
      enabled: c.enabled,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

  res.json({
    success: true,
    data: clients,
    meta: { total: clients.length },
    error: null,
  });
});

/**
 * 3. GET /:clientId: Retrieve single OAuth client details
 */
oauthClientAdminRouter.get("/:clientId", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID required." },
    });
    return;
  }

  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "api-keys:read")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'api-keys:read'.",
      },
    });
    return;
  }

  const client = apiStore.oauthClients.get(req.params.clientId);
  if (!client || client.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "OAuth client not found." },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      id: client.id,
      organizationId: client.organizationId,
      workspaceId: client.workspaceId,
      name: client.name,
      clientId: client.clientId,
      scopes: client.scopes,
      enabled: client.enabled,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    error: null,
  });
});

/**
 * 4. PATCH /:clientId: Update OAuth client properties or disable client
 */
oauthClientAdminRouter.patch("/:clientId", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID required." },
    });
    return;
  }

  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot modify OAuth clients.",
      },
    });
    return;
  }

  if (!hasPermission(callerMem.role, "api-keys:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'api-keys:write'.",
      },
    });
    return;
  }

  const client = apiStore.oauthClients.get(req.params.clientId);
  if (!client || client.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "OAuth client not found." },
    });
    return;
  }

  const parseResult = UpdateOAuthClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid update payload.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  if (parseResult.data.name !== undefined) client.name = parseResult.data.name;
  if (parseResult.data.scopes !== undefined)
    client.scopes = parseResult.data.scopes;
  if (parseResult.data.enabled !== undefined)
    client.enabled = parseResult.data.enabled;
  client.updatedAt = new Date();

  apiStore.oauthClients.set(client.clientId, client);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "oauth.client.updated",
    resourceType: "oauth_client",
    resourceId: client.id,
    metadata: {
      clientId: client.clientId,
      name: client.name,
      enabled: client.enabled,
      scopes: client.scopes,
    },
  });

  res.json({
    success: true,
    data: {
      id: client.id,
      organizationId: client.organizationId,
      workspaceId: client.workspaceId,
      name: client.name,
      clientId: client.clientId,
      scopes: client.scopes,
      enabled: client.enabled,
      updatedAt: client.updatedAt,
    },
    error: null,
  });
});

/**
 * 5. POST /:clientId/rotate-secret: Rotate client secret
 */
oauthClientAdminRouter.post(
  "/:clientId/rotate-secret",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    const callerMem = resolveCallerMembership(req, res, orgId);
    if (!callerMem) return;

    if (req.isApiKey) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API keys cannot rotate OAuth client secrets.",
        },
      });
      return;
    }

    if (!hasPermission(callerMem.role, "api-keys:write")) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires permission 'api-keys:write'.",
        },
      });
      return;
    }

    try {
      const rotated = oauthService.rotateClientSecret(
        req.params.clientId,
        orgId,
        req.user?.id,
      );
      res.json({
        success: true,
        data: {
          clientId: rotated.clientId,
          clientSecret: rotated.clientSecret, // Revealed ONLY once upon rotation!
          message: "OAuth client secret rotated successfully.",
        },
        error: null,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        success: false,
        data: null,
        error: { code: err.error || "ERROR", message: err.message },
      });
    }
  },
);

/**
 * 6. DELETE /:clientId: Revoke / delete OAuth client
 */
oauthClientAdminRouter.delete("/:clientId", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID required." },
    });
    return;
  }

  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot delete OAuth clients.",
      },
    });
    return;
  }

  if (!hasPermission(callerMem.role, "api-keys:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'api-keys:write'.",
      },
    });
    return;
  }

  const client = apiStore.oauthClients.get(req.params.clientId);
  if (!client || client.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "OAuth client not found." },
    });
    return;
  }

  apiStore.oauthClients.delete(client.clientId);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "oauth.client.deleted",
    resourceType: "oauth_client",
    resourceId: client.id,
    metadata: { clientId: client.clientId, name: client.name },
  });

  res.json({
    success: true,
    data: { message: "OAuth client deleted successfully." },
    error: null,
  });
});
