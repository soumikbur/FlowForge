import { Router, Request, Response } from "express";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { identityService } from "../services/identity.service.js";

export const sessionGovernanceRouter = Router({ mergeParams: true });

sessionGovernanceRouter.use(requireAuth);

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

/**
 * 1. GET /: List active sessions for organization members
 */
sessionGovernanceRouter.get(
  "/",
  requirePermission("sso:read"),
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

    const orgMembers = Array.from(apiStore.memberships.values()).filter(
      (m) => m.organizationId === orgId,
    );
    const memberUserIds = new Set(orgMembers.map((m) => m.userId));

    const now = new Date();
    const sessions = Array.from(apiStore.sessions.values())
      .filter((s) => memberUserIds.has(s.userId) && new Date(s.expiresAt) > now)
      .map((s) => {
        const user = apiStore.users.get(s.userId);
        const membership = orgMembers.find((m) => m.userId === s.userId);
        return {
          id: s.id,
          userId: s.userId,
          userEmail: user?.email,
          userName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
          role: membership?.role,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          lastActivityAt: s.lastActivityAt || s.expiresAt,
          expiresAt: s.expiresAt,
        };
      });

    res.json({ success: true, data: sessions, error: null });
  },
);

/**
 * 2. DELETE /:sessionId: Administratively terminate a member session
 */
sessionGovernanceRouter.delete(
  "/:sessionId",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const sessionId = req.params.sessionId;

    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }
    if (!verifyOrgMembership(req, res, orgId)) return;

    let session = apiStore.sessions.get(sessionId);
    if (!session) {
      session = Array.from(apiStore.sessions.values()).find(
        (s) => s.id === sessionId || s.token === sessionId,
      );
    }

    if (!session) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Session not found." },
      });
      return;
    }

    // Verify target user is in the organization
    const isMember = Array.from(apiStore.memberships.values()).some(
      (m) => m.organizationId === orgId && m.userId === session!.userId,
    );

    if (!isMember) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Session does not belong to a member of this organization.",
        },
      });
      return;
    }

    apiStore.sessions.delete(session.id);
    for (const [k, v] of apiStore.sessions.entries()) {
      if (v.id === session.id || v.token === session.token) {
        apiStore.sessions.delete(k);
      }
    }

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "session.administratively_revoked",
      resourceType: "session",
      resourceId: sessionId,
      metadata: { targetUserId: session.userId },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Session revoked successfully." },
      error: null,
    });
  },
);

/**
 * 3. POST /revoke-all: Administratively revoke all sessions across the organization
 */
sessionGovernanceRouter.post(
  "/revoke-all",
  requirePermission("sso:admin"),
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

    const currentToken =
      req.cookies?.flowforge_session ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");

    const keepCurrent = req.body?.keepCurrentSession !== false;
    const revokedCount = identityService.revokeAllSessionsForOrganization(
      orgId,
      keepCurrent ? currentToken : undefined,
    );

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "session.all_organization_revoked",
      resourceType: "organization",
      resourceId: orgId,
      metadata: { revokedCount, keepCurrentSession: keepCurrent },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        message: `Revoked ${revokedCount} active sessions across organization.`,
        revokedCount,
      },
      error: null,
    });
  },
);
