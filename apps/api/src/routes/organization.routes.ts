import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  OrganizationSettingsSchema,
  TransferOwnershipSchema,
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  CreateInvitationSchema,
  AcceptInvitationSchema,
  CreateApiKeySchema,
  RetentionCleanupSchema,
  PaginationQuerySchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import {
  apiStore,
  OrganizationInvitationRecord,
  ApiKeyRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";

export const organizationRouter = Router();

// ==========================================
// 0. PUBLIC / SEMI-PUBLIC INVITATION ACCEPTANCE
// (Mounted before requireAuth to support token-based acceptance)
// ==========================================
organizationRouter.post("/invitations/accept", (req: Request, res: Response) => {
  const parseResult = AcceptInvitationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Valid invitation token required.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { token } = parseResult.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const invitation = Array.from(apiStore.invitations.values()).find(
    (inv) => inv.tokenHash === tokenHash,
  );

  if (!invitation) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "INVITATION_NOT_FOUND",
        message: "Invitation token is invalid or has expired.",
      },
    });
    return;
  }

  if (invitation.status === "ACCEPTED") {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVITATION_ALREADY_USED",
        message: "This invitation has already been accepted.",
      },
    });
    return;
  }

  if (invitation.status === "REVOKED") {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVITATION_REVOKED",
        message: "This invitation has been revoked by an administrator.",
      },
    });
    return;
  }

  if (new Date() > new Date(invitation.expiresAt)) {
    invitation.status = "EXPIRED";
    apiStore.invitations.set(invitation.id, invitation);
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVITATION_EXPIRED",
        message: "This invitation has expired.",
      },
    });
    return;
  }

  // Find or create target user for invitation email
  let targetUser = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === invitation.email.toLowerCase(),
  );

  if (!targetUser) {
    const newUserId = `usr_${crypto.randomUUID()}`;
    targetUser = {
      id: newUserId,
      email: invitation.email.toLowerCase(),
      passwordHash: "pending_setup",
      firstName: invitation.email.split("@")[0],
    };
    apiStore.users.set(newUserId, targetUser);
  }

  // Check if membership already exists
  let membership = Array.from(apiStore.memberships.values()).find(
    (m) =>
      m.organizationId === invitation.organizationId &&
      m.userId === targetUser!.id,
  );

  if (!membership) {
    const membershipId = `mem_${crypto.randomUUID()}`;
    membership = {
      id: membershipId,
      organizationId: invitation.organizationId,
      userId: targetUser.id,
      role: invitation.role,
    };
    apiStore.memberships.set(membershipId, membership);
  } else {
    membership.role = invitation.role;
    apiStore.memberships.set(membership.id, membership);
  }

  // Mark invitation accepted
  invitation.status = "ACCEPTED";
  invitation.acceptedAt = new Date();
  invitation.updatedAt = new Date();
  apiStore.invitations.set(invitation.id, invitation);

  apiStore.recordAudit({
    organizationId: invitation.organizationId,
    userId: targetUser.id,
    action: "organization.invitation.accepted",
    resourceType: "invitation",
    resourceId: invitation.id,
    metadata: {
      email: invitation.email,
      role: invitation.role,
      membershipId: membership.id,
    },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      organizationId: invitation.organizationId,
      membershipId: membership.id,
      role: invitation.role,
      acceptedAt: invitation.acceptedAt,
    },
    error: null,
  });
});

// Protect all subsequent administrative routes
organizationRouter.use(requireAuth);

/**
 * Helper to resolve the authenticated caller's membership and verify organization boundaries.
 */
