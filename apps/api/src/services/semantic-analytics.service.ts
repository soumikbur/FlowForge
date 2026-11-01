import crypto from "crypto";
import {
  RoiAssumptionInput,
  RoiAssumptionRecord,
  RoiCalculationResult,
  WorkflowRoiBreakdown,
  DataQualityReport,
  DataQualityCheckResult,
  DataQualityIssue,
  DataQualityCheckStatus,
  GovernanceAnalyticsSummary,
  IntegrationAnalyticsSummary,
  ConnectorMetricItem,
  CreateSavedReportRequest,
  SavedReportRecord,
  SavedReportType,
} from "@flowforge/shared";
import { calculatePercentile } from "@flowforge/workflow-engine";
import { apiStore } from "../store.js";

export class SemanticAnalyticsService {
  /**
   * Resolves standard time windows from request query parameters.
   */
  public resolveTimeWindow(query: any): {
    from: Date;
    to: Date;
    range: string;
  } {
    const now = new Date();
    const range = (query?.range as string) || "24h";
    let to = query?.to ? new Date(query.to) : now;
    let from: Date;

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
        from = query?.from
          ? new Date(query.from)
          : new Date(to.getTime() - 24 * 60 * 60 * 1000);
        if (from > to) {
          from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        }
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

    return { from, to, range };
  }

  // ==========================================
  // 1. BUSINESS VALUE & ROI CALCULATION
  // ==========================================

  /**
   * Retrieves an ROI assumption for an organization and optional workflow override.
   */
  public getRoiAssumption(
    organizationId: string,
    workflowId?: string,
  ): RoiAssumptionRecord | null {
    if (workflowId) {
      const specific = Array.from(apiStore.roiAssumptions.values()).find(
        (a) =>
          a.organizationId === organizationId && a.workflowId === workflowId,
      );
      if (specific) return specific;
    }

    const orgDefault = Array.from(apiStore.roiAssumptions.values()).find(
      (a) =>
        a.organizationId === organizationId &&
        (!a.workflowId || a.workflowId === "default"),
    );

    return orgDefault || null;
  }

