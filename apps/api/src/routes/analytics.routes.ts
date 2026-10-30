import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  AnalyticsFilterSchema,
  ResolveAlertSchema,
  FailureCategory,
  AlertSeverity,
  AlertStatus,
  AlertRuleType,
} from "@flowforge/shared";
import {
  calculateExecutionStats,
  calculateNodePerformance,
  groupExecutionsByTimeBucket,
  classifyFailure,
  sanitizeErrorMessage,
  calculatePercentile,
} from "@flowforge/workflow-engine";
import { apiStore, OperationalAlertRecord } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

/**
 * Helper to parse time window from query options.
 */
function resolveTimeWindow(query: any): { from: Date; to: Date; prevFrom: Date; prevTo: Date; range: string } {
  const now = new Date();
  const range = (query.range as string) || "24h";

  let from: Date;
  let to: Date = query.to ? new Date(query.to) : now;

  switch (range) {
    case "1h":
      from = new Date(to.getTime() - 60 * 60 * 1000);
      break;
    case "24h":
      from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "custom": {
      from = query.from ? new Date(query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
      // Validate date order
      if (from > to) {
        from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      }
      // Bound max query range to 90 days to avoid performance degradation
      const maxWindowMs = 90 * 24 * 60 * 60 * 1000;
      if (to.getTime() - from.getTime() > maxWindowMs) {
        from = new Date(to.getTime() - maxWindowMs);
      }
      break;
    }
    default:
      from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      break;
  }

  // Previous equivalent time window for trend calculation
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime());
  const prevFrom = new Date(prevTo.getTime() - durationMs);

  return { from, to, prevFrom, prevTo, range };
}

// ==========================================
// 1. EXECUTION OVERVIEW METRICS
// ==========================================
analyticsRouter.get(
  "/overview",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { from, to, prevFrom, prevTo, range } = resolveTimeWindow(req.query);

    // Get executions for organization
    let orgExecutions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );

    if (req.query.workflowId) {
      orgExecutions = orgExecutions.filter((e) => e.workflowId === req.query.workflowId);
    }
    if (req.query.environment) {
      orgExecutions = orgExecutions.filter((e) => e.environment === req.query.environment);
    }

    // Current period metrics
    const currentMetrics = calculateExecutionStats(orgExecutions, { from, to });

    // Prior period metrics for trends
    const priorMetrics = calculateExecutionStats(orgExecutions, { from: prevFrom, to: prevTo });

    // Compute trends
    const execDiff = currentMetrics.total - priorMetrics.total;
    const totalTrendPercent =
      priorMetrics.total > 0
        ? Math.round((execDiff / priorMetrics.total) * 1000) / 10
        : currentMetrics.total > 0
        ? 100
        : 0;

    const successRateDiff =
      Math.round((currentMetrics.successRate - priorMetrics.successRate) * 10) / 10;

    res.json({
      success: true,
      data: {
        timeWindow: {
          range,
          from: from.toISOString(),
          to: to.toISOString(),
        },
        metrics: currentMetrics,
        trends: {
          totalExecutionsChangePercent: totalTrendPercent,
          successRateChangePercent: successRateDiff,
        },
      },
      error: null,
    });
  },
);

// ==========================================
// 2. TIME-SERIES TRENDS
// ==========================================
analyticsRouter.get(
  "/trends",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { from, to, range } = resolveTimeWindow(req.query);

    let orgExecutions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );
    if (req.query.workflowId) {
      orgExecutions = orgExecutions.filter((e) => e.workflowId === req.query.workflowId);
    }

    const bucketSize = (req.query.bucketSize as "hour" | "day") || (range === "30d" || range === "7d" ? "day" : "hour");
    const buckets = groupExecutionsByTimeBucket(orgExecutions, bucketSize, from, to);

    res.json({
      success: true,
      data: {
        bucketSize,
        buckets,
      },
      error: null,
    });
  },
);