function resolveCallerMembership(req: Request, res: Response, orgId: string) {
  // If API Key:
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
    return {
      id: `mem_api_key_${req.apiKey!.id}`,
      organizationId: orgId,
      userId: req.user!.id,
      role: "MEMBER" as Role,
    };
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
        timezone: org.timezone || "UTC",
        billingEmail: org.billingEmail || null,
        enforce2FA: org.enforce2FA || false,
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
  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot create new organizations.",
      },
    });
    return;
  }

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
    timezone: "UTC",
    billingEmail: null,
    enforce2FA: false,
    allowedIpRanges: [],
    executionRetentionDays: 90,
    auditRetentionDays: 365,
    createdAt: new Date(),
    updatedAt: new Date(),
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
      timezone: "UTC",
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
      timezone: org.timezone || "UTC",
      billingEmail: org.billingEmail || null,
      enforce2FA: org.enforce2FA || false,
      allowedIpRanges: org.allowedIpRanges || [],
      executionRetentionDays: org.executionRetentionDays || 90,
      auditRetentionDays: org.auditRetentionDays || 365,
    },
    error: null,
  });
});

// ==========================================
// 4. Organization Settings
// ==========================================
organizationRouter.get("/:organizationId/settings", (req, res) => {
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
      timezone: org.timezone || "UTC",
      billingEmail: org.billingEmail || null,
      enforce2FA: org.enforce2FA || false,
      allowedIpRanges: org.allowedIpRanges || [],
      executionRetentionDays: org.executionRetentionDays || 90,
      auditRetentionDays: org.auditRetentionDays || 365,
      role: callerMem.role,
    },
    error: null,
  });
});

organizationRouter.patch("/:organizationId/settings", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot modify organization settings.",
      },
    });
    return;
  }

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

  const parseResult = OrganizationSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid organization settings payload",
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

  const updates = parseResult.data;
  if (updates.name) {
    org.name = updates.name;
    org.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
  if (updates.timezone !== undefined) org.timezone = updates.timezone;
  if (updates.billingEmail !== undefined) org.billingEmail = updates.billingEmail;
  if (updates.enforce2FA !== undefined) org.enforce2FA = updates.enforce2FA;
  if (updates.allowedIpRanges !== undefined) org.allowedIpRanges = updates.allowedIpRanges;
  if (updates.executionRetentionDays !== undefined)
    org.executionRetentionDays = updates.executionRetentionDays;
  if (updates.auditRetentionDays !== undefined)
    org.auditRetentionDays = updates.auditRetentionDays;
  org.updatedAt = new Date();

  apiStore.organizations.set(orgId, org);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.settings_updated",
    resourceType: "organization",
    resourceId: orgId,
    metadata: updates,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone || "UTC",
      billingEmail: org.billingEmail || null,
      enforce2FA: org.enforce2FA || false,
      allowedIpRanges: org.allowedIpRanges || [],
      executionRetentionDays: org.executionRetentionDays || 90,
      auditRetentionDays: org.auditRetentionDays || 365,
    },
    error: null,
  });
});

// Backward-compatible alias for updating organization name
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
// 5. Transfer Organization Ownership
// ==========================================
organizationRouter.post("/:organizationId/transfer-ownership", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot transfer ownership.",
      },
    });
    return;
  }

  if (callerMem.role !== "OWNER") {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Only organization owners can transfer ownership.",
      },
    });
    return;
  }

  const parseResult = TransferOwnershipSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid transfer ownership payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { newOwnerUserId } = parseResult.data;

  if (newOwnerUserId === req.user!.id) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_TARGET",
        message: "You are already the owner of this organization.",
      },
    });
    return;
  }

  const targetMem = Array.from(apiStore.memberships.values()).find(
    (m) => m.organizationId === orgId && m.userId === newOwnerUserId,
  );

  if (!targetMem) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "MEMBER_NOT_FOUND",
        message: "Target user is not a member of this organization.",
      },
    });
    return;
  }

  // Promote target to OWNER
  targetMem.role = "OWNER";
  apiStore.memberships.set(targetMem.id, targetMem);

  // Demote caller to ADMIN
  callerMem.role = "ADMIN";
  apiStore.memberships.set(callerMem.id, callerMem);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.ownership_transferred",
    resourceType: "organization",
    resourceId: orgId,
    metadata: {
      previousOwnerId: req.user!.id,
      newOwnerId: newOwnerUserId,
    },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      previousOwnerId: req.user!.id,
      newOwnerId: newOwnerUserId,
      message: "Organization ownership successfully transferred.",
    },
    error: null,
  });
});

