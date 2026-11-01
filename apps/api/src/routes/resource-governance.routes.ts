import { Router, Request, Response } from "express";
import { ResourceQuotaSchema } from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { resourceGovernanceService } from "../services/resource-governance.service.js";
import { apiStore } from "../store.js";

export const resourceGovernanceRouter = Router({ mergeParams: true });

resourceGovernanceRouter.use(requireAuth);

/**
 * Helper to extract organizationId from req.organizationId or req.params.organizationId
 */
function getOrgId(req: Request): string {
  return (req.params.organizationId as string) || req.organizationId!;
}

// ==========================================
// 1. LIST CONFIGURED QUOTA POLICIES
// ==========================================
resourceGovernanceRouter.get(
  "/",
  requirePermission("quotas:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const quotas = Array.from(apiStore.resourceQuotas.values()).filter(
      (q) => q.organizationId === orgId,
    );

    res.json({
      success: true,
      data: quotas,
      error: null,
    });
  },
);

// ==========================================
// 2. GET EFFECTIVE RESOLVED QUOTA
// ==========================================
resourceGovernanceRouter.get(
  "/effective",
  requirePermission("quotas:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workspaceId = req.query.workspaceId as string | undefined;
    const workflowId = req.query.workflowId as string | undefined;

    const effective = resourceGovernanceService.getEffectiveQuota(
      orgId,
      workspaceId,
      workflowId,
    );

    res.json({
      success: true,
      data: effective,
      error: null,
    });
  },
);

// ==========================================
// 3. CONFIGURE OR UPDATE QUOTA POLICY
// ==========================================
resourceGovernanceRouter.post(
  "/",
  requirePermission("quotas:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const parsed = ResourceQuotaSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid resource quota parameters",
          details: parsed.error.issues,
        },
      });
    }

    const record = resourceGovernanceService.upsertQuotaPolicy(
      orgId,
      parsed.data,
      req.user?.id,
    );

    res.status(201).json({
      success: true,
      data: record,
      error: null,
    });
  },
);

// ==========================================
// 4. RESOURCE UTILIZATION & QUEUE CAPACITY
// ==========================================
resourceGovernanceRouter.get(
  "/utilization",
  requirePermission("quotas:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const utilization = resourceGovernanceService.getUtilization(orgId);

    res.json({
      success: true,
      data: utilization,
      error: null,
    });
  },
);

// ==========================================
// 5. COST BUDGET STATUS & THRESHOLD ALERTS
// ==========================================
resourceGovernanceRouter.get(
  "/budget",
  requirePermission("quotas:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const budgetStatus = resourceGovernanceService.getCostBudgetStatus(orgId);

    res.json({
      success: true,
      data: budgetStatus,
      error: null,
    });
  },
);

// ==========================================
// 6. ADMINISTRATIVE RECONCILIATION
// ==========================================
resourceGovernanceRouter.post(
  "/reconcile",
  requirePermission("quotas:admin"),
  (req: Request, res: Response) => {
    const result = resourceGovernanceService.reconcileResourceState();

    res.json({
      success: true,
      data: {
        reconciledAt: new Date().toISOString(),
        ...result,
      },
      error: null,
    });
  },
);