// ==========================================
// 3. WORKFLOW-LEVEL PERFORMANCE
// ==========================================
analyticsRouter.get(
  "/workflows",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { from, to } = resolveTimeWindow(req.query);

    const workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === orgId && !w.deletedAt,
    );

    const executions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );

    const workflowSummaries = workflows.map((wf) => {
      const wfExecs = executions.filter(
        (e) => e.workflowId === wf.id && new Date(e.createdAt) >= from && new Date(e.createdAt) < to,
      );

      const stats = calculateExecutionStats(wfExecs);

      // Find most recent execution and most recent failure
      const sortedWfExecs = [...wfExecs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const lastExecutedAt = sortedWfExecs.length > 0 ? sortedWfExecs[0].createdAt : undefined;
      const lastFailed = sortedWfExecs.find((e) => e.status === "FAILED");
      const lastFailedAt = lastFailed ? lastFailed.completedAt || lastFailed.createdAt : undefined;

      // Common failure category for this workflow
      const failureCounts: Record<string, number> = {};
      for (const f of sortedWfExecs.filter((e) => e.status === "FAILED")) {
        const cat = classifyFailure(f.errorDetails, (f.errorDetails as any)?.message);
        failureCounts[cat] = (failureCounts[cat] || 0) + 1;
      }
      let topFailureCategory: string | undefined;
      let topCount = 0;
      for (const [cat, cnt] of Object.entries(failureCounts)) {
        if (cnt > topCount) {
          topCount = cnt;
          topFailureCategory = cat;
        }
      }

      return {
        id: wf.id,
        name: wf.name,
        status: wf.status,
        executionCount: stats.total,
        successfulCount: stats.successful,
        failedCount: stats.failed,
        successRate: stats.successRate,
        failureRate: stats.failureRate,
        avgDurationMs: stats.durations.averageMs,
        medianDurationMs: stats.durations.medianMs,
        p95DurationMs: stats.durations.p95Ms,
        retryCount: stats.retryCount,
        lastExecutedAt,
        lastFailedAt,
        commonFailureCategory: topFailureCategory || "NONE",
      };
    });

    // Support sorting
    const sortBy = (req.query.sortBy as string) || "executionCount";
    const order = (req.query.order as string) === "asc" ? 1 : -1;

    workflowSummaries.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return (valA - valB) * order;
      }
      return String(valA).localeCompare(String(valB)) * order;
    });

    res.json({
      success: true,
      data: workflowSummaries,
      error: null,
    });
  },
);

// ==========================================
// 4. NODE-LEVEL PERFORMANCE & BOTTLENECK ANALYSIS
// ==========================================
analyticsRouter.get(
  "/workflows/:id/nodes",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const workflowId = req.params.id;

    const workflow = apiStore.workflows.get(workflowId);
    if (!workflow || workflow.organizationId !== orgId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    // Find all executions for this workflow
    const executionIds = new Set(
      Array.from(apiStore.executions.values())
        .filter((e) => e.workflowId === workflowId && e.organizationId === orgId)
        .map((e) => e.id),
    );

    // Find all steps for these executions
    const steps = Array.from(apiStore.steps.values()).filter((s) =>
      executionIds.has(s.executionId),
    );

    const nodesPerformance = calculateNodePerformance(steps);
    const bottlenecks = nodesPerformance.filter((n) => n.isBottleneck);

    res.json({
      success: true,
      data: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodes: nodesPerformance,
        bottlenecks,
      },
      error: null,
    });
  },
);

// ==========================================
// 5. STRUCTURED FAILURE ANALYSIS
// ==========================================
analyticsRouter.get(
  "/failures",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { from, to } = resolveTimeWindow(req.query);

    let failedExecutions = Array.from(apiStore.executions.values()).filter(
      (e) =>
        e.organizationId === orgId &&
        e.status === "FAILED" &&
        new Date(e.createdAt) >= from &&
        new Date(e.createdAt) < to,
    );

    if (req.query.workflowId) {
      failedExecutions = failedExecutions.filter((e) => e.workflowId === req.query.workflowId);
    }

    const categoriesCount: Record<string, number> = {};
    const failedNodesCount: Record<string, number> = {};
    const failedWorkflowsCount: Record<string, number> = {};

    const recentFailures = failedExecutions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15)
      .map((e) => {
        const wf = apiStore.workflows.get(e.workflowId);
        const errDetails = e.errorDetails as any;
        const rawMessage = errDetails?.message || "Execution encountered an error";
        const sanitizedMsg = sanitizeErrorMessage(rawMessage);
        const category = classifyFailure(errDetails, rawMessage);

        categoriesCount[category] = (categoriesCount[category] || 0) + 1;

        if (errDetails?.failedNodeId) {
          failedNodesCount[errDetails.failedNodeId] =
            (failedNodesCount[errDetails.failedNodeId] || 0) + 1;
        }

        const wfName = wf?.name || e.workflowId;
        failedWorkflowsCount[wfName] = (failedWorkflowsCount[wfName] || 0) + 1;

        return {
          executionId: e.id,
          workflowId: e.workflowId,
          workflowName: wfName,
          environment: e.environment,
          category,
          sanitizedMessage: sanitizedMsg,
          failedNodeId: errDetails?.failedNodeId,
          occurredAt: e.completedAt || e.createdAt,
          retryCount: e.retryCount,
        };
      });

    res.json({
      success: true,
      data: {
        totalFailures: failedExecutions.length,
        categories: categoriesCount,
        topFailingNodes: failedNodesCount,
        topFailingWorkflows: failedWorkflowsCount,
        recentFailures,
      },
      error: null,
    });
  },
);

