import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  ScimUserSchema,
  ScimPatchOpSchema,
  CreateScimTokenSchema,
  ScimTokenRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { identityService } from "../services/identity.service.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

// ==========================================
// SCIM 2.0 PROTOCOL ROUTER (RFC 7643 / 7644)
// ==========================================

export const scimRouter = Router({ mergeParams: true });

// SCIM Content-Type Middleware
scimRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Content-Type", "application/scim+json");
  next();
});

// Middleware to authenticate SCIM Bearer token
function requireScimAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const targetOrgId = req.params.orgId || req.params.organizationId;

  try {
    const scimToken = identityService.authenticateScimBearerToken(
      authHeader,
      targetOrgId,
    );
    (req as any).scimToken = scimToken;
    (req as any).scimOrgId = scimToken.organizationId;
    next();
  } catch (err: any) {
    const isForbidden = err.message.includes("cross-tenant");
    res.status(isForbidden ? 403 : 401).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: isForbidden ? "403" : "401",
      detail: err.message,
    });
  }
}

/**
 * 1. GET /Users: List and filter users
 */
scimRouter.get("/Users", requireScimAuth, (req: Request, res: Response) => {
  const orgId = (req as any).scimOrgId;
  const filter = req.query.filter as string | undefined;
  const startIndex = Math.max(
    1,
    parseInt(req.query.startIndex as string, 10) || 1,
  );
  const count = Math.min(
    100,
    Math.max(1, parseInt(req.query.count as string, 10) || 50),
  );

  // Get members belonging to this organization
  const orgMembers = Array.from(apiStore.memberships.values()).filter(
    (m) => m.organizationId === orgId,
  );
  const memberUserIds = new Set(orgMembers.map((m) => m.userId));

  let users = Array.from(apiStore.users.values()).filter((u) =>
    memberUserIds.has(u.id),
  );

  // Handle SCIM filter e.g. userName eq "user@example.com" or emails.value eq "user@example.com"
  if (filter) {
    const match = filter.match(/(?:userName|emails\.value)\s+eq\s+"([^"]+)"/i);
    if (match) {
      const emailFilter = match[1].toLowerCase().trim();
      users = users.filter((u) => u.email.toLowerCase() === emailFilter);
    }
  }

  const totalResults = users.length;
  const paginated = users.slice(startIndex - 1, startIndex - 1 + count);
  const resources = paginated.map((u) =>
    identityService.formatScimUser(u, orgId),
  );

  res.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  });
});

/**
 * 2. POST /Users: Provision new SCIM user
 */
scimRouter.post("/Users", requireScimAuth, (req: Request, res: Response) => {
  const orgId = (req as any).scimOrgId;
  const scimToken = (req as any).scimToken;

  const parseResult = ScimUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid SCIM User payload schema.",
      scimType: "invalidValue",
    });
    return;
  }

  try {
    const scimUser = identityService.scimCreateUser(
      orgId,
      parseResult.data,
      scimToken.name,
    );
    res.status(201).json(scimUser);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      detail: err.message,
      scimType: status === 409 ? "uniqueness" : "invalidValue",
    });
  }
});

/**
 * 3. GET /Users/:id: Retrieve user by ID
 */
scimRouter.get("/Users/:id", requireScimAuth, (req: Request, res: Response) => {
  const orgId = (req as any).scimOrgId;
  const userId = req.params.id;

  const isMember = Array.from(apiStore.memberships.values()).some(
    (m) => m.organizationId === orgId && m.userId === userId,
  );
  const user = apiStore.users.get(userId);

  if (!isMember || !user) {
    res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "404",
      detail: `User '${userId}' not found in organization.`,
    });
    return;
  }

  res.json(identityService.formatScimUser(user, orgId));
});

/**
 * 4. PUT /Users/:id: Full user update
 */
scimRouter.put("/Users/:id", requireScimAuth, (req: Request, res: Response) => {
  const orgId = (req as any).scimOrgId;
  const userId = req.params.id;
  const scimToken = (req as any).scimToken;

  const parseResult = ScimUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid SCIM User payload.",
    });
    return;
  }

  try {
    const updated = identityService.scimUpdateUser(
      orgId,
      userId,
      parseResult.data,
      scimToken.name,
    );
    res.json(updated);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      detail: err.message,
    });
  }
});

/**
 * 5. PATCH /Users/:id: Partial update via SCIM PatchOp
 */
