import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  AddWorkspaceMemberSchema,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  Role,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";

export const workspaceRouter = Router({ mergeParams: true });

workspaceRouter.use(requireAuth);

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
 * 1. GET /: List workspaces for organization
 */
workspaceRouter.get(
  "/",
  requirePermission("workspace:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    const includeArchived = req.query.includeArchived === "true";
    let workspaces = Array.from(apiStore.workspaces.values()).filter(
      (w) =>
        w.organizationId === orgId &&
        (includeArchived || w.status !== "ARCHIVED"),
    );

    workspaces.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    const enriched = workspaces.map((w) => {
      const memberCount = Array.from(apiStore.workspaceMembers.values()).filter(
        (m) => m.workspaceId === w.id,
      ).length;
      const workflowCount = Array.from(apiStore.workflows.values()).filter(
        (wf) => wf.workspaceId === w.id && !wf.deletedAt,
      ).length;
      return {
        ...w,
        memberCount,
        workflowCount,
      };
    });

    res.json({ success: true, data: enriched, error: null });
  },
);

/**
 * 2. POST /: Create workspace
 */
workspaceRouter.post(
  "/",
  requirePermission("workspace:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    const parseResult = CreateWorkspaceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid workspace creation payload.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    // Quota enforcement
    const quota = entitlementService.checkWorkspaceQuota(orgId);
    if (!quota.allowed) {
      res.status(402).json({
        success: false,
        data: null,
        error: {
          code: quota.reason,
          message: quota.message,
          details: { limit: quota.limit, currentUsage: quota.currentUsage },
        },
      });
      return;
    }

    const { name, slug, description, timezone } = parseResult.data;

    // Uniqueness check for slug in organization
    const slugConflict = Array.from(apiStore.workspaces.values()).find(
      (w) =>
        w.organizationId === orgId &&
        w.slug.toLowerCase() === slug.toLowerCase(),
    );
    if (slugConflict) {
      res.status(409).json({
        success: false,
        data: null,
        error: {
          code: "SLUG_CONFLICT",
          message: `Workspace slug '${slug}' is already taken in this organization.`,
        },
      });
      return;
    }

    const existingInOrg = Array.from(apiStore.workspaces.values()).filter(
      (w) => w.organizationId === orgId,
    );
    const isDefault = existingInOrg.length === 0;

    const now = new Date();
    const workspaceId = `ws_${crypto.randomUUID()}`;
    const workspaceRecord: WorkspaceRecord = {
      id: workspaceId,
      organizationId: orgId,
      name,
      slug,
      description,
      status: "ACTIVE",
      isDefault,
      timezone: timezone || "UTC",
      brandingOverrides: {},
      createdById: req.user?.id,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.workspaces.set(workspaceId, workspaceRecord);

    // Automatically add creator as ADMIN member
    if (req.user?.id) {
      const memberRecord: WorkspaceMemberRecord = {
        id: `wsm_${crypto.randomUUID()}`,
        workspaceId,
        userId: req.user.id,
        role: "ADMIN",
        createdAt: now,
        updatedAt: now,
      };
      apiStore.workspaceMembers.set(memberRecord.id, memberRecord);
    }

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { name, slug, isDefault },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: workspaceRecord,
      error: null,
    });
  },
);

/**
 * 3. GET /:wsId: Get single workspace
 */
workspaceRouter.get(
  "/:wsId",
  requirePermission("workspace:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    const members = Array.from(apiStore.workspaceMembers.values()).filter(
      (m) => m.workspaceId === wsId,
    );
    const workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.workspaceId === wsId && !w.deletedAt,
    );

    res.json({
      success: true,
      data: {
        ...workspace,
        members,
        workflowCount: workflows.length,
      },
      error: null,
    });
  },
);

/**
 * 4. PATCH /:wsId: Update workspace settings
 */
workspaceRouter.patch(
  "/:wsId",
  requirePermission("workspace:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    const parseResult = UpdateWorkspaceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid workspace update data.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { name, description, timezone, brandingOverrides } = parseResult.data;
    if (name !== undefined) workspace.name = name;
    if (description !== undefined) workspace.description = description;
    if (timezone !== undefined) workspace.timezone = timezone;
    if (brandingOverrides !== undefined)
      workspace.brandingOverrides = brandingOverrides;
    workspace.updatedAt = new Date();

    apiStore.workspaces.set(wsId, workspace);

    apiStore.recordAudit({
      organizationId: workspace.organizationId,
      userId: req.user?.id,
      action: "workspace.updated",
      resourceType: "workspace",
      resourceId: wsId,
      metadata: { updatedFields: Object.keys(parseResult.data) },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: workspace, error: null });
  },
);

/**
 * 5. POST /:wsId/archive: Archive workspace
 */