// ==========================================
// 6. ORGANIZATION USAGE ANALYTICS
// ==========================================
analyticsRouter.get(
  "/usage",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === orgId && !w.deletedAt,
    );
    const activeWorkflows = workflows.filter((w) => w.status === "ACTIVE");

    const versions = Array.from(apiStore.versions.values()).filter((v) => {
      const wf = apiStore.workflows.get(v.workflowId);
      return wf && wf.organizationId === orgId;
    });

    const executions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );

    const steps = Array.from(apiStore.steps.values()).filter((s) => {
      const exec = apiStore.executions.get(s.executionId);
      return exec && exec.organizationId === orgId;
    });

    const approvals = Array.from(apiStore.approvals.values()).filter(
      (a) => a.organizationId === orgId,
    );

    const schedules = Array.from(apiStore.schedules.values()).filter(
      (s) => s.organizationId === orgId && s.enabled,
    );

    const webhooks = Array.from(apiStore.webhooks.values()).filter(
      (w) => w.organizationId === orgId && w.enabled,
    );

    // Group executions by trigger
    const triggers: Record<string, number> = {
      MANUAL: 0,
      WEBHOOK: 0,
      SCHEDULE: 0,
    };
    for (const e of executions) {
      const t = e.triggerType || "MANUAL";
      triggers[t] = (triggers[t] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        totalWorkflows: workflows.length,
        activeWorkflows: activeWorkflows.length,
        publishedVersions: versions.length,
        totalExecutions: executions.length,
        totalStepsExecuted: steps.length,
        triggerVolume: triggers,
        approvals: {
          total: approvals.length,
          pending: approvals.filter((a) => a.status === "PENDING").length,
          decided: approvals.filter((a) => a.status !== "PENDING").length,
        },
        activeSchedules: schedules.length,
        activeWebhooks: webhooks.length,
      },
      error: null,
    });
  },
);

// ==========================================
// 7. OPERATIONAL INFRASTRUCTURE MONITORING
// ==========================================
analyticsRouter.get(
  "/operational",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const now = new Date();

    // Org-scoped execution state counts
    const orgExecutions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId,
    );

    const queuedJobs = orgExecutions.filter((e) => e.status === "QUEUED").length;
    const runningJobs = orgExecutions.filter((e) => e.status === "RUNNING").length;
    const waitingApprovalJobs = orgExecutions.filter(
      (e) => e.status === "WAITING_APPROVAL",
    ).length;
    const waitingDelayJobs = orgExecutions.filter(
      (e) => e.status === "WAITING_DELAY",
    ).length;

    // Scheduler lag check
    const orgSchedules = Array.from(apiStore.schedules.values()).filter(
      (s) => s.organizationId === orgId && s.enabled,
    );
    let schedulerOverdueCount = 0;
    let maxSchedulerLagSeconds = 0;

    for (const sch of orgSchedules) {
      if (sch.nextRunAt && sch.nextRunAt.getTime() < now.getTime()) {
        const lagSec = Math.floor((now.getTime() - sch.nextRunAt.getTime()) / 1000);
        if (lagSec > 30) {
          schedulerOverdueCount++;
          if (lagSec > maxSchedulerLagSeconds) maxSchedulerLagSeconds = lagSec;
        }
      }
    }

    // Delay lag check
    const orgDelays = Array.from(apiStore.delays.values()).filter((d) => {
      const exec = apiStore.executions.get(d.executionId);
      return exec && exec.organizationId === orgId && d.status === "PENDING";
    });
    let delayOverdueCount = 0;
    let maxDelayLagSeconds = 0;

    for (const d of orgDelays) {
      if (d.resumeAt && d.resumeAt.getTime() < now.getTime()) {
        const lagSec = Math.floor((now.getTime() - d.resumeAt.getTime()) / 1000);
        if (lagSec > 10) {
          delayOverdueCount++;
          if (lagSec > maxDelayLagSeconds) maxDelayLagSeconds = lagSec;
        }
      }
    }

    // Webhook outbox / event backlog
    const orgEvents = Array.from(apiStore.webhookEvents.values()).filter(
      (w) => w.organizationId === orgId && w.status === "PENDING",
    );

    // Active operational alerts count
    const activeAlerts = Array.from(apiStore.alerts.values()).filter(
      (a) => a.organizationId === orgId && a.status === "ACTIVE",
    );

    res.json({
      success: true,
      data: {
        timestamp: now.toISOString(),
        queue: {
          queuedJobs,
          runningJobs,
          waitingApprovalJobs,
          waitingDelayJobs,
          totalInFlight: queuedJobs + runningJobs + waitingApprovalJobs + waitingDelayJobs,
        },
        scheduler: {
          activeSchedules: orgSchedules.length,
          overdueCount: schedulerOverdueCount,
          maxLagSeconds: maxSchedulerLagSeconds,
          status: maxSchedulerLagSeconds > 120 ? "DEGRADED" : "HEALTHY",
        },
        delays: {
          pendingDelays: orgDelays.length,
          overdueCount: delayOverdueCount,
          maxLagSeconds: maxDelayLagSeconds,
        },
        events: {
          pendingWebhookEvents: orgEvents.length,
        },
        worker: {
          status: "ONLINE",
          heartbeatTimestamp: now.toISOString(),
        },
        alertsCount: activeAlerts.length,
      },
      error: null,
    });
  },
);

