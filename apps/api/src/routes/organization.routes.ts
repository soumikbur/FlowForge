import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  PaginationQuerySchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";

export const organizationRouter = Router();

organizationRouter.use(requireAuth);

/**
 * Helper to resolve the authenticated caller's membership and verify organization membership.
 */
function resolveCallerMembership(req: Request, res: Response, orgId: string) {
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

// ==========================================
// 1. List Organizations for current user
// ==========================================
organizationRouter.get("/", (req, res) => {
  const userId = req.user!.id;
  const userMemberships = Array.from(apiStore.memberships.values()).filter(
    (m) => m.userId === userId,
  );

  const organizations = userMemberships
    .map((m) => {
      const org = apiStore.organizations.get(m.organizationId);
      if (!org) return null;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: m.role,
      };
    })
    .filter(Boolean);

  res.json({
    success: true,
    data: organizations,
    error: null,
    meta: { total: organizations.length },
  });
});

// ==========================================
// 2. Create new Organization
// ==========================================
organizationRouter.post("/", (req, res) => {
  const parseResult = CreateOrganizationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid organization details",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { name } = parseResult.data;
  const orgId = `org_${crypto.randomUUID()}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  apiStore.organizations.set(orgId, {
    id: orgId,
    name,
    slug,
  });

  const membershipId = `mem_${crypto.randomUUID()}`;
  apiStore.memberships.set(membershipId, {
    id: membershipId,
    organizationId: orgId,
    userId: req.user!.id,
    role: "OWNER",
  });

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.created",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { name, slug },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      id: orgId,
      name,
      slug,
      role: "OWNER",
    },
    error: null,
  });
});

// ==========================================
// 3. Get Organization details
// ==========================================
organizationRouter.get("/:organizationId", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  const org = apiStore.organizations.get(orgId);
  if (!org) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Organization not found." },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: callerMem.role,
    },
    error: null,
  });
});

// ==========================================
// 4. Update Organization
// ==========================================
organizationRouter.patch("/:organizationId", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "org:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'org:write'.",
      },
    });
    return;
  }

  const parseResult = UpdateOrganizationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid organization update",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const org = apiStore.organizations.get(orgId);
  if (!org) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Organization not found." },
    });
    return;
  }

  if (parseResult.data.name) {
    org.name = parseResult.data.name;
    org.slug = parseResult.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  apiStore.organizations.set(orgId, org);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: orgId,
    metadata: parseResult.data,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: callerMem.role,
    },
    error: null,
  });
});

// ==========================================
// 5. List Organization Members
// ==========================================
organizationRouter.get("/:organizationId/members", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "org:members:read")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'org:members:read'.",
      },
    });
    return;
  }

  const members = Array.from(apiStore.memberships.values())
    .filter((m) => m.organizationId === orgId)
    .map((m) => {
      const user = apiStore.users.get(m.userId);
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
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

  res.json({
    success: true,
    data: members,
    error: null,
    meta: { total: members.length },
  });
});

// ==========================================
// 6. Add / Invite Member
// ==========================================
organizationRouter.post("/:organizationId/members", async (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "org:members:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'org:members:write'.",
      },
    });
    return;
  }

  const parseResult = InviteMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid invitation payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { email, role } = parseResult.data;

  // Non-owners cannot assign OWNER role
  if (role === "OWNER" && callerMem.role !== "OWNER") {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Only organization owners can grant the OWNER role.",
      },
    });
    return;
  }

  // Find or create target user
  let targetUser = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );

  if (!targetUser) {
    const newUserId = `usr_${crypto.randomUUID()}`;
    targetUser = {
      id: newUserId,
      email: email.toLowerCase(),
      passwordHash: "pending_invitation",
      firstName: email.split("@")[0],
    };
    apiStore.users.set(newUserId, targetUser);
  }

  // Check if membership already exists
  const existingMem = Array.from(apiStore.memberships.values()).find(
    (m) => m.organizationId === orgId && m.userId === targetUser!.id,
  );

  if (existingMem) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: "MEMBER_EXISTS",
        message: "User is already a member of this organization.",
      },
    });
    return;
  }

  const membershipId = `mem_${crypto.randomUUID()}`;
  const newMembership = {
    id: membershipId,
    organizationId: orgId,
    userId: targetUser.id,
    role: role as Role,
  };

  apiStore.memberships.set(membershipId, newMembership);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.member.added",
    resourceType: "membership",
    resourceId: membershipId,
    metadata: { targetUserId: targetUser.id, email: targetUser.email, role },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      ...newMembership,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
      },
    },
    error: null,
  });
});

// ==========================================
// 7. Update Member Role
// ==========================================
organizationRouter.patch(
  "/:organizationId/members/:membershipId",
  (req, res) => {
    const orgId = req.params.organizationId;
    const callerMem = resolveCallerMembership(req, res, orgId);
    if (!callerMem) return;

    if (!hasPermission(callerMem.role, "org:members:write")) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires permission 'org:members:write'.",
        },
      });
      return;
    }

    const parseResult = UpdateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid role payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { role: newRole } = parseResult.data;
    const targetMembership = apiStore.memberships.get(
      req.params.membershipId,
    );

    if (!targetMembership || targetMembership.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Membership not found." },
      });
      return;
    }

    // Invariant: Non-owners cannot promote someone to OWNER or demote an OWNER
    if (
      (newRole === "OWNER" || targetMembership.role === "OWNER") &&
      callerMem.role !== "OWNER"
    ) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Only organization owners can modify the OWNER role.",
        },
      });
      return;
    }

    // Invariant: Prevent last owner demotion
    if (targetMembership.role === "OWNER" && newRole !== "OWNER") {
      const ownerCount = Array.from(apiStore.memberships.values()).filter(
        (m) => m.organizationId === orgId && m.role === "OWNER",
      ).length;

      if (ownerCount <= 1) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "LAST_OWNER_PROTECTION",
            message:
              "Cannot demote the last owner. Transfer ownership or assign another owner first.",
          },
        });
        return;
      }
    }

    targetMembership.role = newRole as Role;
    apiStore.memberships.set(targetMembership.id, targetMembership);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user!.id,
      action: "organization.member.role_updated",
      resourceType: "membership",
      resourceId: targetMembership.id,
      metadata: { newRole },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: targetMembership,
      error: null,
    });
  },
);

// ==========================================
// 8. Remove Member
// ==========================================
organizationRouter.delete(
  "/:organizationId/members/:membershipId",
  (req, res) => {
    const orgId = req.params.organizationId;
    const callerMem = resolveCallerMembership(req, res, orgId);
    if (!callerMem) return;

    if (!hasPermission(callerMem.role, "org:members:delete")) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires permission 'org:members:delete'.",
        },
      });
      return;
    }

    const targetMembership = apiStore.memberships.get(
      req.params.membershipId,
    );

    if (!targetMembership || targetMembership.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Membership not found." },
      });
      return;
    }

    // Invariant: Non-owners cannot remove owners
    if (targetMembership.role === "OWNER" && callerMem.role !== "OWNER") {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Only organization owners can remove an owner.",
        },
      });
      return;
    }

    // Invariant: Prevent last owner removal
    if (targetMembership.role === "OWNER") {
      const ownerCount = Array.from(apiStore.memberships.values()).filter(
        (m) => m.organizationId === orgId && m.role === "OWNER",
      ).length;

      if (ownerCount <= 1) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "LAST_OWNER_PROTECTION",
            message: "Cannot remove the last owner of an organization.",
          },
        });
        return;
      }
    }

    apiStore.memberships.delete(targetMembership.id);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user!.id,
      action: "organization.member.removed",
      resourceType: "membership",
      resourceId: targetMembership.id,
      metadata: { removedUserId: targetMembership.userId },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Member removed successfully." },
      error: null,
    });
  },
);

// ==========================================
// 9. Organization Audit Logs
// ==========================================
organizationRouter.get("/:organizationId/audit-logs", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (!hasPermission(callerMem.role, "audit:read")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'audit:read'.",
      },
    });
    return;
  }

  const queryParse = PaginationQuerySchema.safeParse(req.query);
  const { page, pageSize } = queryParse.success
    ? queryParse.data
    : { page: 1, pageSize: 20 };

  const logs = apiStore.auditLogs
    .filter((l) => l.organizationId === orgId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = logs.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedLogs = logs.slice(startIndex, startIndex + pageSize);

  res.json({
    success: true,
    data: paginatedLogs,
    error: null,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});