workspaceRouter.post(
  "/:wsId/archive",
  requirePermission("workspace:delete"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    if (workspace.isDefault) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "CANNOT_ARCHIVE_DEFAULT",
          message: "The default workspace cannot be archived.",
        },
      });
      return;
    }

    workspace.status = "ARCHIVED";
    workspace.archivedAt = new Date();
    workspace.updatedAt = new Date();
    apiStore.workspaces.set(wsId, workspace);

    apiStore.recordAudit({
      organizationId: workspace.organizationId,
      userId: req.user?.id,
      action: "workspace.archived",
      resourceType: "workspace",
      resourceId: wsId,
      metadata: { name: workspace.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: workspace, error: null });
  },
);

/**
 * 6. POST /:wsId/restore: Restore archived workspace
 */
workspaceRouter.post(
  "/:wsId/restore",
  requirePermission("workspace:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    if (workspace.status !== "ARCHIVED") {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "NOT_ARCHIVED",
          message: "Workspace is already active.",
        },
      });
      return;
    }

    // Quota check before restoring
    const quota = entitlementService.checkWorkspaceQuota(
      workspace.organizationId,
    );
    if (!quota.allowed) {
      res.status(402).json({
        success: false,
        data: null,
        error: {
          code: quota.reason,
          message: `Cannot restore workspace: ${quota.message}`,
          details: { limit: quota.limit, currentUsage: quota.currentUsage },
        },
      });
      return;
    }

    workspace.status = "ACTIVE";
    workspace.archivedAt = undefined;
    workspace.updatedAt = new Date();
    apiStore.workspaces.set(wsId, workspace);

    apiStore.recordAudit({
      organizationId: workspace.organizationId,
      userId: req.user?.id,
      action: "workspace.restored",
      resourceType: "workspace",
      resourceId: wsId,
      metadata: { name: workspace.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: workspace, error: null });
  },
);

/**
 * 7. GET /:wsId/members: List workspace members
 */
workspaceRouter.get(
  "/:wsId/members",
  requirePermission("workspace:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    const members = Array.from(apiStore.workspaceMembers.values())
      .filter((m) => m.workspaceId === wsId)
      .map((m) => {
        const user = apiStore.users.get(m.userId);
        return {
          ...m,
          user: user
            ? {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              }
            : null,
        };
      });

    res.json({ success: true, data: members, error: null });
  },
);

/**
 * 8. POST /:wsId/members: Add or update workspace member
 */
workspaceRouter.post(
  "/:wsId/members",
  requirePermission("workspace:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const wsId = req.params.wsId;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    const parseResult = AddWorkspaceMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid member payload.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { userId, role } = parseResult.data;

    // Verify target user is in the parent organization
    const isOrgMember = Array.from(apiStore.memberships.values()).some(
      (m) =>
        m.organizationId === workspace.organizationId && m.userId === userId,
    );
    if (!isOrgMember) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "NOT_ORGANIZATION_MEMBER",
          message:
            "User must be a member of the organization before joining a workspace.",
        },
      });
      return;
    }

    let existing = Array.from(apiStore.workspaceMembers.values()).find(
      (m) => m.workspaceId === wsId && m.userId === userId,
    );

    const now = new Date();
    if (existing) {
      existing.role = role;
      existing.updatedAt = now;
      apiStore.workspaceMembers.set(existing.id, existing);
    } else {
      existing = {
        id: `wsm_${crypto.randomUUID()}`,
        workspaceId: wsId,
        userId,
        role,
        createdAt: now,
        updatedAt: now,
      };
      apiStore.workspaceMembers.set(existing.id, existing);
    }

    apiStore.recordAudit({
      organizationId: workspace.organizationId,
      userId: req.user?.id,
      action: "workspace.member.updated",
      resourceType: "workspace_member",
      resourceId: existing.id,
      metadata: { workspaceId: wsId, targetUserId: userId, role },
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: existing, error: null });
  },
);

/**
 * 9. DELETE /:wsId/members/:userId: Remove member from workspace
 */
workspaceRouter.delete(
  "/:wsId/members/:userId",
  requirePermission("workspace:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const { wsId, userId } = req.params;

    const workspace = apiStore.workspaces.get(wsId);
    if (!workspace || (orgId && workspace.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    const member = Array.from(apiStore.workspaceMembers.values()).find(
      (m) => m.workspaceId === wsId && m.userId === userId,
    );

    if (!member) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workspace member not found." },
      });
      return;
    }

    apiStore.workspaceMembers.delete(member.id);

    apiStore.recordAudit({
      organizationId: workspace.organizationId,
      userId: req.user?.id,
      action: "workspace.member.removed",
      resourceType: "workspace_member",
      resourceId: member.id,
      metadata: { workspaceId: wsId, removedUserId: userId },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Member removed from workspace." },
      error: null,
    });
  },
);