// ==========================================
// 8. LIST OPERATIONAL ALERTS
// ==========================================
analyticsRouter.get(
  "/alerts",
  requirePermission("analytics:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const statusFilter = req.query.status as string;
    const severityFilter = req.query.severity as string;

    let alerts = Array.from(apiStore.alerts.values()).filter(
      (a) => a.organizationId === orgId,
    );

    if (statusFilter) {
      alerts = alerts.filter((a) => a.status === statusFilter);
    }
    if (severityFilter) {
      alerts = alerts.filter((a) => a.severity === severityFilter);
    }

    alerts.sort(
      (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
    );

    res.json({
      success: true,
      data: alerts,
      error: null,
      meta: { total: alerts.length },
    });
  },
);

// ==========================================
// 9. RESOLVE OPERATIONAL ALERT
// ==========================================
analyticsRouter.post(
  "/alerts/:id/resolve",
  requirePermission("analytics:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const alertId = req.params.id;

    const alert = apiStore.alerts.get(alertId);
    if (!alert || alert.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Alert not found." },
      });
      return;
    }

    if (alert.status === "RESOLVED") {
      res.json({
        success: true,
        data: alert,
        error: null,
        meta: { alreadyResolved: true },
      });
      return;
    }

    const parseResult = ResolveAlertSchema.safeParse(req.body);
    const note = parseResult.success ? parseResult.data.resolutionNote : undefined;

    alert.status = "RESOLVED";
    alert.resolvedAt = new Date();
    alert.resolvedById = req.user?.id;
    alert.resolutionNote = note || "Resolved by user";

    apiStore.alerts.set(alert.id, alert);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "alert.resolved",
      resourceType: "alert",
      resourceId: alert.id,
      metadata: { ruleType: alert.ruleType, note },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: alert,
      error: null,
    });
  },
);