scimRouter.patch(
  "/Users/:id",
  requireScimAuth,
  (req: Request, res: Response) => {
    const orgId = (req as any).scimOrgId;
    const userId = req.params.id;
    const scimToken = (req as any).scimToken;

    const parseResult = ScimPatchOpSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        detail: "Invalid SCIM PatchOp schema.",
        scimType: "invalidSyntax",
      });
      return;
    }

    try {
      const patched = identityService.scimPatchUser(
        orgId,
        userId,
        parseResult.data,
        scimToken.name,
      );
      res.json(patched);
    } catch (err: any) {
      const status = err.status || 400;
      res.status(status).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: String(status),
        detail: err.message,
      });
    }
  },
);

/**
 * 6. DELETE /Users/:id: Deprovision user
 */
scimRouter.delete(
  "/Users/:id",
  requireScimAuth,
  (req: Request, res: Response) => {
    const orgId = (req as any).scimOrgId;
    const userId = req.params.id;
    const scimToken = (req as any).scimToken;

    try {
      identityService.scimDeleteUser(orgId, userId, scimToken.name);
      res.status(204).send();
    } catch (err: any) {
      const status = err.status || 400;
      res.status(status).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: String(status),
        detail: err.message,
      });
    }
  },
);

/**
 * 7. GET /Groups: List groups
 */
scimRouter.get("/Groups", requireScimAuth, (req: Request, res: Response) => {
  const orgId = (req as any).scimOrgId;
  const groups = Array.from(apiStore.groupRoleMappings.values())
    .filter((g) => g.organizationId === orgId)
    .map((g) => ({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: g.id,
      displayName: g.externalGroupName,
      members: [],
    }));

  res.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: groups.length,
    startIndex: 1,
    itemsPerPage: groups.length,
    Resources: groups,
  });
});

// ==========================================
// SCIM TOKEN MANAGEMENT ROUTER (ORG ADMIN)
// ==========================================

export const scimTokenAdminRouter = Router({ mergeParams: true });

scimTokenAdminRouter.use(requireAuth);

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function verifyOrgMembership(req: Request, res: Response, orgId: string) {
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
      return false;
    }
    return true;
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
    return false;
  }

  return true;
}

scimTokenAdminRouter.get(
  "/",
  requirePermission("scim:read"),
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
    if (!verifyOrgMembership(req, res, orgId)) return;

    const tokens = Array.from(apiStore.scimTokens.values())
      .filter((t) => t.organizationId === orgId)
      .map((t) => ({
        id: t.id,
        organizationId: t.organizationId,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      }));

    res.json({ success: true, data: tokens, error: null });
  },
);

scimTokenAdminRouter.post(
  "/",
  requirePermission("scim:write"),
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
    if (!verifyOrgMembership(req, res, orgId)) return;

    const parseResult = CreateScimTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid SCIM token creation parameters.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { name, expiresInDays } = parseResult.data;
    const rawSecret = `ff_scim_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawSecret)
      .digest("hex");
    const tokenPrefix = rawSecret.slice(0, 16);

    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);
    const tokenId = `scim_${crypto.randomUUID()}`;

    const tokenRecord: ScimTokenRecord = {
      id: tokenId,
      organizationId: orgId,
      name,
      tokenPrefix,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    };

    apiStore.scimTokens.set(tokenId, tokenRecord);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "scim.token.created",
      resourceType: "scim_token",
      resourceId: tokenId,
      metadata: { name, tokenPrefix, expiresAt },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        id: tokenId,
        name,
        tokenPrefix,
        token: rawSecret, // Returned once!
        expiresAt,
        scimBaseUrl: `${req.protocol}://${req.get("host")}/api/v1/scim/v2`,
      },
      error: null,
    });
  },
);

scimTokenAdminRouter.delete(
  "/:tokenId",
  requirePermission("scim:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const tokenId = req.params.tokenId;

    const token = apiStore.scimTokens.get(tokenId);
    if (!token || (orgId && token.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "SCIM token not found." },
      });
      return;
    }
    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    token.revokedAt = new Date();
    apiStore.scimTokens.set(tokenId, token);

    apiStore.recordAudit({
      organizationId: token.organizationId,
      userId: req.user?.id,
      action: "scim.token.revoked",
      resourceType: "scim_token",
      resourceId: tokenId,
      metadata: { tokenPrefix: token.tokenPrefix },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "SCIM token revoked successfully." },
      error: null,
    });
  },
);
