import { Router } from "express";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/stats", requirePermission("org:read"), (req, res) => {
  const orgId = req.organizationId!;

  const workflows = Array.from(apiStore.workflows.values()).filter(
    (w) => w.organizationId === orgId,
  );
  const activeWorkflows = workflows.filter((w) => w.status === "ACTIVE");

  const executions = Array.from(apiStore.executions.values()).filter(
    (e) => e.organizationId === orgId,
  );
  const successfulExecutions = executions.filter(
    (e) => e.status === "SUCCEEDED",
  );
  const failedExecutions = executions.filter((e) => e.status === "FAILED");

  const approvals = Array.from(apiStore.approvals.values()).filter(
    (a) => a.organizationId === orgId,
  );
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING");

  const totalFinished = successfulExecutions.length + failedExecutions.length;
  const successRate =
    totalFinished > 0
      ? (successfulExecutions.length / totalFinished) * 100
      : 100;

  res.json({
    success: true,
    data: {
      totalWorkflows: workflows.length,
      activeWorkflows: activeWorkflows.length,
      totalExecutions: executions.length,
      successfulExecutions: successfulExecutions.length,
      failedExecutions: failedExecutions.length,
      pendingApprovals: pendingApprovals.length,
      successRate: Math.round(successRate * 10) / 10,
    },
    error: null,
  });
});

dashboardRouter.get("/activity", requirePermission("org:read"), (req, res) => {
  const orgId = req.organizationId!;

  const recentExecutions = Array.from(apiStore.executions.values())
    .filter((e) => e.organizationId === orgId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((e) => {
      const wf = apiStore.workflows.get(e.workflowId);
      return {
        id: e.id,
        workflowId: e.workflowId,
        workflowName: wf?.name || "Unknown Workflow",
        triggerType: e.triggerType,
        status: e.status,
        createdAt: e.createdAt,
        completedAt: e.completedAt,
      };
    });

  res.json({
    success: true,
    data: {
      recentExecutions,
    },
    error: null,
  });
});

dashboardRouter.get(
  "/operations",
  requirePermission("org:read"),
  (req, res) => {
    const orgId = req.organizationId!;

    const tenantExecutions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );
    const activeExecutions = tenantExecutions.filter(
      (e) => e.status === "RUNNING" || e.status === "QUEUED",
    );

    const tenantIncidents = Array.from(apiStore.incidents.values()).filter(
      (i) => i.organizationId === orgId,
    );
    const openIncidents = tenantIncidents
      .filter((i) => i.status === "OPEN" || i.status === "INVESTIGATING")
      .sort((a, b) => b.lastObservedAt.getTime() - a.lastObservedAt.getTime());

    const criticalIncidentsCount = openIncidents.filter(
      (i) => i.severity === "CRITICAL",
    ).length;

    const tenantAlerts = Array.from(apiStore.alerts.values()).filter(
      (a) => a.organizationId === orgId,
    );
    const activeAlerts = tenantAlerts
      .filter((a) => a.status === "ACTIVE")
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());

    res.json({
      success: true,
      data: {
        serviceStatus: {
          api: "healthy",
          database: "connected",
          worker: "healthy",
        },
        operationalMetrics: {
          activeExecutionsCount: activeExecutions.length,
          openIncidentsCount: openIncidents.length,
          criticalIncidentsCount,
          activeAlertsCount: activeAlerts.length,
        },
        recentIncidents: openIncidents.slice(0, 5),
        recentAlerts: activeAlerts.slice(0, 5),
      },
      error: null,
    });
  },
);
