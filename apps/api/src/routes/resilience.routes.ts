import { Router, Request, Response } from "express";
import {
  ReconcileExecutionStepSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { resilienceService } from "../services/resilience.service.js";
import { apiStore } from "../store.js";

export const resilienceRouter = Router({ mergeParams: true });

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function getCaller(
  req: Request,
  orgId?: string,
): { userId: string; role: Role } | null {
  if (!req.user) return null;
  if (!orgId) {
    return { userId: req.user.id, role: "OWNER" };
  }
  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.organizationId === orgId && m.userId === req.user!.id,
  );
  if (membership) {
    return { userId: req.user.id, role: membership.role };
  }
  if (req.isApiKey && req.organizationId === orgId && req.role) {
    return { userId: req.user.id, role: req.role };
  }
  return null;
}

// ==========================================
// Public / Cluster Readiness & Health
// ==========================================

resilienceRouter.get("/ready", async (req: Request, res: Response) => {
  const readiness = await resilienceService.getDetailedReadiness();
  const statusCode =
    readiness.status === "ready" || readiness.status === "degraded" ? 200 : 503;

  res.status(statusCode).json({
    success:
      readiness.status !== "not_ready" && readiness.status !== "shutting_down",
    data: readiness,
    error:
      statusCode === 503
        ? {
            code: "SERVICE_UNAVAILABLE",
            message:
              readiness.status === "shutting_down"
                ? "Server is currently draining connections for shutdown."
                : "Server dependencies are not ready.",
          }
        : null,
  });
});

resilienceRouter.get("/health/ready", async (req: Request, res: Response) => {
  const readiness = await resilienceService.getDetailedReadiness();
  const statusCode =
    readiness.status === "ready" || readiness.status === "degraded" ? 200 : 503;

  res.status(statusCode).json({
    success:
      readiness.status !== "not_ready" && readiness.status !== "shutting_down",
    data: readiness,
    error:
      statusCode === 503
        ? {
            code: "SERVICE_UNAVAILABLE",
            message:
              readiness.status === "shutting_down"
                ? "Server is currently draining connections for shutdown."
                : "Server dependencies are not ready.",
          }
        : null,
  });
});

// Authenticated Routes
resilienceRouter.use(requireAuth);

// ==========================================
// 1. List Distributed Leases & Claims
// ==========================================
resilienceRouter.get("/leases", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (caller && !hasPermission(caller.role, "resilience:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires resilience:read permission.",
      },
    });
  }

  const activeLeases = resilienceService.listActiveLeases();
  const activeClaims = resilienceService.listActiveScheduleClaims();
  const pendingReconciliations =
    resilienceService.listPendingReconciliations(orgId);

  res.json({
    success: true,
    data: {
      activeLeases,
      activeClaims,
      pendingReconciliations,
    },
    error: null,
  });
});

// ==========================================
// 2. List Pending Step Reconciliations
// ==========================================
resilienceRouter.get("/reconciliations", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (caller && !hasPermission(caller.role, "resilience:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires resilience:read permission.",
      },
    });
  }

  const reconciliations = resilienceService.listPendingReconciliations(orgId);

  res.json({
    success: true,
    data: reconciliations,
    error: null,
  });
});

// ==========================================
// 3. Reconcile Execution Step
// ==========================================
resilienceRouter.post(
  "/reconcile/:executionId",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const caller = getCaller(req, orgId);

    if (caller && !hasPermission(caller.role, "resilience:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires resilience:admin permission.",
        },
      });
    }

    const parseResult = ReconcileExecutionStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid reconciliation payload.",
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const stepId =
        (req.body.stepId as string) || (req.query.stepId as string);
      const result = resilienceService.reconcileStep({
        organizationId: orgId || req.organizationId!,
        executionId: req.params.executionId,
        stepId,
        action: parseResult.data.action,
        reason: parseResult.data.reason,
        resolvedBy: caller?.userId || req.user?.id || "operator",
        notes: parseResult.data.notes,
      });

      res.json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: err.code || "RECONCILIATION_FAILED",
          message: err.message,
        },
      });
    }
  },
);

// Alias route: /reconcile/:executionId/steps/:stepId
resilienceRouter.post(
  "/reconcile/:executionId/steps/:stepId",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const caller = getCaller(req, orgId);

    if (caller && !hasPermission(caller.role, "resilience:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires resilience:admin permission.",
        },
      });
    }

    const parseResult = ReconcileExecutionStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid reconciliation payload.",
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const result = resilienceService.reconcileStep({
        organizationId: orgId || req.organizationId!,
        executionId: req.params.executionId,
        stepId: req.params.stepId,
        action: parseResult.data.action,
        reason: parseResult.data.reason,
        resolvedBy: caller?.userId || req.user?.id || "operator",
        notes: parseResult.data.notes,
      });

      res.json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: err.code || "RECONCILIATION_FAILED",
          message: err.message,
        },
      });
    }
  },
);

// ==========================================
// 4. Simulate Regional Failover / Connection Drain
// ==========================================
resilienceRouter.post(
  "/failover/simulate",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const caller = getCaller(req, orgId);

    if (caller && !hasPermission(caller.role, "resilience:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires resilience:admin permission.",
        },
      });
    }

    const sourceRegion = (req.body?.sourceRegion as string) || "us-east-1";
    const targetRegion = (req.body?.targetRegion as string) || "us-west-2";
    const drainTimeoutMs =
      typeof req.body?.drainTimeoutMs === "number"
        ? req.body.drainTimeoutMs
        : 5000;

    const result = await resilienceService.simulateFailover({
      sourceRegion,
      targetRegion,
      drainTimeoutMs,
      requestedBy: caller?.userId || req.user?.id,
    });

    res.json({
      success: true,
      data: result,
      error: null,
    });
  },
);

// ==========================================
// 5. Verify Backup Snapshot Integrity
// ==========================================
resilienceRouter.post("/backup/verify", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (caller && !hasPermission(caller.role, "resilience:admin")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires resilience:admin permission.",
      },
    });
  }

  const { snapshotId, snapshotContent, expectedSha256, entityCounts } =
    req.body;
  if (!snapshotId || !snapshotContent || !expectedSha256) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message:
          "snapshotId, snapshotContent, and expectedSha256 are required.",
      },
    });
  }

  const result = resilienceService.verifyBackupIntegrity({
    snapshotId,
    snapshotContent,
    expectedSha256,
    entityCounts,
  });

  res.json({
    success: true,
    data: result,
    error: null,
  });
});
