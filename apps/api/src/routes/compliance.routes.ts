import { Router, Request, Response } from "express";
import {
  hasPermission,
  Role,
  RetentionPolicyInputSchema,
  CreateLegalHoldSchema,
  ReleaseLegalHoldSchema,
  CreatePrivacyRequestSchema,
  ReviewPrivacyRequestSchema,
  AuditExportQuerySchema,
  AuditQuerySchema,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { complianceService } from "../services/compliance.service.js";

export const complianceRouter = Router({ mergeParams: true });

complianceRouter.use("/audit", requireAuth);
complianceRouter.use("/audit-logs", requireAuth);
complianceRouter.use("/retention", requireAuth);
complianceRouter.use("/legal-holds", requireAuth);
complianceRouter.use("/privacy", requireAuth);
complianceRouter.use("/compliance", requireAuth);
complianceRouter.use("/governance", requireAuth);

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function resolveCaller(
  req: Request,
  res: Response,
  orgId: string,
): { role: Role; userId: string } | null {
  if (req.isApiKey || req.isOAuthClient) {
    if (req.organizationId !== orgId) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Credential is not authorized for this organization.",
        },
      });
      return null;
    }
    return {
      role: (req.apiKeyScopes?.includes("admin") ||
      req.apiKeyScopes?.includes("*")
        ? "OWNER"
        : "MEMBER") as Role,
      userId: req.apiKey?.id || req.user?.id || "machine_client",
    };
  }

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === req.user?.id && m.organizationId === orgId,
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

  return { role: membership.role, userId: req.user!.id };
}

// ==========================================
// 1. AUDIT INTEGRITY & EXPORT
// ==========================================

/**
 * POST /organizations/:id/audit/verify: Verify tamper-evident hash chain
 */
complianceRouter.post("/audit/verify", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:read") &&
    !hasPermission(caller.role, "audit:read")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:read or audit:read",
      },
    });
  }

  const result = complianceService.verifyAuditChain(orgId);
  res.json({ success: true, data: result, error: null });
});

/**
 * GET /organizations/:id/audit-logs & GET /organizations/:id/audit: Search & filter audit logs
 */
const auditSearchHandler = (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "audit:read") &&
    !hasPermission(caller.role, "compliance:read")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires audit:read or compliance:read",
      },
    });
  }

  const queryParse = AuditQuerySchema.safeParse(req.query);
  const {
    page,
    pageSize,
    action,
    resourceType,
    resourceId,
    actorId,
    actorType,
    outcome,
    from,
    to,
    correlationId,
    workspaceId,
  } = queryParse.success
    ? queryParse.data
    : {
        page: 1,
        pageSize: 20,
        action: undefined,
        resourceType: undefined,
        resourceId: undefined,
        actorId: undefined,
        actorType: undefined,
        outcome: undefined,
        from: undefined,
        to: undefined,
        correlationId: undefined,
        workspaceId: undefined,
      };

  let logs = apiStore.auditLogs.filter((l) => l.organizationId === orgId);

  if (action) {
    logs = logs.filter((l) => l.action.includes(action));
  }
  if (resourceType) {
    logs = logs.filter((l) => l.resourceType === resourceType);
  }
  if (resourceId) {
    logs = logs.filter((l) => l.resourceId === resourceId);
  }
  const targetActor = actorId || (req.query.userId as string);
  if (targetActor) {
    logs = logs.filter(
      (l) => l.userId === targetActor || l.actorId === targetActor,
    );
  }
  if (actorType) {
    logs = logs.filter((l) => (l.actorType || "USER") === actorType);
  }
  if (outcome) {
    logs = logs.filter((l) => (l.outcome || "SUCCESS") === outcome);
  }
  if (workspaceId) {
    logs = logs.filter((l) => l.workspaceId === workspaceId);
  }
  if (correlationId) {
    logs = logs.filter((l) => l.correlationId === correlationId);
  }
  if (from) {
    const fromDate = new Date(from);
    logs = logs.filter((l) => new Date(l.createdAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    logs = logs.filter((l) => new Date(l.createdAt) <= toDate);
  }

  logs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

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
};

complianceRouter.get("/audit-logs", auditSearchHandler);
complianceRouter.get("/audit", auditSearchHandler);

/**
 * POST /organizations/:id/audit/export: Secure audit export with CSV formula-injection defense
 */
complianceRouter.post("/audit/export", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:read") &&
    !hasPermission(caller.role, "audit:read")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:read or audit:read",
      },
    });
  }

  const queryParse = AuditExportQuerySchema.safeParse(req.body);
  if (!queryParse.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: queryParse.error.message },
    });
  }

  const exportResult = complianceService.exportAuditLogs(
    orgId,
    queryParse.data,
    caller.userId,
  );

  if (queryParse.data.format === "csv") {
    res.setHeader("Content-Type", exportResult.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${exportResult.filename}"`,
    );
    return res.send(exportResult.content);
  }

  res.setHeader("Content-Type", exportResult.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${exportResult.filename}"`,
  );
  res.send(exportResult.content);
});