// ==========================================
// 10. EVALUATE & DETECT OPERATIONAL ALERTS
// ==========================================
analyticsRouter.post(
  "/alerts/evaluate",
  requirePermission("analytics:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const now = new Date();
    const cooldownMs = 15 * 60 * 1000; // 15-minute cooldown between duplicate alerts

    const newAlerts: OperationalAlertRecord[] = [];

    // Rule 1: High Failure Rate in Last Hour (>= 25% failure rate with >= 4 executions)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentExecs = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId && new Date(e.createdAt) >= oneHourAgo,
    );
    const stats = calculateExecutionStats(recentExecs);

    if (stats.total >= 4 && stats.failureRate >= 25) {
      const dedupKey = `${orgId}_HIGH_FAILURE_RATE_system`;
      const existing = Array.from(apiStore.alerts.values()).find(
        (a) =>
          a.dedupKey === dedupKey &&
          a.status === "ACTIVE" &&
          now.getTime() - new Date(a.triggeredAt).getTime() < cooldownMs,
      );

      if (!existing) {
        const alertId = `alt_${crypto.randomUUID()}`;
        const alert: OperationalAlertRecord = {
          id: alertId,
          organizationId: orgId,
          ruleType: "HIGH_FAILURE_RATE",
          severity: "CRITICAL",
          status: "ACTIVE",
          title: "High Workflow Failure Rate Detected",
          message: `Failure rate reached ${stats.failureRate}% (${stats.failed}/${stats.successful + stats.failed} terminal executions) in the last hour.`,
          contextJson: { stats },
          triggeredAt: now,
          dedupKey,
        };
        apiStore.alerts.set(alertId, alert);
        newAlerts.push(alert);
      }
    }

    // Rule 2: Consecutive Workflow Failures (>= 3 consecutive failures for any workflow)
    const workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === orgId && !w.deletedAt,
    );

    for (const wf of workflows) {
      const wfExecs = Array.from(apiStore.executions.values())
        .filter((e) => e.workflowId === wf.id && e.organizationId === orgId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (wfExecs.length >= 3) {
        const last3 = wfExecs.slice(0, 3);
        const allFailed = last3.every((e) => e.status === "FAILED");

        if (allFailed) {
          const dedupKey = `${orgId}_CONSECUTIVE_FAILURES_${wf.id}`;
          const existing = Array.from(apiStore.alerts.values()).find(
            (a) =>
              a.dedupKey === dedupKey &&
              a.status === "ACTIVE" &&
              now.getTime() - new Date(a.triggeredAt).getTime() < cooldownMs,
          );

          if (!existing) {
            const alertId = `alt_${crypto.randomUUID()}`;
            const alert: OperationalAlertRecord = {
              id: alertId,
              organizationId: orgId,
              workflowId: wf.id,
              ruleType: "CONSECUTIVE_FAILURES",
              severity: "WARNING",
              status: "ACTIVE",
              title: `Workflow "${wf.name}" Failed 3 Consecutive Times`,
              message: `The last 3 executions of workflow "${wf.name}" all terminated in FAILED status.`,
              contextJson: { workflowId: wf.id, workflowName: wf.name },
              triggeredAt: now,
              dedupKey,
            };
            apiStore.alerts.set(alertId, alert);
            newAlerts.push(alert);
          }
        }
      }
    }

    // Rule 3: Queue Backlog (> 15 queued executions)
    const queuedCount = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === orgId && e.status === "QUEUED",
    ).length;

    if (queuedCount > 15) {
      const dedupKey = `${orgId}_QUEUE_BACKLOG_system`;
      const existing = Array.from(apiStore.alerts.values()).find(
        (a) =>
          a.dedupKey === dedupKey &&
          a.status === "ACTIVE" &&
          now.getTime() - new Date(a.triggeredAt).getTime() < cooldownMs,
      );

      if (!existing) {
        const alertId = `alt_${crypto.randomUUID()}`;
        const alert: OperationalAlertRecord = {
          id: alertId,
          organizationId: orgId,
          ruleType: "QUEUE_BACKLOG",
          severity: "WARNING",
          status: "ACTIVE",
          title: "Execution Queue Backlog Threshold Exceeded",
          message: `${queuedCount} executions are currently queued waiting for execution.`,
          contextJson: { queuedCount },
          triggeredAt: now,
          dedupKey,
        };
        apiStore.alerts.set(alertId, alert);
        newAlerts.push(alert);
      }
    }

    // Rule 4: Scheduler Lag (> 120 seconds overdue)
    const overdueSchedules = Array.from(apiStore.schedules.values()).filter(
      (s) =>
        s.organizationId === orgId &&
        s.enabled &&
        s.nextRunAt &&
        now.getTime() - s.nextRunAt.getTime() > 120 * 1000,
    );

    if (overdueSchedules.length > 0) {
      const dedupKey = `${orgId}_SCHEDULER_LAG_system`;
      const existing = Array.from(apiStore.alerts.values()).find(
        (a) =>
          a.dedupKey === dedupKey &&
          a.status === "ACTIVE" &&
          now.getTime() - new Date(a.triggeredAt).getTime() < cooldownMs,
      );

      if (!existing) {
        const alertId = `alt_${crypto.randomUUID()}`;
        const alert: OperationalAlertRecord = {
          id: alertId,
          organizationId: orgId,
          ruleType: "SCHEDULER_LAG",
          severity: "WARNING",
          status: "ACTIVE",
          title: "Workflow Scheduler Lag Detected",
          message: `${overdueSchedules.length} schedule(s) are overdue by more than 2 minutes.`,
          contextJson: { overdueCount: overdueSchedules.length },
          triggeredAt: now,
          dedupKey,
        };
        apiStore.alerts.set(alertId, alert);
        newAlerts.push(alert);
      }
    }

    res.json({
      success: true,
      data: {
        evaluatedAt: now.toISOString(),
        newAlertsTriggered: newAlerts.length,
        newAlerts,
      },
      error: null,
    });
  },
);
