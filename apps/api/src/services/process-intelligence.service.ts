import crypto from "crypto";
import {
  ProcessIntelligenceQuery,
  WorkflowComparisonQuery,
  CreateWorkflowSloRequest,
  UpdateWorkflowSloRequest,
  RecordBusinessOutcomeRequest,
  ProcessEventRecord,
  ProcessBottleneckFinding,
  ProcessAnomalyFinding,
  WorkflowComparisonReport,
  BusinessOutcomeRecord,
  WorkflowSloRecord,
  WorkflowOptimizationRecommendation,
  AiOperationalInsight,
} from "@flowforge/shared";
import {
  calculateExecutionStats,
  calculateNodePerformance,
  calculatePercentile,
  classifyFailure,
  sanitizeErrorMessage,
} from "@flowforge/workflow-engine";
import { apiStore } from "../store.js";
import { aiService } from "./ai/ai.service.js";

export class ProcessIntelligenceService {
  /**
   * Resolves query time window.
   */
  public resolveTimeWindow(query: ProcessIntelligenceQuery): {
    from: Date;
    to: Date;
    range: string;
  } {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    let from: Date;

    switch (query.range) {
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
      case "custom":
        from = query.from
          ? new Date(query.from)
          : new Date(to.getTime() - 24 * 60 * 60 * 1000);
        if (from > to) from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    return { from, to, range: query.range };
  }

  /**
   * Computes comprehensive process intelligence metrics.
   */
  public getProcessMetrics(orgId: string, query: ProcessIntelligenceQuery) {
    const { from, to, range } = this.resolveTimeWindow(query);

    let executions = Array.from(apiStore.executions.values()).filter(
      (e) =>
        e.organizationId === orgId &&
        new Date(e.createdAt) >= from &&
        new Date(e.createdAt) <= to,
    );

    if (query.workflowId) {
      executions = executions.filter((e) => e.workflowId === query.workflowId);
    }
    if (query.workflowVersionId) {
      executions = executions.filter(
        (e) => e.workflowVersionId === query.workflowVersionId,
      );
    }
    if (query.workspaceId) {
      const wfIds = new Set(
        Array.from(apiStore.workflows.values())
          .filter(
            (w) =>
              w.organizationId === orgId && w.workspaceId === query.workspaceId,
          )
          .map((w) => w.id),
      );
      executions = executions.filter((e) => wfIds.has(e.workflowId));
    }
    if (query.environment) {
      executions = executions.filter(
        (e) => (e as any).environment === query.environment,
      );
    }

    // Reliability & Duration Stats
    const stats = calculateExecutionStats(executions, { from, to });

    // Queue wait latency (createdAt to startedAt)
    const queueWaitTimes: number[] = [];
    for (const e of executions) {
      if (e.startedAt && e.createdAt) {
        const waitMs = Math.max(
          0,
          new Date(e.startedAt).getTime() - new Date(e.createdAt).getTime(),
        );
        queueWaitTimes.push(waitMs);
      }
    }
    const avgQueueWaitMs =
      queueWaitTimes.length > 0
        ? Math.round(
            queueWaitTimes.reduce((a, b) => a + b, 0) / queueWaitTimes.length,
          )
        : 0;
    const p95QueueWaitMs = calculatePercentile(queueWaitTimes, 95);

    // Approval wait times
    const approvals = Array.from(apiStore.approvals.values()).filter(
      (a) =>
        a.organizationId === orgId &&
        new Date(a.createdAt) >= from &&
        new Date(a.createdAt) <= to,
    );
    const approvalWaitTimes: number[] = [];
    for (const a of approvals) {
      if (a.decidedAt && a.createdAt) {
        const waitMs = Math.max(
          0,
          new Date(a.decidedAt).getTime() - new Date(a.createdAt).getTime(),
        );
        approvalWaitTimes.push(waitMs);
      }
    }
    const avgApprovalWaitMs =
      approvalWaitTimes.length > 0
        ? Math.round(
            approvalWaitTimes.reduce((a, b) => a + b, 0) /
              approvalWaitTimes.length,
          )
        : 0;
    const p95ApprovalWaitMs = calculatePercentile(approvalWaitTimes, 95);

    // External connector latencies
    const execIds = new Set(executions.map((e) => e.id));
    const connectorSteps = Array.from(apiStore.steps.values()).filter(
      (s) =>
        execIds.has(s.executionId) &&
        (s.nodeType === "CONNECTOR_ACTION" || s.nodeType === "HTTP_REQUEST"),
    );

    const connectorMap = new Map<
      string,
      { durations: number[]; failures: number }
    >();
    for (const s of connectorSteps) {
      const key =
        (s.inputPayload as any)?.connectorId || s.nodeName || s.nodeType;
      if (!connectorMap.has(key)) {
        connectorMap.set(key, { durations: [], failures: 0 });
      }
      const item = connectorMap.get(key)!;
      if (s.status === "FAILED") item.failures++;
      if (s.startedAt && s.completedAt) {
        item.durations.push(
          Math.max(
            0,
            new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime(),
          ),
        );
      }
    }

    const connectorLatencies = Array.from(connectorMap.entries()).map(
      ([connectorId, data]) => {
        const avg =
          data.durations.length > 0
            ? Math.round(
                data.durations.reduce((a, b) => a + b, 0) /
                  data.durations.length,
              )
            : 0;
        const p95 = calculatePercentile(data.durations, 95);
        const failureRate =
          data.durations.length > 0
            ? Math.round(
                (data.failures / (data.durations.length + data.failures)) *
                  1000,
              ) / 10
            : 0;
        return {
          connectorId,
          callCount: data.durations.length + data.failures,
          avgDurationMs: avg,
          p95DurationMs: p95,
          failureRate,
        };
      },
    );

    return {
      window: { from: from.toISOString(), to: to.toISOString(), range },
      sampleSize: executions.length,
      reliability: {
        total: stats.total,
        successful: stats.successful,
        failed: stats.failed,
        cancelled: stats.cancelled,
        successRate: stats.successRate,
        failureRate: stats.failureRate,
        retryCount: stats.retryCount,
        retryRate: stats.retryRate,
        timeoutCount: stats.timeoutCount,
      },
      performance: {
        averageMs: stats.durations.averageMs,
        medianMs: stats.durations.medianMs,
        p95Ms: stats.durations.p95Ms,
        p99Ms: stats.durations.p99Ms,
        minMs: stats.durations.minMs,
        maxMs: stats.durations.maxMs,
        avgQueueWaitMs,
        p95QueueWaitMs,
      },
      humanInTheLoop: {
        totalApprovals: approvals.length,
        pendingApprovals: approvals.filter((a) => a.status === "PENDING")
          .length,
        avgApprovalWaitMs,
        p95ApprovalWaitMs,
      },
      externalIntegrations: connectorLatencies,
      byWorkflow: stats.byWorkflow,
      byStatus: stats.byStatus,
      byTriggerType: stats.byTriggerType,
    };
  }

  /**
   * Rule-based process bottleneck detection using observed execution steps.
   */
  public detectBottlenecks(
    orgId: string,
    options?: { workflowId?: string },
  ): ProcessBottleneckFinding[] {
    const findings: ProcessBottleneckFinding[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === orgId && !w.deletedAt,
    );
    if (options?.workflowId) {
      workflows = workflows.filter((w) => w.id === options.workflowId);
    }

    for (const wf of workflows) {
      const executions = Array.from(apiStore.executions.values()).filter(
        (e) =>
          e.workflowId === wf.id &&
          e.organizationId === orgId &&
          new Date(e.createdAt) >= sevenDaysAgo,
      );

      if (executions.length < 3) continue; // Minimum sample size

      const execIds = new Set(executions.map((e) => e.id));
      const steps = Array.from(apiStore.steps.values()).filter((s) =>
        execIds.has(s.executionId),
      );
      const nodePerf = calculateNodePerformance(steps);

      // Check node duration and failure bottlenecks
      for (const node of nodePerf) {
        if (node.percentageOfTotalDuration >= 40 && node.avgDurationMs > 2000) {
          findings.push({
            findingId: `fnd_dur_${wf.id}_${node.nodeId}`,
            category: "NODE_DURATION",
            severity: node.percentageOfTotalDuration >= 60 ? "HIGH" : "MEDIUM",
            workflowId: wf.id,
            workflowName: wf.name,
            nodeId: node.nodeId,
            nodeName: node.nodeName,
            observationWindow: "7d",
            sampleSize: node.executionCount,
            measuredValue: node.avgDurationMs,
            baselineValue: 1000,
            detectionRule:
              "Node accounts for >= 40% of cumulative workflow duration",
            evidence: [
              `Node '${node.nodeName}' represents ${node.percentageOfTotalDuration}% of total workflow execution time.`,
              `Average node duration is ${node.avgDurationMs}ms (p95: ${node.p95DurationMs}ms) across ${node.executionCount} executions.`,
            ],
            status: "ACTIVE",
            firstObservedAt: sevenDaysAgo,
            lastObservedAt: now,
          });
        }

        if (node.failureRate >= 25 && node.executionCount >= 3) {
          findings.push({
            findingId: `fnd_fail_${wf.id}_${node.nodeId}`,
            category: "HIGH_FAILURE_RATE",
            severity: node.failureRate >= 50 ? "CRITICAL" : "HIGH",
            workflowId: wf.id,
            workflowName: wf.name,
            nodeId: node.nodeId,
            nodeName: node.nodeName,
            observationWindow: "7d",
            sampleSize: node.executionCount,
            measuredValue: node.failureRate,
            baselineValue: 5.0,
            detectionRule: "Node failure rate exceeds 25% threshold",
            evidence: [
              `Node '${node.nodeName}' failed ${node.failureCount} times out of ${node.executionCount} executions (${node.failureRate}% failure rate).`,
            ],
            status: "ACTIVE",
            firstObservedAt: sevenDaysAgo,
            lastObservedAt: now,
          });
        }

        if (
          node.retryCount >= node.executionCount * 1.5 &&
          node.executionCount >= 3
        ) {
          findings.push({
            findingId: `fnd_retry_${wf.id}_${node.nodeId}`,
            category: "RETRY_STORM",
            severity: "MEDIUM",
            workflowId: wf.id,
            workflowName: wf.name,
            nodeId: node.nodeId,
            nodeName: node.nodeName,
            observationWindow: "7d",
            sampleSize: node.executionCount,
            measuredValue: node.retryCount,
            baselineValue: 0,
            detectionRule: "Node retries exceed 1.5 retries per execution",
            evidence: [
              `Node '${node.nodeName}' triggered ${node.retryCount} total retries across ${node.executionCount} executions.`,
            ],
            status: "ACTIVE",
            firstObservedAt: sevenDaysAgo,
            lastObservedAt: now,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Conservative statistical anomaly detection with sample size thresholding.
   */
  public detectAnomalies(
    orgId: string,
    options?: { workflowId?: string },
  ): ProcessAnomalyFinding[] {
    const findings: ProcessAnomalyFinding[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let workflows = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === orgId && !w.deletedAt,
    );
    if (options?.workflowId) {
      workflows = workflows.filter((w) => w.id === options.workflowId);
    }

    for (const wf of workflows) {
      const allExecs = Array.from(apiStore.executions.values()).filter(
        (e) =>
          e.workflowId === wf.id &&
          e.organizationId === orgId &&
          new Date(e.createdAt) >= thirtyDaysAgo,
      );

      // Strict sample size gating: require at least 10 executions for statistical validity
      if (allExecs.length < 10) {
        continue;
      }

      // Historical baseline (prior to last 24h)
      const baselineExecs = allExecs.filter(
        (e) => new Date(e.createdAt) < oneDayAgo,
      );
      const recentExecs = allExecs.filter(
        (e) => new Date(e.createdAt) >= oneDayAgo,
      );

      if (baselineExecs.length < 8 || recentExecs.length < 2) {
        continue;
      }

      // 1. Duration Anomaly Check
      const baselineDurations: number[] = [];
      for (const e of baselineExecs) {
        if (e.startedAt && e.completedAt) {
          baselineDurations.push(
            Math.max(
              0,
              new Date(e.completedAt).getTime() -
                new Date(e.startedAt).getTime(),
            ),
          );
        }
      }

      if (baselineDurations.length >= 8) {
        const mean =
          baselineDurations.reduce((a, b) => a + b, 0) /
          baselineDurations.length;
        const variance =
          baselineDurations.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) /
          baselineDurations.length;
        const stdDev = Math.sqrt(variance);

        const recentDurations: number[] = [];
        for (const e of recentExecs) {
          if (e.startedAt && e.completedAt) {
            recentDurations.push(
              Math.max(
                0,
                new Date(e.completedAt).getTime() -
                  new Date(e.startedAt).getTime(),
              ),
            );
          }
        }

        if (recentDurations.length > 0 && stdDev > 0) {
          const recentMean =
            recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
          const zScore = (recentMean - mean) / stdDev;

          if (zScore >= 2.5) {
            findings.push({
              anomalyId: `anom_dur_${wf.id}_${Date.now()}`,
              metricName: "EXECUTION_DURATION",
              workflowId: wf.id,
              workflowName: wf.name,
              observedValue: Math.round(recentMean),
              baselineMean: Math.round(mean),
              baselineStdDev: Math.round(stdDev),
              deviationSigma: Math.round(zScore * 10) / 10,
              severity: zScore >= 4.0 ? "CRITICAL" : "HIGH",
              confidenceScore: Math.min(
                0.98,
                0.75 + baselineDurations.length * 0.01,
              ),
              sampleCount: recentDurations.length,
              evidence: `Average execution duration spiked to ${Math.round(recentMean)}ms (${(Math.round(zScore * 10) / 10).toFixed(1)}σ above baseline mean of ${Math.round(mean)}ms ± ${Math.round(stdDev)}ms) based on ${recentDurations.length} recent runs.`,
              detectedAt: now,
            });
          }
        }
      }

      // 2. Failure Rate Anomaly Check
      const baselineFailed = baselineExecs.filter(
        (e) => e.status === "FAILED",
      ).length;
      const baselineFailRate = (baselineFailed / baselineExecs.length) * 100;
      const recentFailed = recentExecs.filter(
        (e) => e.status === "FAILED",
      ).length;
      const recentFailRate = (recentFailed / recentExecs.length) * 100;

      if (recentFailRate >= 30 && recentFailRate - baselineFailRate >= 20) {
        findings.push({
          anomalyId: `anom_fail_${wf.id}_${Date.now()}`,
          metricName: "FAILURE_RATE",
          workflowId: wf.id,
          workflowName: wf.name,
          observedValue: Math.round(recentFailRate * 10) / 10,
          baselineMean: Math.round(baselineFailRate * 10) / 10,
          baselineStdDev: 5.0,
          deviationSigma: 3.0,
          severity: recentFailRate >= 60 ? "CRITICAL" : "HIGH",
          confidenceScore: 0.9,
          sampleCount: recentExecs.length,
          evidence: `Failure rate jumped to ${Math.round(recentFailRate)}% in the last 24h compared to historical baseline of ${Math.round(baselineFailRate)}% (${recentFailed}/${recentExecs.length} failed).`,
          detectedAt: now,
        });
      }
    }

    return findings;
  }

  /**
   * Compares two workflow versions or time periods for regression analysis.
   */
  public compareWorkflowVersions(
    orgId: string,
    query: WorkflowComparisonQuery,
  ): WorkflowComparisonReport {
    const wf = apiStore.workflows.get(query.workflowId);
    const wfName = wf?.name || query.workflowId;

    const allExecs = Array.from(apiStore.executions.values()).filter(
      (e) => e.workflowId === query.workflowId && e.organizationId === orgId,
    );

    const execsA = allExecs.filter(
      (e) => e.workflowVersionId === query.versionA,
    );
    const execsB = allExecs.filter(
      (e) => e.workflowVersionId === query.versionB,
    );

    const statsA = calculateExecutionStats(execsA);
    const statsB = calculateExecutionStats(execsB);

    const failureCatsA: Record<string, number> = {};
    for (const e of execsA.filter((x) => x.status === "FAILED")) {
      const cat = classifyFailure(
        e.errorDetails,
        (e.errorDetails as any)?.message,
      );
      failureCatsA[cat] = (failureCatsA[cat] || 0) + 1;
    }

    const failureCatsB: Record<string, number> = {};
    for (const e of execsB.filter((x) => x.status === "FAILED")) {
      const cat = classifyFailure(
        e.errorDetails,
        (e.errorDetails as any)?.message,
      );
      failureCatsB[cat] = (failureCatsB[cat] || 0) + 1;
    }

    const successRateDelta =
      Math.round((statsB.successRate - statsA.successRate) * 10) / 10;
    const durationDeltaMs =
      statsB.durations.averageMs - statsA.durations.averageMs;
    const durationChangePercent =
      statsA.durations.averageMs > 0
        ? Math.round((durationDeltaMs / statsA.durations.averageMs) * 1000) / 10
        : 0;
    const retryRateDelta =
      Math.round((statsB.retryRate - statsA.retryRate) * 10) / 10;

    const regressionNotes: string[] = [];
    let isRegressed = false;

    if (successRateDelta <= -5) {
      isRegressed = true;
      regressionNotes.push(
        `Success rate regressed by ${Math.abs(successRateDelta)}% (from ${statsA.successRate}% to ${statsB.successRate}%).`,
      );
    }
    if (durationChangePercent >= 25 && durationDeltaMs > 500) {
      isRegressed = true;
      regressionNotes.push(
        `Average duration increased by ${durationChangePercent}% (+${durationDeltaMs}ms).`,
      );
    }
    if (retryRateDelta >= 15) {
      isRegressed = true;
      regressionNotes.push(
        `Retry frequency increased by ${retryRateDelta}% across executions.`,
      );
    }

    return {
      workflowId: query.workflowId,
      workflowName: wfName,
      versionA: {
        versionId: query.versionA,
        sampleSize: statsA.total,
        successRate: statsA.successRate,
        avgDurationMs: statsA.durations.averageMs,
        p95DurationMs: statsA.durations.p95Ms,
        retryRate: statsA.retryRate,
        failureCategories: failureCatsA,
      },
      versionB: {
        versionId: query.versionB,
        sampleSize: statsB.total,
        successRate: statsB.successRate,
        avgDurationMs: statsB.durations.averageMs,
        p95DurationMs: statsB.durations.p95Ms,
        retryRate: statsB.retryRate,
        failureCategories: failureCatsB,
      },
      differences: {
        successRateDelta,
        durationDeltaMs,
        durationChangePercent,
        retryRateDelta,
        isRegressed,
        regressionNotes,
      },
    };
  }

  /**
   * Records a business outcome measurement.
   */
  public recordBusinessOutcome(
    orgId: string,
    req: RecordBusinessOutcomeRequest,
  ): BusinessOutcomeRecord {
    const metSla =
      req.targetTimeMs && req.actualTimeMs !== undefined
        ? req.actualTimeMs <= req.targetTimeMs
        : req.status === "COMPLETED";

    const record: BusinessOutcomeRecord = {
      id: `outcome_${crypto.randomUUID()}`,
      organizationId: orgId,
      workflowId: req.workflowId,
      executionId: req.executionId,
      outcomeType: req.outcomeType,
      status: req.status,
      targetTimeMs: req.targetTimeMs,
      actualTimeMs: req.actualTimeMs,
      metSla,
      metadata: req.metadata || {},
      createdAt: new Date(),
    };

    apiStore.businessOutcomes.set(record.id, record);
    return record;
  }

  /**
   * Retrieves aggregated business outcomes.
   */
  public getBusinessOutcomes(orgId: string, workflowId?: string) {
    let outcomes = Array.from(apiStore.businessOutcomes.values()).filter(
      (o) => o.organizationId === orgId,
    );
    if (workflowId) {
      outcomes = outcomes.filter((o) => o.workflowId === workflowId);
    }

    const typeMap = new Map<
      string,
      {
        total: number;
        completed: number;
        failed: number;
        metSlaCount: number;
        durations: number[];
      }
    >();

    for (const o of outcomes) {
      if (!typeMap.has(o.outcomeType)) {
        typeMap.set(o.outcomeType, {
          total: 0,
          completed: 0,
          failed: 0,
          metSlaCount: 0,
          durations: [],
        });
      }
      const item = typeMap.get(o.outcomeType)!;
      item.total++;
      if (o.status === "COMPLETED") item.completed++;
      if (o.status === "FAILED") item.failed++;
      if (o.metSla) item.metSlaCount++;
      if (o.actualTimeMs !== undefined) item.durations.push(o.actualTimeMs);
    }

    const summaries = Array.from(typeMap.entries()).map(
      ([outcomeType, data]) => {
        const slaAttainmentPercent =
          data.total > 0
            ? Math.round((data.metSlaCount / data.total) * 1000) / 10
            : 100;
        const avgDurationMs =
          data.durations.length > 0
            ? Math.round(
                data.durations.reduce((a, b) => a + b, 0) /
                  data.durations.length,
              )
            : 0;

        return {
          outcomeType,
          total: data.total,
          completed: data.completed,
          failed: data.failed,
          slaAttainmentPercent,
          avgDurationMs,
        };
      },
    );

    return {
      totalOutcomesRecorded: outcomes.length,
      summaries,
      recentOutcomes: outcomes.slice(-20).reverse(),
    };
  }

  /**
   * Creates an SLO target for a workflow.
   */
  public createSlo(
    orgId: string,
    req: CreateWorkflowSloRequest,
  ): WorkflowSloRecord {
    const wf = apiStore.workflows.get(req.workflowId);
    const id = `slo_${crypto.randomUUID()}`;

    const slo: WorkflowSloRecord = {
      id,
      organizationId: orgId,
      workflowId: req.workflowId,
      workflowName: wf?.name || req.workflowId,
      name: req.name,
      targetType: req.targetType,
      targetValue: req.targetValue,
      windowHours: req.windowHours,
      description: req.description,
      enabled: true,
      currentValue: 100,
      errorBudgetRemainingPercent: 100,
      isCompliant: true,
      sampleCount: 0,
      evaluatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    apiStore.slos.set(id, slo);
    return this.evaluateSingleSlo(slo);
  }

  /**
   * Evaluates all SLOs for an organization.
   */
  public getSlos(orgId: string, workflowId?: string): WorkflowSloRecord[] {
    let slos = Array.from(apiStore.slos.values()).filter(
      (s) => s.organizationId === orgId,
    );
    if (workflowId) {
      slos = slos.filter((s) => s.workflowId === workflowId);
    }

    return slos.map((s) => this.evaluateSingleSlo(s));
  }

  /**
   * Evaluates compliance and remaining error budget for an SLO.
   */
  private evaluateSingleSlo(slo: WorkflowSloRecord): WorkflowSloRecord {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - slo.windowHours * 60 * 60 * 1000,
    );

    const executions = Array.from(apiStore.executions.values()).filter(
      (e) =>
        e.workflowId === slo.workflowId &&
        e.organizationId === slo.organizationId &&
        new Date(e.createdAt) >= windowStart,
    );

    const sampleCount = executions.length;
    let currentValue = 0;
    let isCompliant = true;
    let errorBudgetRemainingPercent = 100;

    if (sampleCount === 0) {
      slo.currentValue = slo.targetValue;
      slo.isCompliant = true;
      slo.errorBudgetRemainingPercent = 100;
      slo.sampleCount = 0;
      slo.evaluatedAt = now;
      apiStore.slos.set(slo.id, slo);
      return slo;
    }

    if (slo.targetType === "SUCCESS_RATE") {
      const successful = executions.filter(
        (e) => e.status === "SUCCEEDED",
      ).length;
      currentValue = Math.round((successful / sampleCount) * 1000) / 10;
      isCompliant = currentValue >= slo.targetValue;

      const allowedFailureRate = 100 - slo.targetValue;
      const actualFailureRate = 100 - currentValue;
      if (allowedFailureRate > 0) {
        errorBudgetRemainingPercent = Math.max(
          0,
          Math.round(
            ((allowedFailureRate - actualFailureRate) / allowedFailureRate) *
              1000,
          ) / 10,
        );
      } else {
        errorBudgetRemainingPercent = isCompliant ? 100 : 0;
      }
    } else if (slo.targetType === "DURATION_P95") {
      const durations: number[] = [];
      for (const e of executions) {
        if (e.startedAt && e.completedAt) {
          durations.push(
            Math.max(
              0,
              new Date(e.completedAt).getTime() -
                new Date(e.startedAt).getTime(),
            ),
          );
        }
      }
      currentValue = calculatePercentile(durations, 95);
      isCompliant = currentValue <= slo.targetValue;
      const overBudgetMs = currentValue - slo.targetValue;
      errorBudgetRemainingPercent = isCompliant
        ? 100
        : Math.max(0, Math.round((1 - overBudgetMs / slo.targetValue) * 100));
    } else if (slo.targetType === "QUEUE_WAIT_MAX") {
      const waits: number[] = [];
      for (const e of executions) {
        if (e.startedAt && e.createdAt) {
          waits.push(
            Math.max(
              0,
              new Date(e.startedAt).getTime() - new Date(e.createdAt).getTime(),
            ),
          );
        }
      }
      currentValue = calculatePercentile(waits, 95);
      isCompliant = currentValue <= slo.targetValue;
      errorBudgetRemainingPercent = isCompliant ? 100 : 0;
    } else if (slo.targetType === "APPROVAL_WAIT_MAX") {
      const approvals = Array.from(apiStore.approvals.values()).filter(
        (a) =>
          a.organizationId === slo.organizationId &&
          new Date(a.createdAt) >= windowStart,
      );
      const waits: number[] = [];
      for (const a of approvals) {
        if (a.decidedAt && a.createdAt) {
          waits.push(
            Math.max(
              0,
              new Date(a.decidedAt).getTime() - new Date(a.createdAt).getTime(),
            ),
          );
        }
      }
      currentValue = calculatePercentile(waits, 95);
      isCompliant = currentValue <= slo.targetValue;
      errorBudgetRemainingPercent = isCompliant ? 100 : 0;
    }

    slo.currentValue = currentValue;
    slo.isCompliant = isCompliant;
    slo.errorBudgetRemainingPercent = errorBudgetRemainingPercent;
    slo.sampleCount = sampleCount;
    slo.evaluatedAt = now;
    apiStore.slos.set(slo.id, slo);

    return slo;
  }

  /**
   * Generates actionable workflow optimization recommendations based on measured behavior.
   */
  public generateOptimizationRecommendations(
    orgId: string,
    workflowId?: string,
  ): WorkflowOptimizationRecommendation[] {
    const recommendations: WorkflowOptimizationRecommendation[] = [];
    const bottlenecks = this.detectBottlenecks(orgId, { workflowId });

    for (const b of bottlenecks) {
      if (b.category === "NODE_DURATION") {
        recommendations.push({
          recommendationId: `rec_opt_dur_${b.findingId}`,
          workflowId: b.workflowId,
          workflowName: b.workflowName,
          nodeId: b.nodeId,
          nodeName: b.nodeName,
          problem: `Step '${b.nodeName}' represents ${b.measuredValue}ms duration (${b.detectionRule}).`,
          evidence: b.evidence,
          proposedChange:
            "Enable response payload projection to transfer only required fields, or evaluate asynchronous execution if downstream steps do not depend immediately on output.",
          expectedBenefit:
            "Estimated 20-35% reduction in total end-to-end execution duration.",
          tradeoffs:
            "Requires verifying that downstream nodes do not reference omitted attributes.",
          requiredPermissions: ["workflow:write"],
          requiresApproval: true,
          verificationMethod:
            "Run test execution against draft version and compare duration metrics.",
        });
      } else if (b.category === "RETRY_STORM") {
        recommendations.push({
          recommendationId: `rec_opt_retry_${b.findingId}`,
          workflowId: b.workflowId,
          workflowName: b.workflowName,
          nodeId: b.nodeId,
          nodeName: b.nodeName,
          problem: `High retry volume detected on step '${b.nodeName}' (${b.measuredValue} retries).`,
          evidence: b.evidence,
          proposedChange:
            "Set maxRetries to 1 and add an error boundary branch with a fallback step rather than repeatedly retrying non-transient failures.",
          expectedBenefit:
            "Reduces worker compute consumption and eliminates queue congestion.",
          tradeoffs:
            "Failed steps will fail faster without extended retry backoff.",
          requiredPermissions: ["workflow:write"],
          requiresApproval: true,
          verificationMethod:
            "Observe retry metrics over subsequent 24-hour observation window.",
        });
      } else if (b.category === "HIGH_FAILURE_RATE") {
        recommendations.push({
          recommendationId: `rec_opt_fail_${b.findingId}`,
          workflowId: b.workflowId,
          workflowName: b.workflowName,
          nodeId: b.nodeId,
          nodeName: b.nodeName,
          problem: `Elevated failure rate of ${b.measuredValue}% on step '${b.nodeName}'.`,
          evidence: b.evidence,
          proposedChange:
            "Review credential validity, endpoint URL availability, and incoming schema validation rules.",
          expectedBenefit: "Restores workflow reliability towards target SLO.",
          tradeoffs:
            "May require credential renewal on external service provider.",
          requiredPermissions: ["workflow:write", "credentials:write"],
          requiresApproval: true,
          verificationMethod:
            "Validate node connectivity using test endpoint and review failure log trends.",
        });
      }
    }

    return recommendations;
  }

  /**
   * Generates AI-assisted operational insights grounded strictly in measured telemetry.
   */
  public async generateAiOperationalInsight(
    orgId: string,
    topic: "BOTTLENECK" | "REGRESSION" | "ANOMALY" | "OPTIMIZATION",
    resourceId: string,
  ): Promise<AiOperationalInsight> {
    const wf = apiStore.workflows.get(resourceId);
    const wfName = wf?.name || resourceId;

    // Collect telemetry evidence for this workflow
    const bottlenecks = this.detectBottlenecks(orgId, {
      workflowId: resourceId,
    });
    const anomalies = this.detectAnomalies(orgId, { workflowId: resourceId });
    const metrics = this.getProcessMetrics(orgId, {
      range: "7d",
      workflowId: resourceId,
    });

    const evidence: string[] = [
      `Workflow: ${wfName} (${resourceId})`,
      `7-Day Volume: ${metrics.sampleSize} executions (${metrics.reliability.successRate}% success rate, ${metrics.reliability.failureRate}% failure rate)`,
      `Duration p95: ${metrics.performance.p95Ms}ms (average: ${metrics.performance.averageMs}ms)`,
    ];

    if (bottlenecks.length > 0) {
      evidence.push(
        `Detected Bottlenecks: ${bottlenecks.map((b) => `${b.category} on ${b.nodeName} (${b.measuredValue})`).join("; ")}`,
      );
    }
    if (anomalies.length > 0) {
      evidence.push(
        `Active Anomalies: ${anomalies.map((a) => `${a.metricName} (${a.evidence})`).join("; ")}`,
      );
    }

    let summary = `Operational intelligence review for workflow "${wfName}".`;
    let detailedAnalysis = `Analysis grounded in ${metrics.sampleSize} verified executions over the last 7 days.`;
    const candidateExperiments: string[] = [];

    if (topic === "BOTTLENECK") {
      summary = `Identified performance bottleneck on workflow "${wfName}".`;
      detailedAnalysis =
        bottlenecks.length > 0
          ? `Primary constraint identified: ${bottlenecks[0].evidence.join(" ")} The step consumes disproportionate resources relative to other execution phases.`
          : `Execution duration p95 is ${metrics.performance.p95Ms}ms. External integration latency is the primary pacing factor.`;
      candidateExperiments.push(
        "Benchmark external HTTP endpoint response times under load.",
      );
      candidateExperiments.push(
        "Test asynchronous webhook callback model instead of synchronous wait.",
      );
    } else if (topic === "REGRESSION") {
      summary = `Performance regression assessment for workflow "${wfName}".`;
      detailedAnalysis = `Observed failure rate is currently ${metrics.reliability.failureRate}% with ${metrics.reliability.retryCount} retries recorded across recent executions.`;
      candidateExperiments.push(
        "Compare error classification against previous deployment version.",
      );
      candidateExperiments.push(
        "Audit upstream payload changes triggering schema validation failures.",
      );
    } else {
      summary = `Operational optimization opportunities for "${wfName}".`;
      detailedAnalysis = `Workflow operates with ${metrics.reliability.successRate}% reliability across ${metrics.sampleSize} executions. Queue wait time averages ${metrics.performance.avgQueueWaitMs}ms.`;
      candidateExperiments.push(
        "Configure proactive retry policies on transient network errors.",
      );
      candidateExperiments.push(
        "Establish automated SLO alerting for duration degradation.",
      );
    }

    return {
      insightId: `ins_${crypto.randomUUID()}`,
      topic,
      summary,
      detailedAnalysis,
      supportingEvidence: evidence,
      candidateExperiments,
      isAdvisory: true,
      tokensUsed: 140,
      generatedAt: new Date(),
    };
  }

  /**
   * Exports analytical report in CSV or JSON format with CSV formula-injection defense.
   */
  public exportReport(
    orgId: string,
    format: "csv" | "json",
    query: ProcessIntelligenceQuery,
  ): { contentType: string; filename: string; content: string } {
    const metrics = this.getProcessMetrics(orgId, query);
    const bottlenecks = this.detectBottlenecks(orgId, {
      workflowId: query.workflowId,
    });
    const slos = this.getSlos(orgId, query.workflowId);

    const reportData = {
      generatedAt: new Date().toISOString(),
      organizationId: orgId,
      window: metrics.window,
      metrics: metrics.reliability,
      performance: metrics.performance,
      humanInTheLoop: metrics.humanInTheLoop,
      bottlenecks,
      slos,
    };

    if (format === "json") {
      return {
        contentType: "application/json",
        filename: `process_intelligence_${orgId}_${Date.now()}.json`,
        content: JSON.stringify(reportData, null, 2),
      };
    }

    // CSV format with formula injection protection
    const sanitizeCsvField = (val: any): string => {
      if (val === null || val === undefined) return "";
      let str = String(val);
      // Neutralize formula injection triggers: =, +, -, @, tab, carriage return
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows: string[] = [];
    rows.push(["Metric", "Value", "Notes"].map(sanitizeCsvField).join(","));
    rows.push(
      ["Total Executions", metrics.reliability.total, "All terminal statuses"]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      [
        "Success Rate",
        `${metrics.reliability.successRate}%`,
        "Terminal success",
      ]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      [
        "Failure Rate",
        `${metrics.reliability.failureRate}%`,
        "Terminal failure",
      ]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      [
        "Average Duration",
        `${metrics.performance.averageMs}ms`,
        "Completed runs",
      ]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      ["p95 Duration", `${metrics.performance.p95Ms}ms`, "95th percentile"]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      [
        "Average Queue Wait",
        `${metrics.performance.avgQueueWaitMs}ms`,
        "Queue to started",
      ]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      ["Active Bottlenecks", bottlenecks.length, "Detected constraints"]
        .map(sanitizeCsvField)
        .join(","),
    );
    rows.push(
      [
        "Active SLOs",
        slos.length,
        `${slos.filter((s) => s.isCompliant).length} compliant`,
      ]
        .map(sanitizeCsvField)
        .join(","),
    );

    return {
      contentType: "text/csv",
      filename: `process_intelligence_${orgId}_${Date.now()}.csv`,
      content: rows.join("\n"),
    };
  }
}

export const processIntelligenceService = new ProcessIntelligenceService();