// ==========================================
// 2. RETENTION POLICIES & JOBS
// ==========================================

/**
 * GET /organizations/:id/retention/policies: List retention policies
 */
complianceRouter.get("/retention/policies", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (!hasPermission(caller.role, "compliance:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires compliance:read" },
    });
  }

  const policies = complianceService.getRetentionPolicies(orgId);
  res.json({ success: true, data: policies, error: null });
});

/**
 * PUT /organizations/:id/retention/policies: Configure retention policy
 */
complianceRouter.put("/retention/policies", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:write") &&
    !hasPermission(caller.role, "retention:write")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:write or retention:write",
      },
    });
  }

  const parsed = RetentionPolicyInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  try {
    const updated = complianceService.setRetentionPolicy(
      orgId,
      parsed.data.category,
      parsed.data.retentionDays,
      parsed.data.enabled,
      parsed.data.legalHoldExempt,
      caller.userId,
    );
    res.json({ success: true, data: updated, error: null });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "INVALID_RETENTION_POLICY", message: err.message },
    });
  }
});

/**
 * POST /organizations/:id/retention/preview: Preview retention purge impact
 */
complianceRouter.post("/retention/preview", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (!hasPermission(caller.role, "compliance:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires compliance:read" },
    });
  }

  const category = req.body?.category as string | undefined;
  const preview = complianceService.previewRetention(orgId, category);
  res.json({ success: true, data: preview, error: null });
});

/**
 * POST /organizations/:id/retention/jobs: Trigger retention cleanup job or dry run
 */
complianceRouter.post("/retention/jobs", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:write") &&
    !hasPermission(caller.role, "retention:write")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:write or retention:write",
      },
    });
  }

  const category = req.body?.category as string | undefined;
  const dryRun = Boolean(req.body?.dryRun);

  const job = complianceService.runRetentionJob(
    orgId,
    category,
    dryRun,
    caller.userId,
  );
  res.status(201).json({ success: true, data: job, error: null });
});

/**
 * GET /organizations/:id/retention/jobs: List past retention jobs
 */
complianceRouter.get("/retention/jobs", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (!hasPermission(caller.role, "compliance:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires compliance:read" },
    });
  }

  const jobs = Array.from(apiStore.retentionJobs.values())
    .filter((j) => j.organizationId === orgId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  res.json({ success: true, data: jobs, error: null });
});

// ==========================================
// 3. LEGAL HOLDS & PRESERVATION
// ==========================================

/**
 * POST /organizations/:id/legal-holds: Create legal hold
 */
complianceRouter.post("/legal-holds", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:write") &&
    !hasPermission(caller.role, "legal-hold:write")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:write or legal-hold:write",
      },
    });
  }

  const parsed = CreateLegalHoldSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  const hold = complianceService.createLegalHold(
    orgId,
    parsed.data,
    caller.userId,
  );
  res.status(201).json({ success: true, data: hold, error: null });
});