// ==========================================
// 6. List Organization Members (with Pagination & Search)
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

  const queryParse = PaginationQuerySchema.safeParse(req.query);
  const { page, pageSize, search, status } = queryParse.success
    ? queryParse.data
    : { page: 1, pageSize: 20, search: undefined, status: undefined };

  let members = Array.from(apiStore.memberships.values()).filter(
    (m) => m.organizationId === orgId,
  );

  if (status) {
    members = members.filter((m) => m.role === status);
  }

  let mappedMembers = members.map((m) => {
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

  if (search) {
    const searchLower = search.toLowerCase();
    mappedMembers = mappedMembers.filter(
      (m) =>
        m.user?.email.toLowerCase().includes(searchLower) ||
        m.user?.firstName?.toLowerCase().includes(searchLower) ||
        m.user?.lastName?.toLowerCase().includes(searchLower),
    );
  }

  const total = mappedMembers.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedMembers = mappedMembers.slice(startIndex, startIndex + pageSize);

  res.json({
    success: true,
    data: paginatedMembers,
    error: null,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ==========================================
// 7. Add / Invite Member Directly
// ==========================================
organizationRouter.post("/:organizationId/members", async (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot add members directly.",
      },
    });
    return;
  }

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
// 8. Update Member Role
// ==========================================
organizationRouter.patch(
  "/:organizationId/members/:membershipId",
  (req, res) => {
    const orgId = req.params.organizationId;
    const callerMem = resolveCallerMembership(req, res, orgId);
    if (!callerMem) return;

    if (req.isApiKey) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API keys cannot modify member roles.",
        },
      });
      return;
    }

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
    const targetMembership = apiStore.memberships.get(req.params.membershipId);

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
// 9. Remove Member
// ==========================================
organizationRouter.delete(
  "/:organizationId/members/:membershipId",
  (req, res) => {
    const orgId = req.params.organizationId;
    const callerMem = resolveCallerMembership(req, res, orgId);
    if (!callerMem) return;

    if (req.isApiKey) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API keys cannot remove organization members.",
        },
      });
      return;
    }

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

    const targetMembership = apiStore.memberships.get(req.params.membershipId);

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
// 10. INVITATIONS LIFECYCLE
// ==========================================

// Create Invitation
organizationRouter.post("/:organizationId/invitations", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot issue invitations.",
      },
    });
    return;
  }

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

  const parseResult = CreateInvitationSchema.safeParse(req.body);
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

  // Non-owners cannot invite someone as OWNER
  if (role === "OWNER" && callerMem.role !== "OWNER") {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Only organization owners can invite new owners.",
      },
    });
    return;
  }

  // Check if user is already a member
  const existingUser = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (existingUser) {
    const existingMem = Array.from(apiStore.memberships.values()).find(
      (m) => m.organizationId === orgId && m.userId === existingUser.id,
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
  }

  // Check for duplicate pending invitation
  const existingInv = Array.from(apiStore.invitations.values()).find(
    (inv) =>
      inv.organizationId === orgId &&
      inv.email.toLowerCase() === email.toLowerCase() &&
      inv.status === "PENDING" &&
      new Date() < new Date(inv.expiresAt),
  );

  if (existingInv) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: "INVITATION_ALREADY_EXISTS",
        message: "An active invitation has already been sent to this email address.",
      },
    });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitationId = `inv_${crypto.randomUUID()}`;
  const invitationRecord: OrganizationInvitationRecord = {
    id: invitationId,
    organizationId: orgId,
    email: email.toLowerCase(),
    role: role as Role,
    tokenHash,
    inviterId: req.user!.id,
    expiresAt,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  apiStore.invitations.set(invitationId, invitationRecord);

  // Audit event (raw token excluded)
  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.invitation.created",
    resourceType: "invitation",
    resourceId: invitationId,
    metadata: { email: email.toLowerCase(), role, expiresAt },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      id: invitationId,
      organizationId: orgId,
      email: email.toLowerCase(),
      role,
      expiresAt: expiresAt.toISOString(),
      status: "PENDING",
      token: rawToken, // Displayed ONLY once at creation
      invitationUrl: `/invitations/accept?token=${rawToken}`,
    },
    error: null,
  });
});