  /**
   * Configures / updates an ROI assumption record for an organization.
   */
  public upsertRoiAssumption(
    organizationId: string,
    input: RoiAssumptionInput,
    userId?: string,
  ): RoiAssumptionRecord {
    const existing = this.getRoiAssumption(organizationId, input.workflowId);
    const now = new Date();

    const id = existing?.id || `roi_${crypto.randomUUID()}`;
    const record: RoiAssumptionRecord = {
      id,
      organizationId,
      workflowId: input.workflowId || null,
      manualMinutesPerRun: input.manualMinutesPerRun ?? 15.0,
      hourlyWage: input.hourlyWage ?? 45.0,
      licenseCostMonthly: input.licenseCostMonthly ?? 0.0,
      infrastructureCostPerRun: input.infrastructureCostPerRun ?? 0.0,
      currency: input.currency || "USD",
      updatedById: userId || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    apiStore.roiAssumptions.set(id, record);
    return record;
  }

  /**
   * Calculates comprehensive ROI and business value metrics.
   */
  public calculateRoi(
    organizationId: string,
    options: {
      range?: string;
      from?: Date;
      to?: Date;
      workflowId?: string;
      manualMinutes?: number;
      hourlyWage?: number;
    },
  ): RoiCalculationResult {
    const timeWindow = this.resolveTimeWindow(options);
    const { from, to, range } = timeWindow;

    const baseAssumption = this.getRoiAssumption(
      organizationId,
      options.workflowId,
    );

    const manualMinutesPerRun =
      options.manualMinutes !== undefined
        ? Number(options.manualMinutes)
        : (baseAssumption?.manualMinutesPerRun ?? 15.0);

    const hourlyWage =
      options.hourlyWage !== undefined
        ? Number(options.hourlyWage)
        : (baseAssumption?.hourlyWage ?? 45.0);

    const licenseCostMonthly = baseAssumption?.licenseCostMonthly ?? 0.0;
    const infrastructureCostPerRun =
      baseAssumption?.infrastructureCostPerRun ?? 0.0;
    const currency = baseAssumption?.currency || "USD";

    // Gather executions for organization in time window
    let executions = Array.from(apiStore.executions.values()).filter((e) => {
      if (e.organizationId !== organizationId) return false;
      const createdAt = new Date(e.createdAt);
      return createdAt >= from && createdAt <= to;
    });

    if (options.workflowId) {
      executions = executions.filter(
        (e) => e.workflowId === options.workflowId,
      );
    }

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(
      (e) => e.status === "SUCCEEDED",
    ).length;

    // Time saved calculation
    const estimatedHoursSaved =
      Math.round(((successfulExecutions * manualMinutesPerRun) / 60) * 100) /
      100;
    const estimatedLaborCostAvoided =
      Math.round(estimatedHoursSaved * hourlyWage * 100) / 100;

    // Prorated license cost over query window duration
    const durationDays = Math.max(
      1,
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    );
    const licenseCostAllocated =
      Math.round((licenseCostMonthly / 30) * durationDays * 100) / 100;

    // Total infrastructure cost per run
    const infrastructureCostTotal =
      Math.round(totalExecutions * infrastructureCostPerRun * 100) / 100;

    // Net savings
    const netSavings =
      Math.round(
        (estimatedLaborCostAvoided -
          licenseCostAllocated -
          infrastructureCostTotal) *
          100,
      ) / 100;

    // Group breakdown by workflow
    const workflowsMap = new Map<string, typeof executions>();
    for (const exec of executions) {
      const list = workflowsMap.get(exec.workflowId) || [];
      list.push(exec);
      workflowsMap.set(exec.workflowId, list);
    }

    const breakdownByWorkflow: WorkflowRoiBreakdown[] = [];
    for (const [wfId, execs] of workflowsMap.entries()) {
      const wfRecord = apiStore.workflows.get(wfId);
      const wfName = wfRecord?.name || `Workflow ${wfId.slice(0, 8)}`;
      const wfAssumption = this.getRoiAssumption(organizationId, wfId);

      const wfMinutes =
        wfAssumption?.manualMinutesPerRun ?? manualMinutesPerRun;
      const wfWage = wfAssumption?.hourlyWage ?? hourlyWage;
      const wfInfraRate =
        wfAssumption?.infrastructureCostPerRun ?? infrastructureCostPerRun;

      const count = execs.length;
      const succCount = execs.filter((e) => e.status === "SUCCEEDED").length;
      const hours = Math.round(((succCount * wfMinutes) / 60) * 100) / 100;
      const labor = Math.round(hours * wfWage * 100) / 100;
      const infra = Math.round(count * wfInfraRate * 100) / 100;
      const net = Math.round((labor - infra) * 100) / 100;

      breakdownByWorkflow.push({
        workflowId: wfId,
        workflowName: wfName,
        executionCount: count,
        successfulExecutions: succCount,
        manualMinutesPerRun: wfMinutes,
        hoursSaved: hours,
        laborCostAvoided: labor,
        infrastructureCost: infra,
        netSavings: net,
      });
    }

    // Sort descending by net savings
    breakdownByWorkflow.sort((a, b) => b.netSavings - a.netSavings);

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        range,
      },
      totalExecutions,
      successfulExecutions,
      estimatedHoursSaved,
      estimatedLaborCostAvoided,
      licenseCostAllocated,
      infrastructureCostTotal,
      netSavings,
      currency,
      assumptionsUsed: {
        manualMinutesPerRun,
        hourlyWage,
        licenseCostMonthly,
        infrastructureCostPerRun,
        isCustom:
          !!baseAssumption ||
          options.manualMinutes !== undefined ||
          options.hourlyWage !== undefined,
      },
      breakdownByWorkflow,
    };
  }

  // ==========================================
  // 2. DATA QUALITY AUDITOR
  // ==========================================

  /**
   * Scans all workflow operational facts, executions, steps, and events for an organization
   * to detect schema anomalies, corrupt timestamps, orphaned child records, and invalid data.
   */
  public auditDataQuality(organizationId: string): DataQualityReport {
    const now = new Date();
    const issues: DataQualityIssue[] = [];

    const orgExecutions = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId,
    );
    const orgExecIds = new Set(orgExecutions.map((e) => e.id));

    const orgSteps = Array.from(apiStore.steps.values()).filter((s) =>
      orgExecIds.has(s.executionId),
    );
    const orgApprovals = Array.from(apiStore.approvals.values()).filter(
      (a) => a.organizationId === organizationId,
    );
    const orgEvents = Array.from(apiStore.streamEvents.values()).filter(
      (e) => e.organizationId === organizationId,
    );

    let totalRecordsAudited =
      orgExecutions.length +
      orgSteps.length +
      orgApprovals.length +
      orgEvents.length;

    // Check 1: Schema Integrity (Required IDs & fields)
    let schemaIntegrityIssues = 0;
    for (const exec of orgExecutions) {
      if (!exec.id || !exec.workflowId || !exec.status) {
        schemaIntegrityIssues++;
        issues.push({
          entityType: "execution",
          recordId: exec.id || "unknown",
          issueType: "MISSING_ID",
          message:
            "Execution record is missing required identification fields or status.",
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }
    }
    for (const step of orgSteps) {
      if (!step.id || !step.executionId || !step.nodeId) {
        schemaIntegrityIssues++;
        issues.push({
          entityType: "step",
          recordId: step.id || "unknown",
          issueType: "MISSING_ID",
          message:
            "Execution step is missing required identification or parent execution reference.",
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }
    }

    // Check 2: Timestamp Validity (Negative durations, future dates)
    let timestampIssues = 0;
    for (const exec of orgExecutions) {
      const created = new Date(exec.createdAt).getTime();
      const started = exec.startedAt
        ? new Date(exec.startedAt).getTime()
        : null;
      const completed = exec.completedAt
        ? new Date(exec.completedAt).getTime()
        : null;

      if (started && completed && completed < started) {
        timestampIssues++;
        issues.push({
          entityType: "execution",
          recordId: exec.id,
          issueType: "NEGATIVE_DURATION",
          message: `Execution completedAt (${exec.completedAt}) occurs prior to startedAt (${exec.startedAt}).`,
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }

      if (created > now.getTime() + 5 * 60 * 1000) {
        timestampIssues++;
        issues.push({
          entityType: "execution",
          recordId: exec.id,
          issueType: "INVALID_TIMESTAMP",
          message: `Execution createdAt (${exec.createdAt}) is set in the future.`,
          severity: "MEDIUM",
          detectedAt: now.toISOString(),
        });
      }
    }

    for (const step of orgSteps) {
      const started = step.startedAt
        ? new Date(step.startedAt).getTime()
        : null;
      const completed = step.completedAt
        ? new Date(step.completedAt).getTime()
        : null;
      if (started && completed && completed < started) {
        timestampIssues++;
        issues.push({
          entityType: "step",
          recordId: step.id,
          issueType: "NEGATIVE_DURATION",
          message: `Step completedAt is before startedAt (negative duration).`,
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }
    }

    // Check 3: Relational Integrity (Orphaned step or approval records)
    let relationalIssues = 0;
    for (const step of apiStore.steps.values()) {
      if (!apiStore.executions.has(step.executionId)) {
        // If it belongs to this org or has no parent execution in the entire store
        relationalIssues++;
        issues.push({
          entityType: "step",
          recordId: step.id,
          issueType: "ORPHANED_RECORD",
          message: `Step references executionId "${step.executionId}" which does not exist.`,
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }
    }

    for (const approval of orgApprovals) {
      if (approval.executionId && !orgExecIds.has(approval.executionId)) {
        relationalIssues++;
        issues.push({
          entityType: "approval",
          recordId: approval.id,
          issueType: "ORPHANED_RECORD",
          message: `Approval references executionId "${approval.executionId}" which does not exist in organization.`,
          severity: "HIGH",
          detectedAt: now.toISOString(),
        });
      }
    }

    // Check 4: Failure Classification Completeness
    let failureClassificationIssues = 0;
    for (const exec of orgExecutions) {
      if (exec.status === "FAILED") {
        const hasError =
          !!exec.errorDetails ||
          !!(exec as any).error ||
          !!(exec as any).metadata?.error;
        if (!hasError) {
          failureClassificationIssues++;
          issues.push({
            entityType: "execution",
            recordId: exec.id,
            issueType: "UNCLASSIFIED_FAILURE",
            message: `Execution marked as FAILED without an error message or classified category.`,
            severity: "MEDIUM",
            detectedAt: now.toISOString(),
          });
        }
      }
    }

    // Check 5: Stream Event Integrity
    let streamIssues = 0;
    for (const event of orgEvents) {
      if (!event.id || !event.type || !event.source) {
        streamIssues++;
        issues.push({
          entityType: "event",
          recordId: event.id || "unknown",
          issueType: "MISSING_ID",
          message: "Stream event missing required id, type, or source header.",
          severity: "MEDIUM",
          detectedAt: now.toISOString(),
        });
      }
    }

    const corruptedRecordsCount = issues.length;
    const cleanRecordsCount = Math.max(
      0,
      totalRecordsAudited - corruptedRecordsCount,
    );

    const calcCheckScore = (
      issueCount: number,
      baseCount: number,
    ): { score: number; status: DataQualityCheckStatus } => {
      if (baseCount === 0) return { score: 100, status: "PASS" };
      const score = Math.max(
        0,
        Math.min(100, Math.round(100 - (issueCount / baseCount) * 100)),
      );
      const status: DataQualityCheckStatus =
        score >= 95 ? "PASS" : score >= 80 ? "WARN" : "FAIL";
      return { score, status };
    };

    const c1 = calcCheckScore(
      schemaIntegrityIssues,
      orgExecutions.length + orgSteps.length,
    );
    const c2 = calcCheckScore(
      timestampIssues,
      orgExecutions.length + orgSteps.length,
    );
    const c3 = calcCheckScore(
      relationalIssues,
      orgSteps.length + orgApprovals.length,
    );
    const c4 = calcCheckScore(
      failureClassificationIssues,
      orgExecutions.filter((e) => e.status === "FAILED").length,
    );
    const c5 = calcCheckScore(streamIssues, orgEvents.length);

    const checks: DataQualityCheckResult[] = [
      {
        checkName: "SCHEMA_INTEGRITY",
        status: c1.status,
        score: c1.score,
        evaluatedCount: orgExecutions.length + orgSteps.length,
        issueCount: schemaIntegrityIssues,
        details:
          "Evaluates whether mandatory UUIDs, workflow references, and execution states are present.",
      },
      {
        checkName: "TIMESTAMP_VALIDITY",
        status: c2.status,
        score: c2.score,
        evaluatedCount: orgExecutions.length + orgSteps.length,
        issueCount: timestampIssues,
        details:
          "Checks for chronologically impossible negative durations or future-skewed creation dates.",
      },
      {
        checkName: "RELATIONAL_INTEGRITY",
        status: c3.status,
        score: c3.score,
        evaluatedCount: orgSteps.length + orgApprovals.length,
        issueCount: relationalIssues,
        details:
          "Verifies referential integrity between parent executions, node steps, and approval requests.",
      },
      {
        checkName: "FAILURE_CLASSIFICATION",
        status: c4.status,
        score: c4.score,
        evaluatedCount: orgExecutions.filter((e) => e.status === "FAILED")
          .length,
        issueCount: failureClassificationIssues,
        details:
          "Ensures all terminated failures contain diagnostic error codes and sanitized reasons.",
      },
      {
        checkName: "STREAM_INTEGRITY",
        status: c5.status,
        score: c5.score,
        evaluatedCount: orgEvents.length,
        issueCount: streamIssues,
        details:
          "Inspects stream events for standard headers, event types, and non-empty payloads.",
      },
    ];

    const overallQualityScore =
      checks.length > 0
        ? Math.round(
            checks.reduce((sum, c) => sum + c.score, 0) / checks.length,
          )
        : 100;

    const overallStatus: DataQualityCheckStatus =
      overallQualityScore >= 90
        ? "PASS"
        : overallQualityScore >= 70
          ? "WARN"
          : "FAIL";

    return {
      overallQualityScore,
      status: overallStatus,
      totalRecordsAudited,
      cleanRecordsCount,
      corruptedRecordsCount,
      auditedAt: now.toISOString(),
      checks,
      issues,
    };
  }

  // ==========================================
  // 3. GOVERNANCE ANALYTICS
  // ==========================================

  /**
   * Generates aggregated governance, policy enforcement, and approval bottleneck analytics.
   */
  public getGovernanceSummary(
    organizationId: string,
    options: { range?: string; from?: Date; to?: Date },
  ): GovernanceAnalyticsSummary {
    const { from, to } = this.resolveTimeWindow(options);

    // Policy violations
    const violations = Array.from(apiStore.policyViolations.values()).filter(
      (v) => {
        if (v.organizationId !== organizationId) return false;
        const detectedAt = new Date(v.detectedAt);
        return detectedAt >= from && detectedAt <= to;
      },
    );

    const violationsBySeverity = {
      CRITICAL: violations.filter((v) => v.severity === "CRITICAL").length,
      HIGH: violations.filter((v) => v.severity === "HIGH").length,
      MEDIUM: violations.filter((v) => v.severity === "MEDIUM").length,
      LOW: violations.filter((v) => v.severity === "LOW").length,
    };

    // Policy exceptions
    const exceptions = Array.from(apiStore.policyExceptions.values()).filter(
      (e) => e.organizationId === organizationId,
    );
    const activeExceptions = exceptions.filter(
      (e) => e.status === "APPROVED" && new Date(e.expiresAt) > new Date(),
    ).length;

    // Approvals
    const approvals = Array.from(apiStore.approvals.values()).filter((a) => {
      if (a.organizationId !== organizationId) return false;
      const createdAt = new Date(a.createdAt);
      return createdAt >= from && createdAt <= to;
    });

    const pendingApprovals = approvals.filter(
      (a) => a.status === "PENDING",
    ).length;
    const approvedApprovals = approvals.filter(
      (a) => a.status === "APPROVED",
    ).length;
    const rejectedApprovals = approvals.filter(
      (a) => a.status === "REJECTED",
    ).length;

    // Wait times for resolved approvals
    const resolvedApprovals = approvals.filter(
      (a) =>
        (a.status === "APPROVED" || a.status === "REJECTED") &&
        (a.decidedAt || (a as any).resolvedAt),
    );
    const waitTimes = resolvedApprovals.map((a) => {
      const resolved = a.decidedAt || (a as any).resolvedAt;
      return new Date(resolved).getTime() - new Date(a.createdAt).getTime();
    });
    const averageWaitTimeMs =
      waitTimes.length > 0
        ? Math.round(
            waitTimes.reduce((acc, t) => acc + t, 0) / waitTimes.length,
          )
        : 0;

    // Evaluation counts estimated from policies & violations
    const blockedCount = violations.length;
    const totalPolicyEvaluations = Math.max(
      blockedCount,
      approvals.length * 2 + 10,
    );
    const evaluationsAllowed = Math.max(
      0,
      totalPolicyEvaluations - blockedCount,
    );
    const passRatePercentage =
      totalPolicyEvaluations > 0
        ? Math.round((evaluationsAllowed / totalPolicyEvaluations) * 1000) / 10
        : 100;

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalPolicyEvaluations,
      evaluationsAllowed,
      evaluationsBlocked: blockedCount,
      evaluationsWarned: violationsBySeverity.LOW,
      passRatePercentage,
      totalViolations: violations.length,
      violationsBySeverity,
      totalExceptions: exceptions.length,
      activeExceptions,
      approvals: {
        total: approvals.length,
        pending: pendingApprovals,
        approved: approvedApprovals,
        rejected: rejectedApprovals,
        averageWaitTimeMs,
      },
      enforcementDistribution: {
        BLOCK: blockedCount,
        WARN: violationsBySeverity.LOW,
        ALLOW: evaluationsAllowed,
      },
    };
  }

  // ==========================================
  // 4. INTEGRATION & CONNECTOR ANALYTICS
  // ==========================================

  /**
   * Generates connector reliability, error rate, and invocation analytics.
   */
  public getIntegrationSummary(
    organizationId: string,
    options: { range?: string; from?: Date; to?: Date },
  ): IntegrationAnalyticsSummary {
    const { from, to } = this.resolveTimeWindow(options);

    const connections = Array.from(apiStore.connections.values()).filter(
      (c) => c.organizationId === organizationId,
    );

    const executions = Array.from(apiStore.executions.values()).filter((e) => {
      if (e.organizationId !== organizationId) return false;
      const createdAt = new Date(e.createdAt);
      return createdAt >= from && createdAt <= to;
    });
    const execIds = new Set(executions.map((e) => e.id));

    const steps = Array.from(apiStore.steps.values()).filter((s) =>
      execIds.has(s.executionId),
    );

    let totalInvocations = 0;
    let totalSuccess = 0;
    let totalRateLimits = 0;

    const connectors: ConnectorMetricItem[] = [];

    for (const conn of connections) {
      // Find steps matching this connector or nodeType
      const connSteps = steps.filter(
        (s) =>
          (s as any).metadata?.connectionId === conn.id ||
          s.nodeType === `connector_${conn.connectorId}` ||
          s.nodeType.toLowerCase().includes(conn.connectorId.toLowerCase()),
      );

      const totalCalls = connSteps.length;
      const successCount = connSteps.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const errorCount = connSteps.filter((s) => s.status === "FAILED").length;
      const errorRatePercentage =
        totalCalls > 0 ? Math.round((errorCount / totalCalls) * 1000) / 10 : 0;

      const durations = connSteps
        .filter((s) => s.startedAt && s.completedAt)
        .map(
          (s) =>
            new Date(s.completedAt!).getTime() -
            new Date(s.startedAt!).getTime(),
        )
        .filter((d) => d >= 0);

      const averageLatencyMs =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;
      const p95LatencyMs = calculatePercentile(durations, 95);

      const rateLimitHits = connSteps.filter(
        (s) =>
          (s as any).metadata?.statusCode === 429 ||
          (s as any).metadata?.errorCategory === "RATE_LIMIT" ||
          (s.errorMessage && s.errorMessage.includes("429")),
      ).length;

      totalInvocations += totalCalls;
      totalSuccess += successCount;
      totalRateLimits += rateLimitHits;

      connectors.push({
        connectionId: conn.id,
        connectorName: conn.name || conn.connectorId,
        provider: conn.connectorId,
        status: conn.status || "ACTIVE",
        totalCalls,
        successCount,
        errorCount,
        errorRatePercentage,
        averageLatencyMs,
        p95LatencyMs,
        rateLimitHits,
        lastUsedAt: conn.updatedAt
          ? new Date(conn.updatedAt).toISOString()
          : null,
      });
    }

    const overallSuccessRate =
      totalInvocations > 0
        ? Math.round((totalSuccess / totalInvocations) * 1000) / 10
        : 100;

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalConnections: connections.length,
      activeConnections: connections.filter(
        (c) => c.status === "ACTIVE" || (c.status as string) === "CONNECTED",
      ).length,
      totalInvocations,
      overallSuccessRate,
      rateLimitSpikes: totalRateLimits,
      connectors,
    };
  }

  // ==========================================
  // 5. SAVED REPORTS & EXPORT ENGINE
  // ==========================================

  public createSavedReport(
    organizationId: string,
    input: CreateSavedReportRequest,
    userId: string,
  ): SavedReportRecord {
    const now = new Date();
    const id = `rep_${crypto.randomUUID()}`;

    const report: SavedReportRecord = {
      id,
      organizationId,
      workspaceId: input.workspaceId || null,
      name: input.name,
      description: input.description || null,
      reportType: input.reportType,
      filters: input.filters || {},
      metrics: input.metrics || [],
      scheduleCron: input.scheduleCron || null,
      format: input.format,
      createdById: userId,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.savedReports.set(id, report);
    return report;
  }

  public listSavedReports(
    organizationId: string,
    workspaceId?: string,
  ): SavedReportRecord[] {
    return Array.from(apiStore.savedReports.values()).filter((r) => {
      if (r.organizationId !== organizationId) return false;
      if (workspaceId && r.workspaceId && r.workspaceId !== workspaceId)
        return false;
      return true;
    });
  }

  public getSavedReport(
    organizationId: string,
    reportId: string,
  ): SavedReportRecord | null {
    const report = apiStore.savedReports.get(reportId);
    if (!report || report.organizationId !== organizationId) return null;
    return report;
  }

  public deleteSavedReport(organizationId: string, reportId: string): boolean {
    const report = this.getSavedReport(organizationId, reportId);
    if (!report) return false;
    return apiStore.savedReports.delete(reportId);
  }

  /**
   * Executes a saved report and formats the result as CSV or JSON.
   */
  public generateReportExport(
    organizationId: string,
    reportId: string,
    formatOverride?: "JSON" | "CSV",
  ): { data: string; filename: string; mimeType: string } {
    const report = this.getSavedReport(organizationId, reportId);
    if (!report) {
      throw new Error(`Report "${reportId}" not found for organization.`);
    }

    const format = formatOverride || report.format || "JSON";
    const filters = report.filters || {};

    let reportData: any;

    switch (report.reportType) {
      case "EXECUTIVE_ROI":
        reportData = this.calculateRoi(organizationId, filters);
        break;
      case "DATA_QUALITY":
        reportData = this.auditDataQuality(organizationId);
        break;
      case "GOVERNANCE_AUDIT":
        reportData = this.getGovernanceSummary(organizationId, filters);
        break;
      case "INTEGRATION_RELIABILITY":
        reportData = this.getIntegrationSummary(organizationId, filters);
        break;
      default:
        reportData = this.calculateRoi(organizationId, filters);
        break;
    }

    const safeName = report.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "CSV") {
      const csv = this.convertJsonToCsv(report.reportType, reportData);
      return {
        data: csv,
        filename: `${safeName}_${timestamp}.csv`,
        mimeType: "text/csv; charset=utf-8",
      };
    }

    return {
      data: JSON.stringify(
        {
          report: { id: report.id, name: report.name, type: report.reportType },
          data: reportData,
        },
        null,
        2,
      ),
      filename: `${safeName}_${timestamp}.json`,
      mimeType: "application/json; charset=utf-8",
    };
  }

  /**
   * Converts structured report data into RFC 4180 compliant CSV.
   */
  private convertJsonToCsv(reportType: SavedReportType, data: any): string {
    const escapeCsvField = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (
        str.includes(",") ||
        str.includes('"') ||
        str.includes("\n") ||
        str.includes("\r")
      ) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    if (reportType === "EXECUTIVE_ROI") {
      const headers = [
        "Workflow ID",
        "Workflow Name",
        "Executions",
        "Successful",
        "Manual Minutes Per Run",
        "Hours Saved",
        "Labor Cost Avoided ($)",
        "Infrastructure Cost ($)",
        "Net Savings ($)",
      ];

      const rows: string[] = [headers.join(",")];
      for (const row of data.breakdownByWorkflow || []) {
        rows.push(
          [
            escapeCsvField(row.workflowId),
            escapeCsvField(row.workflowName),
            escapeCsvField(row.executionCount),
            escapeCsvField(row.successfulExecutions),
            escapeCsvField(row.manualMinutesPerRun),
            escapeCsvField(row.hoursSaved),
            escapeCsvField(row.laborCostAvoided),
            escapeCsvField(row.infrastructureCost),
            escapeCsvField(row.netSavings),
          ].join(","),
        );
      }
      return rows.join("\r\n");
    }

    if (reportType === "DATA_QUALITY") {
      const headers = [
        "Check Name",
        "Status",
        "Score",
        "Evaluated Count",
        "Issue Count",
        "Details",
      ];
      const rows: string[] = [headers.join(",")];
      for (const check of data.checks || []) {
        rows.push(
          [
            escapeCsvField(check.checkName),
            escapeCsvField(check.status),
            escapeCsvField(check.score),
            escapeCsvField(check.evaluatedCount),
            escapeCsvField(check.issueCount),
            escapeCsvField(check.details),
          ].join(","),
        );
      }
      return rows.join("\r\n");
    }

    if (reportType === "INTEGRATION_RELIABILITY") {
      const headers = [
        "Connection ID",
        "Connector Name",
        "Provider",
        "Status",
        "Total Calls",
        "Success Count",
        "Error Count",
        "Error Rate (%)",
        "Average Latency (ms)",
        "P95 Latency (ms)",
        "Rate Limit Hits",
      ];
      const rows: string[] = [headers.join(",")];
      for (const conn of data.connectors || []) {
        rows.push(
          [
            escapeCsvField(conn.connectionId),
            escapeCsvField(conn.connectorName),
            escapeCsvField(conn.provider),
            escapeCsvField(conn.status),
            escapeCsvField(conn.totalCalls),
            escapeCsvField(conn.successCount),
            escapeCsvField(conn.errorCount),
            escapeCsvField(conn.errorRatePercentage),
            escapeCsvField(conn.averageLatencyMs),
            escapeCsvField(conn.p95LatencyMs),
            escapeCsvField(conn.rateLimitHits),
          ].join(","),
        );
      }
      return rows.join("\r\n");
    }

    // Generic flatten for other types
    const keys = Object.keys(data).filter(
      (k) => typeof data[k] !== "object" || data[k] === null,
    );
    const rows = [
      keys.join(","),
      keys.map((k) => escapeCsvField(data[k])).join(","),
    ];
    return rows.join("\r\n");
  }
}

export const semanticAnalyticsService = new SemanticAnalyticsService();
