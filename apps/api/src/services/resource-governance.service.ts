import crypto from "crypto";
import {
  ResourceQuotaRecord,
  ResourceQuotaInput,
  AdmissionDecision,
  ResourceReservationRecord,
  CostBudgetStatus,
  ResourceUtilizationSummary,
  Role,
} from "@flowforge/shared";
import { apiStore, WorkflowExecutionRecord } from "../store.js";
import { entitlementService } from "./entitlement.service.js";

export class ResourceGovernanceService {
  private reservationTtlMs = 10 * 60 * 1000; // 10 minutes default reservation safety TTL

  /**
   * Resolves effective resource quotas using hierarchical precedence:
   * 1. Workflow-specific override
   * 2. Workspace-specific override
   * 3. Organization-level quota policy
   * 4. Subscription plan entitlements & hard defaults
   */
  public getEffectiveQuota(
    organizationId: string,
    workspaceId?: string | null,
    workflowId?: string | null,
  ): ResourceQuotaRecord {
    // 1. Workflow-level override
    if (workflowId) {
      const wfQuota = Array.from(apiStore.resourceQuotas.values()).find(
        (q) =>
          q.organizationId === organizationId &&
          q.workflowId === workflowId &&
          (!workspaceId || !q.workspaceId || q.workspaceId === workspaceId),
      );
      if (wfQuota) return { ...wfQuota, scopeType: "WORKFLOW" };
    }

    // 2. Workspace-level override
    if (workspaceId) {
      const wsQuota = Array.from(apiStore.resourceQuotas.values()).find(
        (q) =>
          q.organizationId === organizationId &&
          q.workspaceId === workspaceId &&
          !q.workflowId,
      );
      if (wsQuota) return { ...wsQuota, scopeType: "WORKSPACE" };
    }

    // 3. Organization-level quota
    const orgQuota = Array.from(apiStore.resourceQuotas.values()).find(
      (q) =>
        q.organizationId === organizationId && !q.workspaceId && !q.workflowId,
    );
    if (orgQuota) return { ...orgQuota, scopeType: "ORGANIZATION" };

    // 4. Default merged with Subscription Plan Entitlements
    const plan = entitlementService.getEffectivePlan(organizationId);
    const entitlements = plan.entitlements;

    return {
      id: `default_quota_${organizationId}`,
      organizationId,
      workspaceId: null,
      workflowId: null,
      scopeType: "PLAN_DEFAULT",
      maxMonthlyExecutions: entitlements.maxMonthlyExecutions ?? 5000,
      maxConcurrentExecutions: entitlements.maxConcurrentExecutions ?? 10,
      maxQueueDepth: 50,
      maxExecutionDurationMs: 300000, // 5 minutes
      maxStepCount: 100,
      maxRetries: 3,
      maxConnectorCallsPerRun: 50,
      monthlyBudgetDollars: 500.0,
      budgetAlertThresholdPercent: 80.0,
      fairShareWeight: 10,
      enforcementAction: "REJECT",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Sets or updates a resource quota policy for organization, workspace, or workflow.
   */
  public upsertQuotaPolicy(
    organizationId: string,
    input: ResourceQuotaInput,
    userId?: string,
  ): ResourceQuotaRecord {
    const existing = Array.from(apiStore.resourceQuotas.values()).find(
      (q) =>
        q.organizationId === organizationId &&
        q.workspaceId === (input.workspaceId || null) &&
        q.workflowId === (input.workflowId || null),
    );

    const now = new Date();
    const id = existing?.id || `quota_${crypto.randomUUID()}`;

    const record: ResourceQuotaRecord = {
      id,
      organizationId,
      workspaceId: input.workspaceId || null,
      workflowId: input.workflowId || null,
      scopeType: input.workflowId
        ? "WORKFLOW"
        : input.workspaceId
          ? "WORKSPACE"
          : "ORGANIZATION",
      maxMonthlyExecutions: input.maxMonthlyExecutions ?? 5000,
      maxConcurrentExecutions: input.maxConcurrentExecutions ?? 10,
      maxQueueDepth: input.maxQueueDepth ?? 50,
      maxExecutionDurationMs: input.maxExecutionDurationMs ?? 300000,
      maxStepCount: input.maxStepCount ?? 100,
      maxRetries: input.maxRetries ?? 3,
      maxConnectorCallsPerRun: input.maxConnectorCallsPerRun ?? 50,
      monthlyBudgetDollars: input.monthlyBudgetDollars ?? 500.0,
      budgetAlertThresholdPercent: input.budgetAlertThresholdPercent ?? 80.0,
      fairShareWeight: input.fairShareWeight ?? 10,
      enforcementAction: input.enforcementAction ?? "REJECT",
      updatedById: userId || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    apiStore.resourceQuotas.set(id, record);
    return record;
  }

  /**
   * Single authoritative atomic admission control boundary for all workflow executions.
   */
  public admitExecution(params: {
    organizationId: string;
    workflowId: string;
    workspaceId?: string | null;
    workflowVersionId: string;
    triggerType: "MANUAL" | "WEBHOOK" | "SCHEDULE" | "EVENT";
    triggerPayload?: Record<string, unknown>;
    environment?: "development" | "staging" | "production";
    idempotencyKey?: string;
    estimatedCost?: number;
    userId?: string;
  }): AdmissionDecision {
    const {
      organizationId,
      workflowId,
      workspaceId,
      workflowVersionId,
      triggerType,
      triggerPayload = {},
      environment = "development",
      idempotencyKey,
      userId,
    } = params;

    const now = new Date();

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = Array.from(apiStore.executions.values()).find(
        (e) =>
          e.organizationId === organizationId &&
          e.workflowId === workflowId &&
          e.idempotencyKey === idempotencyKey,
      );

      if (existing) {
        return {
          allowed: true,
          outcome: "ACCEPTED",
          statusCode: 200,
          reason: "Idempotent request matched existing execution.",
          execution: existing,
        };
      }
    }

    // 2. Subscription Delinquency & Suspension Check
    if (entitlementService.isSuspended(organizationId)) {
      return {
        allowed: false,
        outcome: "SUBSCRIPTION_SUSPENDED",
        statusCode: 402,
        reason:
          "Subscription is suspended due to payment delinquency. Please update billing payment information.",
        metric: "subscription_status",
      };
    }

    // 3. Resolve Hierarchical Quota
    const quota = this.getEffectiveQuota(
      organizationId,
      workspaceId,
      workflowId,
    );

    // 4. Monthly Execution Quota Check
    if (quota.maxMonthlyExecutions !== -1) {
      const { periodStart, periodEnd } =
        entitlementService.getCurrentBillingPeriod(organizationId);
      const monthlyUsage = Array.from(apiStore.usageRecords.values())
        .filter(
          (u) =>
            u.organizationId === organizationId &&
            u.metric === "WORKFLOW_EXECUTION" &&
            u.recordedAt >= periodStart &&
            u.recordedAt <= periodEnd,
        )
        .reduce((sum, u) => sum + u.quantity, 0);

      const storeExecutionsCount = Array.from(
        apiStore.executions.values(),
      ).filter((e) => {
        if (e.organizationId !== organizationId) return false;
        const createdAt = new Date(e.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      }).length;

      const effectiveMonthlyCount = Math.max(
        monthlyUsage,
        storeExecutionsCount,
      );

      if (effectiveMonthlyCount >= quota.maxMonthlyExecutions) {
        return {
          allowed: false,
          outcome: "QUOTA_EXCEEDED",
          statusCode: 402,
          reason: `Monthly workflow execution quota exceeded (${effectiveMonthlyCount}/${quota.maxMonthlyExecutions}).`,
          metric: "monthly_executions",
          limit: quota.maxMonthlyExecutions,
          currentUsage: effectiveMonthlyCount,
        };
      }
    }

    // 5. Queue Backpressure & Capacity Limit
    const currentQueued = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "QUEUED",
    ).length;

    if (currentQueued >= quota.maxQueueDepth) {
      return {
        allowed: false,
        outcome: "REJECTED_QUEUE_CAPACITY",
        statusCode: 429,
        retryAfterSeconds: 30,
        reason: `Execution queue depth limit reached (${currentQueued}/${quota.maxQueueDepth}). Backpressure applied.`,
        metric: "queue_depth",
        limit: quota.maxQueueDepth,
        currentUsage: currentQueued,
      };
    }

    // 6. Concurrency Reservation Check
    // Active executions = RUNNING executions in store + unexpired active reservations
    const runningCount = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "RUNNING",
    ).length;

    const activeReservations = Array.from(
      apiStore.resourceReservations.values(),
    ).filter(
      (r) =>
        r.organizationId === organizationId &&
        r.status === "ACTIVE" &&
        r.expiresAt.getTime() > now.getTime(),
    ).length;

    const totalActive = runningCount + activeReservations;

    if (
      quota.maxConcurrentExecutions !== -1 &&
      totalActive >= quota.maxConcurrentExecutions
    ) {
      if (quota.enforcementAction === "REJECT") {
        return {
          allowed: false,
          outcome: "CONCURRENT_EXECUTION_LIMIT_EXCEEDED",
          statusCode: 429,
          retryAfterSeconds: 15,
          reason: `Concurrent execution limit reached (${totalActive}/${quota.maxConcurrentExecutions}).`,
          metric: "concurrent_executions",
          limit: quota.maxConcurrentExecutions,
          currentUsage: totalActive,
        };
      }
    }

    // 7. Cost Budget Ceiling Check
    const budgetStatus = this.getCostBudgetStatus(organizationId);
    if (budgetStatus.budgetExceeded && quota.enforcementAction === "REJECT") {
      return {
        allowed: false,
        outcome: "REJECTED_BUDGET",
        statusCode: 402,
        reason: `Monthly spend budget of $${quota.monthlyBudgetDollars.toFixed(2)} has been exceeded.`,
        metric: "monthly_budget",
        limit: quota.monthlyBudgetDollars,
        currentUsage: budgetStatus.estimatedMonthlySpendDollars,
      };
    }

    // 8. Atomic Admission & Creation
    const executionId = `exec_${crypto.randomUUID()}`;
    const reservationId = `res_${crypto.randomUUID()}`;

    // Create reservation record
    const reservation: ResourceReservationRecord = {
      id: reservationId,
      organizationId,
      workspaceId: workspaceId || null,
      workflowId,
      executionId,
      reservedAt: now,
      expiresAt: new Date(now.getTime() + this.reservationTtlMs),
      status: "ACTIVE",
    };
    apiStore.resourceReservations.set(reservationId, reservation);

    // Create durable execution record
    const execution: WorkflowExecutionRecord = {
      id: executionId,
      organizationId,
      workflowId,
      workflowVersionId,
      environment,
      triggerType,
      triggerPayload,
      idempotencyKey,
      status: "QUEUED",
      contextData: {
        trigger: { payload: triggerPayload, type: triggerType },
        userId,
        reservationId,
        admittedAt: now.toISOString(),
      },
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.executions.set(executionId, execution);

    // Record usage with idempotency key
    entitlementService.recordUsage({
      organizationId,
      metric: "WORKFLOW_EXECUTION",
      quantity: 1,
      idempotencyKey: execution.id,
      metadata: { workflowId, environment },
    });

    apiStore.recordAudit?.({
      organizationId,
      userId,
      action: "QUOTA_ADMISSION_ACCEPTED",
      resourceType: "EXECUTION",
      resourceId: executionId,
      metadata: {
        workflowId,
        reservationId,
        queueDepth: currentQueued + 1,
      },
    });

    return {
      allowed: true,
      outcome: "ACCEPTED",
      statusCode: 202,
      reason: "Execution admitted and queued successfully.",
      reservationId,
      execution,
    };
  }

  /**
   * Releases an execution's concurrency reservation upon termination.
   */
  public releaseExecution(
    executionId: string,
    organizationId: string,
    finalStatus: "SUCCEEDED" | "FAILED" | "CANCELLED",
  ): void {
    const reservation = Array.from(apiStore.resourceReservations.values()).find(
      (r) => r.executionId === executionId && r.status === "ACTIVE",
    );

    if (reservation) {
      reservation.status = "RELEASED";
      reservation.releasedAt = new Date();
      apiStore.resourceReservations.set(reservation.id, reservation);
    }

    apiStore.recordAudit?.({
      organizationId,
      action: "RESOURCE_CAPACITY_RELEASED",
      resourceType: "EXECUTION",
      resourceId: executionId,
      metadata: { executionId, finalStatus },
    });
  }

  /**
   * Returns current resource utilization and queue metrics for an organization.
   */
  public getUtilization(organizationId: string): ResourceUtilizationSummary {
    const plan = entitlementService.getEffectivePlan(organizationId);
    const quota = this.getEffectiveQuota(organizationId);

    const { periodStart, periodEnd } =
      entitlementService.getCurrentBillingPeriod(organizationId);
    const monthlyExecutionsCount = Array.from(apiStore.usageRecords.values())
      .filter(
        (u) =>
          u.organizationId === organizationId &&
          u.metric === "WORKFLOW_EXECUTION" &&
          u.recordedAt >= periodStart &&
          u.recordedAt <= periodEnd,
      )
      .reduce((sum, u) => sum + u.quantity, 0);

    const activeConcurrent = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "RUNNING",
    ).length;

    const queuedCount = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "QUEUED",
    ).length;

    const monthlyPct =
      quota.maxMonthlyExecutions > 0
        ? Math.round(
            (monthlyExecutionsCount / quota.maxMonthlyExecutions) * 100,
          )
        : 0;

    const concurrentPct =
      quota.maxConcurrentExecutions > 0
        ? Math.round((activeConcurrent / quota.maxConcurrentExecutions) * 100)
        : 0;

    const queuePct =
      quota.maxQueueDepth > 0
        ? Math.round((queuedCount / quota.maxQueueDepth) * 100)
        : 0;

    let health: ResourceUtilizationSummary["health"] = "HEALTHY";
    if (queuePct >= 90 || concurrentPct >= 100 || monthlyPct >= 100) {
      health = "CRITICAL";
    } else if (queuePct >= 70 || concurrentPct >= 80) {
      health = "CONGESTED";
    } else if (monthlyPct >= 80) {
      health = "APPROACHING_LIMIT";
    }

    return {
      organizationId,
      planName: plan.name,
      monthlyExecutions: {
        current: monthlyExecutionsCount,
        limit: quota.maxMonthlyExecutions,
        percentage: monthlyPct,
      },
      concurrentExecutions: {
        active: activeConcurrent,
        limit: quota.maxConcurrentExecutions,
        percentage: concurrentPct,
      },
      queueDepth: {
        queued: queuedCount,
        limit: quota.maxQueueDepth,
        percentage: queuePct,
      },
      budgets: {
        maxDurationMs: quota.maxExecutionDurationMs,
        maxStepCount: quota.maxStepCount,
        maxConnectorCalls: quota.maxConnectorCallsPerRun,
        monthlyBudgetDollars: quota.monthlyBudgetDollars,
      },
      fairShareWeight: quota.fairShareWeight,
      health,
    };
  }