// List Invitations
organizationRouter.get("/:organizationId/invitations", (req, res) => {
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

  const statusFilter = req.query.status as string;

  let invitations = Array.from(apiStore.invitations.values()).filter(
    (inv) => inv.organizationId === orgId,
  );

  if (statusFilter) {
    invitations = invitations.filter((inv) => inv.status === statusFilter);
  }

  const safeInvitations = invitations
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((inv) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role,
      inviterId: inv.inviterId,
      status:
        inv.status === "PENDING" && new Date() > new Date(inv.expiresAt)
          ? "EXPIRED"
          : inv.status,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    }));

  res.json({
    success: true,
    data: safeInvitations,
    error: null,
    meta: { total: safeInvitations.length },
  });
});

// Revoke Invitation
organizationRouter.post(
  "/:organizationId/invitations/:invitationId/revoke",
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

    const invitation = apiStore.invitations.get(req.params.invitationId);
    if (!invitation || invitation.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Invitation not found." },
      });
      return;
    }

    if (invitation.status === "ACCEPTED") {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_STATE",
          message: "Cannot revoke an invitation that has already been accepted.",
        },
      });
      return;
    }

    invitation.status = "REVOKED";
    invitation.updatedAt = new Date();
    apiStore.invitations.set(invitation.id, invitation);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user!.id,
      action: "organization.invitation.revoked",
      resourceType: "invitation",
      resourceId: invitation.id,
      metadata: { email: invitation.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        id: invitation.id,
        status: "REVOKED",
        message: "Invitation successfully revoked.",
      },
      error: null,
    });
  },
);

// ==========================================
// 11. API KEYS LIFECYCLE
// ==========================================

// Create API Key
organizationRouter.post("/:organizationId/api-keys", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot generate additional API keys.",
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

  const parseResult = CreateApiKeySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid API key payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { name, scopes, expiresInDays } = parseResult.data;
  const rawToken = "ff_live_" + crypto.randomBytes(24).toString("hex");
  const keyPrefix = rawToken.slice(0, 16);
  const keyHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const keyId = `key_${crypto.randomUUID()}`;
  const apiKeyRecord: ApiKeyRecord = {
    id: keyId,
    organizationId: orgId,
    name,
    keyPrefix,
    keyHash,
    scopes,
    createdById: req.user!.id,
    expiresAt,
    createdAt: new Date(),
  };

  apiStore.apiKeys.set(keyId, apiKeyRecord);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.api_key.created",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: { name, keyPrefix, scopes, expiresAt },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      id: keyId,
      organizationId: orgId,
      name,
      keyPrefix,
      scopes,
      expiresAt: expiresAt?.toISOString(),
      token: rawToken, // Displayed ONLY once at creation!
      createdAt: apiKeyRecord.createdAt.toISOString(),
    },
    error: null,
  });
});

// List API Keys
organizationRouter.get("/:organizationId/api-keys", (req, res) => {
  const orgId = req.params.organizationId;
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

  const keys = Array.from(apiStore.apiKeys.values())
    .filter((k) => k.organizationId === orgId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    }));

  res.json({
    success: true,
    data: keys,
    error: null,
    meta: { total: keys.length },
  });
});