/**
 * GET /organizations/:id/legal-holds: List legal holds
 */
complianceRouter.get("/legal-holds", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:read") &&
    !hasPermission(caller.role, "legal-hold:read")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:read or legal-hold:read",
      },
    });
  }

  let holds = Array.from(apiStore.legalHolds.values()).filter(
    (h) => h.organizationId === orgId,
  );
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter) {
    holds = holds.filter((h) => h.status === statusFilter);
  }

  holds.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.json({ success: true, data: holds, error: null });
});

/**
 * GET /organizations/:id/legal-holds/:holdId: Inspect single hold
 */
complianceRouter.get("/legal-holds/:holdId", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (
    !hasPermission(caller.role, "compliance:read") &&
    !hasPermission(caller.role, "legal-hold:read")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires compliance:read or legal-hold:read",
      },
    });
  }

  const hold = apiStore.legalHolds.get(req.params.holdId);
  if (!hold || hold.organizationId !== orgId) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Legal hold not found" },
    });
  }

  res.json({ success: true, data: hold, error: null });
});

/**
 * POST /organizations/:id/legal-holds/:holdId/release: Release legal hold
 */
complianceRouter.post(
  "/legal-holds/:holdId/release",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId)
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Missing orgId" },
      });

    const caller = resolveCaller(req, res, orgId);
    if (!caller) return;

    if (
      !hasPermission(caller.role, "compliance:write") &&
      !hasPermission(caller.role, "legal-hold:write")
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires compliance:write or legal-hold:write",
        },
      });
    }

    const parsed = ReleaseLegalHoldSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const released = complianceService.releaseLegalHold(
        orgId,
        req.params.holdId,
        parsed.data,
        caller.userId,
      );
      res.json({ success: true, data: released, error: null });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
  },
);

// ==========================================
// 4. PRIVACY REQUEST MANAGEMENT (GDPR/CCPA)
// ==========================================

/**
 * POST /organizations/:id/privacy/requests: Submit a privacy request
 */
complianceRouter.post("/privacy/requests", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  const parsed = CreatePrivacyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  // Members can only submit for themselves; Admins/Owners can submit for others
  if (
    parsed.data.userId &&
    parsed.data.userId !== caller.userId &&
    !hasPermission(caller.role, "compliance:write")
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message:
          "Cannot submit privacy requests on behalf of other users without compliance:write.",
      },
    });
  }

  const request = complianceService.submitPrivacyRequest(
    orgId,
    parsed.data,
    caller.userId,
  );
  res.status(201).json({ success: true, data: request, error: null });
});

/**
 * GET /organizations/:id/privacy/requests: List privacy requests
 */
complianceRouter.get("/privacy/requests", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  let requests = Array.from(apiStore.privacyRequests.values()).filter(
    (p) => p.organizationId === orgId,
  );

  // If not admin/compliance officer, restrict to user's own requests
  if (!hasPermission(caller.role, "compliance:read")) {
    requests = requests.filter((p) => p.userId === caller.userId);
  }

  requests.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.json({ success: true, data: requests, error: null });
});

/**
 * GET /organizations/:id/privacy/requests/:requestId: Inspect request detail
 */
complianceRouter.get(
  "/privacy/requests/:requestId",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId)
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Missing orgId" },
      });

    const caller = resolveCaller(req, res, orgId);
    if (!caller) return;

    const request = apiStore.privacyRequests.get(req.params.requestId);
    if (!request || request.organizationId !== orgId) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Privacy request not found" },
      });
    }

    if (
      request.userId !== caller.userId &&
      !hasPermission(caller.role, "compliance:read")
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
    }

    res.json({ success: true, data: request, error: null });
  },
);

