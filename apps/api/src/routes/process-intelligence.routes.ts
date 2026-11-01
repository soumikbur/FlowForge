import { Router, Request, Response } from "express";
import {
  ProcessIntelligenceQuerySchema,
  WorkflowComparisonQuerySchema,
  CreateWorkflowSloSchema,
  UpdateWorkflowSloSchema,
  RecordBusinessOutcomeSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { processIntelligenceService } from "../services/process-intelligence.service.js";
import { apiStore } from "../store.js";

export const processIntelligenceRouter = Router({ mergeParams: true });

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
  orgId: string,
): { userId: string; role: Role } | null {
  if (!req.user) return null;
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

processIntelligenceRouter.use(requireAuth);

/**
 * 1. GET /metrics: Process intelligence metrics & KPIs
 */
processIntelligenceRouter.get("/metrics", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const parseResult = ProcessIntelligenceQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid analytics query parameters.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const metrics = processIntelligenceService.getProcessMetrics(
    orgId,
    parseResult.data,
  );
  return res.json({ success: true, data: metrics, error: null });
});

/**
 * 2. GET /bottlenecks: Process bottleneck detection
 */
processIntelligenceRouter.get("/bottlenecks", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const workflowId = req.query.workflowId as string | undefined;
  const bottlenecks = processIntelligenceService.detectBottlenecks(orgId, {
    workflowId,
  });
  return res.json({ success: true, data: bottlenecks, error: null });
});

/**
 * 3. GET /anomalies: Statistical anomaly detection
 */
processIntelligenceRouter.get("/anomalies", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const workflowId = req.query.workflowId as string | undefined;
  const anomalies = processIntelligenceService.detectAnomalies(orgId, {
    workflowId,
  });
  return res.json({ success: true, data: anomalies, error: null });
});

/**
 * 4. POST /compare: Workflow version & regression comparison
 */
processIntelligenceRouter.post("/compare", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const parseResult = WorkflowComparisonQuerySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid workflow comparison payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const report = processIntelligenceService.compareWorkflowVersions(
    orgId,
    parseResult.data,
  );
  return res.json({ success: true, data: report, error: null });
});

/**
 * 5. GET /outcomes: Retrieve aggregated business outcomes
 */
processIntelligenceRouter.get("/outcomes", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const workflowId = req.query.workflowId as string | undefined;
  const data = processIntelligenceService.getBusinessOutcomes(
    orgId,
    workflowId,
  );
  return res.json({ success: true, data, error: null });
});

/**
 * 6. POST /outcomes: Record business outcome
 */
processIntelligenceRouter.post("/outcomes", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:write")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:write permission.",
      },
    });
  }

  const parseResult = RecordBusinessOutcomeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid business outcome payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const outcome = processIntelligenceService.recordBusinessOutcome(
    orgId,
    parseResult.data,
  );
  return res.status(201).json({ success: true, data: outcome, error: null });
});

/**
 * 7. GET /slos: List and evaluate workflow SLOs
 */
processIntelligenceRouter.get("/slos", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const workflowId = req.query.workflowId as string | undefined;
  const slos = processIntelligenceService.getSlos(orgId, workflowId);
  return res.json({ success: true, data: slos, error: null });
});

/**
 * 8. POST /slos: Create workflow SLO
 */
processIntelligenceRouter.post("/slos", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:write")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:write permission.",
      },
    });
  }

  const parseResult = CreateWorkflowSloSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid SLO creation payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const slo = processIntelligenceService.createSlo(orgId, parseResult.data);
  return res.status(201).json({ success: true, data: slo, error: null });
});

/**
 * 9. PUT /slos/:id: Update workflow SLO
 */
processIntelligenceRouter.put("/slos/:id", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:write")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:write permission.",
      },
    });
  }

  const slo = apiStore.slos.get(req.params.id);
  if (!slo || slo.organizationId !== orgId) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "SLO not found." },
    });
  }

  const parseResult = UpdateWorkflowSloSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid SLO update payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const updated = {
    ...slo,
    name: parseResult.data.name ?? slo.name,
    targetValue: parseResult.data.targetValue ?? slo.targetValue,
    windowHours: parseResult.data.windowHours ?? slo.windowHours,
    description: parseResult.data.description ?? slo.description,
    enabled: parseResult.data.enabled ?? slo.enabled,
    updatedAt: new Date(),
  };

  apiStore.slos.set(slo.id, updated);
  return res.json({ success: true, data: updated, error: null });
});

/**
 * 10. DELETE /slos/:id: Delete workflow SLO
 */
processIntelligenceRouter.delete("/slos/:id", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:write")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:write permission.",
      },
    });
  }

  const slo = apiStore.slos.get(req.params.id);
  if (!slo || slo.organizationId !== orgId) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "SLO not found." },
    });
  }

  apiStore.slos.delete(req.params.id);
  return res.json({
    success: true,
    data: { deleted: true, id: req.params.id },
    error: null,
  });
});

/**
 * 11. GET /recommendations: Actionable workflow optimization recommendations
 */
processIntelligenceRouter.get(
  "/recommendations",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "analytics:read")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires analytics:read permission.",
        },
      });
    }

    const workflowId = req.query.workflowId as string | undefined;
    const recs = processIntelligenceService.generateOptimizationRecommendations(
      orgId,
      workflowId,
    );
    return res.json({ success: true, data: recs, error: null });
  },
);

/**
 * 12. POST /insights/ai: AI-assisted operational insight
 */
processIntelligenceRouter.post(
  "/insights/ai",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "analytics:read")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires analytics:read permission.",
        },
      });
    }

    const { topic = "BOTTLENECK", workflowId } = req.body;
    if (!workflowId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "workflowId is required.",
        },
      });
    }

    const insight =
      await processIntelligenceService.generateAiOperationalInsight(
        orgId,
        topic,
        workflowId,
      );
    return res.json({ success: true, data: insight, error: null });
  },
);

/**
 * 13. GET /export: Export analytical intelligence report (CSV or JSON with formula injection protection)
 */
processIntelligenceRouter.get("/export", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "analytics:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires analytics:read permission.",
      },
    });
  }

  const format = (req.query.format as "csv" | "json") || "csv";
  const parseResult = ProcessIntelligenceQuerySchema.safeParse(req.query);
  const query = parseResult.success
    ? parseResult.data
    : { range: "24h" as const };

  const exportResult = processIntelligenceService.exportReport(
    orgId,
    format,
    query,
  );

  res.setHeader("Content-Type", exportResult.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${exportResult.filename}"`,
  );
  return res.send(exportResult.content);
});