  /**
   * Calculates monthly cost budget status, threshold alert state, and estimated spend.
   */
  public getCostBudgetStatus(organizationId: string): CostBudgetStatus {
    const quota = this.getEffectiveQuota(organizationId);
    const { periodStart, periodEnd } =
      entitlementService.getCurrentBillingPeriod(organizationId);

    // Count executions and connector steps for the period
    const execs = Array.from(apiStore.executions.values()).filter((e) => {
      if (e.organizationId !== organizationId) return false;
      const createdAt = new Date(e.createdAt);
      return createdAt >= periodStart && createdAt <= periodEnd;
    });

    const executionCost = execs.length * 0.01; // $0.01 per run estimated compute
    const stepsCount = Array.from(apiStore.steps.values()).filter((s) => {
      const parent = apiStore.executions.get(s.executionId);
      return parent && parent.organizationId === organizationId;
    }).length;
    const stepCost = stepsCount * 0.002;

    const usageCost = Array.from(apiStore.usageRecords.values())
      .filter((u) => u.organizationId === organizationId)
      .reduce((sum, u) => sum + u.quantity * 0.01, 0);

    const estimatedMonthlySpendDollars =
      Math.round(Math.max(executionCost + stepCost, usageCost) * 100) / 100;
    const monthlyBudgetDollars = quota.monthlyBudgetDollars || 500.0;
    const utilizationPercent =
      monthlyBudgetDollars > 0
        ? Math.round(
            (estimatedMonthlySpendDollars / monthlyBudgetDollars) * 100,
          )
        : 0;

    const alertThresholdPercent = quota.budgetAlertThresholdPercent || 80.0;
    const alertTriggered = utilizationPercent >= alertThresholdPercent;
    const budgetExceeded = utilizationPercent >= 100;

    return {
      organizationId,
      monthlyBudgetDollars,
      estimatedMonthlySpendDollars,
      utilizationPercent,
      alertThresholdPercent,
      alertTriggered,
      budgetExceeded,
      currency: "USD",
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Reconciles expired reservations and stale executions to prevent resource leaks.
   */
  public reconcileResourceState(): {
    expiredReservationsCount: number;
    reconciledExecutionsCount: number;
    expiredReservationsCleared?: number;
    staleExecutionsRecovered?: number;
  } {
    const now = new Date();
    let expiredReservationsCount = 0;
    let reconciledExecutionsCount = 0;

    // 1. Clean up expired reservations
    for (const [id, res] of apiStore.resourceReservations.entries()) {
      if (res.status === "ACTIVE" && res.expiresAt.getTime() <= now.getTime()) {
        res.status = "EXPIRED";
        apiStore.resourceReservations.set(id, res);
        expiredReservationsCount++;
      }
    }

    // 2. Clear stale RUNNING executions older than 30 minutes without active lease
    for (const [id, exec] of apiStore.executions.entries()) {
      if (exec.status === "RUNNING") {
        const lease = apiStore.executionLeases?.get(id);
        const isLeaseExpired =
          !lease || lease.expiresAt.getTime() <= now.getTime();
        const isStartedOld =
          exec.startedAt &&
          now.getTime() - new Date(exec.startedAt).getTime() > 30 * 60 * 1000;

        if (isLeaseExpired && isStartedOld) {
          exec.status = "FAILED";
          exec.completedAt = now;
          exec.errorDetails = {
            message:
              "Execution lease expired and was marked failed during resource reconciliation.",
          };
          apiStore.executions.set(id, exec);
          this.releaseExecution(id, exec.organizationId, "FAILED");
          reconciledExecutionsCount++;
        }
      }
    }

    return {
      expiredReservationsCount,
      reconciledExecutionsCount,
      expiredReservationsCleared: expiredReservationsCount,
      staleExecutionsRecovered: reconciledExecutionsCount,
    };
  }
}

export const resourceGovernanceService = new ResourceGovernanceService();