// Revoke API Key
organizationRouter.delete("/:organizationId/api-keys/:keyId", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot revoke API keys.",
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

  const apiKey = apiStore.apiKeys.get(req.params.keyId);
  if (!apiKey || apiKey.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "API key not found." },
    });
    return;
  }

  apiKey.revokedAt = new Date();
  apiStore.apiKeys.set(apiKey.id, apiKey);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.api_key.revoked",
    resourceType: "api_key",
    resourceId: apiKey.id,
    metadata: { keyPrefix: apiKey.keyPrefix, name: apiKey.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: { message: "API key revoked successfully." },
    error: null,
  });
});

// ==========================================
// 12. DATA RETENTION & CLEANUP
// ==========================================
organizationRouter.post("/:organizationId/retention/cleanup", (req, res) => {
  const orgId = req.params.organizationId;
  const callerMem = resolveCallerMembership(req, res, orgId);
  if (!callerMem) return;

  if (req.isApiKey) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "API keys cannot trigger retention cleanup.",
      },
    });
    return;
  }

  if (!hasPermission(callerMem.role, "retention:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'retention:write'.",
      },
    });
    return;
  }

  const parseResult = RetentionCleanupSchema.safeParse(req.body);
  const dryRun = parseResult.success ? parseResult.data.dryRun ?? true : true;

  const org = apiStore.organizations.get(orgId);
  const retentionDays =
    (parseResult.success ? parseResult.data.olderThanDays : undefined) ||
    org?.executionRetentionDays ||
    90;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Eligible executions: within this org, created before cutoff, strictly TERMINAL status
  const eligibleExecutions = Array.from(apiStore.executions.values()).filter(
    (e) =>
      e.organizationId === orgId &&
      new Date(e.createdAt) < cutoff &&
      ["SUCCEEDED", "FAILED", "CANCELLED"].includes(e.status),
  );

  let prunedCount = 0;
  if (!dryRun) {
    for (const exec of eligibleExecutions) {
      apiStore.executions.delete(exec.id);
      // Prune steps
      for (const [stepId, step] of apiStore.steps.entries()) {
        if (step.executionId === exec.id) {
          apiStore.steps.delete(stepId);
        }
      }
      prunedCount++;
    }
  }

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user!.id,
    action: "organization.retention.cleanup",
    resourceType: "retention",
    resourceId: orgId,
    metadata: {
      dryRun,
      retentionDays,
      cutoff: cutoff.toISOString(),
      candidateCount: eligibleExecutions.length,
      prunedCount: dryRun ? 0 : prunedCount,
    },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      dryRun,
      retentionDays,
      cutoff: cutoff.toISOString(),
      candidateExecutionsCount: eligibleExecutions.length,
      prunedExecutionsCount: dryRun ? 0 : prunedCount,
    },
    error: null,
  });
});

// ==========================================
// 13. Organization Audit Logs (with Filtering & Redaction)
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

  const actionFilter = req.query.action as string;
  const resourceTypeFilter = req.query.resourceType as string;
  const userIdFilter = req.query.userId as string;
  const fromFilter = req.query.from ? new Date(req.query.from as string) : undefined;
  const toFilter = req.query.to ? new Date(req.query.to as string) : undefined;

  let logs = apiStore.auditLogs.filter((l) => l.organizationId === orgId);

  if (actionFilter) {
    logs = logs.filter((l) => l.action.includes(actionFilter));
  }
  if (resourceTypeFilter) {
    logs = logs.filter((l) => l.resourceType === resourceTypeFilter);
  }
  if (userIdFilter) {
    logs = logs.filter((l) => l.userId === userIdFilter);
  }
  if (fromFilter) {
    logs = logs.filter((l) => new Date(l.createdAt) >= fromFilter);
  }
  if (toFilter) {
    logs = logs.filter((l) => new Date(l.createdAt) < toFilter);
  }

  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