/**
 * POST /organizations/:id/privacy/requests/:requestId/review: Review (Approve/Reject)
 */
complianceRouter.post(
  "/privacy/requests/:requestId/review",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId)
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Missing orgId" },
      });

    const caller = resolveCaller(req, res, orgId);
    if (!caller) return;

    if (
      !hasPermission(caller.role, "compliance:write") &&
      !hasPermission(caller.role, "privacy:write")
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires compliance:write or privacy:write",
        },
      });
    }

    const parsed = ReviewPrivacyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const reviewed = complianceService.reviewPrivacyRequest(
        orgId,
        req.params.requestId,
        parsed.data,
        caller.userId,
      );
      res.json({ success: true, data: reviewed, error: null });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
  },
);

/**
 * POST /organizations/:id/privacy/requests/:requestId/execute: Execute approved privacy request
 */
complianceRouter.post(
  "/privacy/requests/:requestId/execute",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId)
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Missing orgId" },
      });

    const caller = resolveCaller(req, res, orgId);
    if (!caller) return;

    if (
      !hasPermission(caller.role, "compliance:write") &&
      !hasPermission(caller.role, "privacy:write")
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires compliance:write or privacy:write",
        },
      });
    }

    try {
      const executed = complianceService.executePrivacyRequest(
        orgId,
        req.params.requestId,
        caller.userId,
      );
      res.json({ success: true, data: executed, error: null });
    } catch (err: any) {
      if (err.message.includes("legal hold")) {
        return res.status(409).json({
          success: false,
          data: null,
          error: { code: "LEGAL_HOLD_ACTIVE", message: err.message },
        });
      }
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "EXECUTION_FAILED", message: err.message },
      });
    }
  },
);

/**
 * GET /organizations/:id/privacy/requests/:requestId/artifact: Download exported personal data bundle
 */
complianceRouter.get(
  "/privacy/requests/:requestId/artifact",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId)
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Missing orgId" },
      });

    const caller = resolveCaller(req, res, orgId);
    if (!caller) return;

    const request = apiStore.privacyRequests.get(req.params.requestId);
    if (!request || request.organizationId !== orgId) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Privacy request not found" },
      });
    }

    if (
      request.userId !== caller.userId &&
      !hasPermission(caller.role, "compliance:read")
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
    }

    // Token check & expiration check
    const token = req.query.token as string | undefined;
    if (!token || (request.details as any)?.downloadToken !== token) {
      return res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_TOKEN",
          message: "Download token is invalid or missing",
        },
      });
    }

    if (
      request.artifactExpiresAt &&
      new Date() > new Date(request.artifactExpiresAt)
    ) {
      return res.status(410).json({
        success: false,
        data: null,
        error: {
          code: "EXPIRED",
          message: "Artifact download link has expired",
        },
      });
    }

    const bundle = (request.details as any)?.exportBundle || {};
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="personal-data-export-${request.userId}.json"`,
    );
    res.send(JSON.stringify(bundle, null, 2));
  },
);

// ==========================================
// 5. COMPLIANCE TECHNICAL CONTROLS & OVERVIEW
// ==========================================

/**
 * GET /organizations/:id/compliance/controls: Technical control inventory mapping
 */
complianceRouter.get("/compliance/controls", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (!hasPermission(caller.role, "compliance:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires compliance:read" },
    });
  }

  const catalog = complianceService.getComplianceControls(orgId);
  res.json({ success: true, data: catalog, error: null });
});

/**
 * GET /organizations/:id/governance/overview: Governance overview dashboard metrics
 */
complianceRouter.get("/governance/overview", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId)
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Missing orgId" },
    });

  const caller = resolveCaller(req, res, orgId);
  if (!caller) return;

  if (!hasPermission(caller.role, "compliance:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires compliance:read" },
    });
  }

  const overview = complianceService.getGovernanceOverview(orgId);
  res.json({ success: true, data: overview, error: null });
});
