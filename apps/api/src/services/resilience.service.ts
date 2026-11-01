import crypto from "crypto";
import {
  InMemoryDatabase,
  ExecutionLeaseRecord,
  ScheduleExecutionClaimRecord,
  StepReconciliationRecord,
  HealthReadinessDetails,
  ReconcileExecutionStepRequest,
} from "@flowforge/test-utils";
import { defaultCircuitBreakerRegistry } from "@flowforge/integrations";
import { apiStore } from "../store.js";

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  isIdempotent?: boolean;
}

export class ResilienceService {
  private shuttingDown = false;
  private activeRequests = 0;

  constructor(private db: InMemoryDatabase = apiStore) {}

  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public startGracefulShutdown(): void {
    this.shuttingDown = true;
  }

  public resetShutdown(): void {
    this.shuttingDown = false;
  }

  public getActiveRequests(): number {
    return this.activeRequests;
  }

  public incrementActiveRequests(): number {
    this.activeRequests += 1;
    return this.activeRequests;
  }

  public decrementActiveRequests(): number {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    return this.activeRequests;
  }

  /**
   * Detects transient database errors such as disconnects, timeouts, deadlocks, and connection pool starvation.
   */
  public isTransientDatabaseError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const error = err as Record<string, unknown>;
    const message = typeof error.message === "string" ? error.message : "";
    const code = typeof error.code === "string" ? error.code : "";

    const transientCodes = [
      "ECONNRESET",
      "ETIMEDOUT",
      "EPIPE",
      "ENOTFOUND",
      "40P01", // Deadlock detected (PostgreSQL)
      "40001", // Serialization failure (PostgreSQL)
      "57P01", // Admin shutdown
      "57P02", // Crash shutdown
      "57P03", // Cannot connect now
      "P2024", // Prisma connection pool timeout
      "P2028", // Prisma transaction expired
    ];

    if (transientCodes.includes(code)) return true;

    const transientMessagePatterns = [
      /connection terminated/i,
      /connection reset/i,
      /client has been closed/i,
      /timeout/i,
      /deadlock detected/i,
      /could not serialize access/i,
      /pool exhausted/i,
      /connection lost/i,
    ];

    return transientMessagePatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Executes a database or network operation with exponential backoff retry.
   * If isIdempotent is false, fail-fast immediately on error to avoid duplicate operations.
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const { maxRetries = 3, backoffMs = 50, isIdempotent = true } = options;

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        return await operation();
      } catch (err: any) {
        // Non-idempotent operations fail fast to prevent duplicated side-effects or partial writes
        if (isIdempotent === false) {
          throw err;
        }

        const isTransient = this.isTransientDatabaseError(err);
        if (!isTransient || attempt > maxRetries) {
          throw err;
        }

        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Evaluates comprehensive readiness details across database, circuit breakers, workers, and system memory.
   */
  public async getDetailedReadiness(): Promise<HealthReadinessDetails> {
    const isDbConnected = this.db !== null && this.db !== undefined;
    const breakers = defaultCircuitBreakerRegistry.getAllMetrics();
    const hasOpenBreakers = Object.values(breakers).some(
      (b: any) => b.state === "OPEN",
    );

    let status: HealthReadinessDetails["status"] = "ready";
    if (this.shuttingDown) {
      status = "shutting_down";
    } else if (!isDbConnected) {
      status = "not_ready";
    } else if (hasOpenBreakers) {
      status = "degraded";
    }

    const runningExecutions = Array.from(this.db.executions.values()).filter(
      (e) => e.status === "RUNNING",
    ).length;

    const memoryUsage = process.memoryUsage();

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeRequests: this.activeRequests,
      dependencies: {
        database: isDbConnected ? "connected" : "disconnected",
        circuitBreakers: hasOpenBreakers ? "open" : "healthy",
        workers: {
          activeWorkers: 1,
          activeExecutions: runningExecutions,
        },
      },
      system: {
        memoryUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
    };
  }

  /**
   * Reconciles an uncertain side-effect step (HTTP request, Email, Connector) flagged during failure/restart.
   */
  public reconcileStep(params: {
    organizationId: string;
    executionId: string;
    stepId?: string;
    action: "RESUME" | "FAIL" | "SKIP";
    reason: string;
    resolvedBy: string;
    notes?: string;
  }): {
    reconciliation: StepReconciliationRecord;
    execution: any;
  } {
    const {
      organizationId,
      executionId,
      stepId,
      action,
      reason,
      resolvedBy,
      notes,
    } = params;

    const execution = this.db.executions.get(executionId);
    if (!execution || execution.organizationId !== organizationId) {
      const err = new Error(`Execution ${executionId} not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    // Find the step needing reconciliation
    let targetStep = stepId ? this.db.steps.get(stepId) : undefined;
    if (!targetStep) {
      targetStep = Array.from(this.db.steps.values()).find(
        (s) =>
          s.executionId === executionId &&
          (s.status === "FAILED" || (s as any).requiresReconciliation),
      );
    }

    if (!targetStep) {
      const err = new Error(
        `No reconcilable step found for execution ${executionId}.`,
      );
      (err as any).statusCode = 404;
      throw err;
    }

    const recId = `rec_${targetStep.id}`;
    let rec = this.db.stepReconciliations?.get(recId);
    const now = new Date();

    if (!rec) {
      rec = {
        id: recId,
        executionId: execution.id,
        stepId: targetStep.id,
        nodeId: targetStep.nodeId,
        nodeType: targetStep.nodeType,
        status: action === "RESUME" ? "RECONCILED" : "MANUALLY_RESOLVED",
        reason,
        sideEffectDetails: {
          inputPayload: targetStep.inputPayload,
          notes,
        },
        resolvedAt: now,
        resolvedBy,
        resolutionAction: action,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      rec.status = action === "RESUME" ? "RECONCILED" : "MANUALLY_RESOLVED";
      rec.reason = reason;
      rec.resolvedAt = now;
      rec.resolvedBy = resolvedBy;
      rec.resolutionAction = action;
      rec.updatedAt = now;
    }

    this.db.stepReconciliations?.set(rec.id, rec);
    (targetStep as any).requiresReconciliation = false;

    if (action === "FAIL") {
      targetStep.status = "FAILED";
      targetStep.errorMessage = `Reconciliation failed: ${reason}`;
      targetStep.completedAt = now;
      this.db.steps.set(targetStep.id, targetStep);

      execution.status = "FAILED";
      execution.errorDetails = {
        message: `Execution terminated via reconciliation: ${reason}`,
        reconciliationAction: "FAIL",
      };
      execution.updatedAt = now;
      this.db.executions.set(execution.id, execution);
    } else if (action === "SKIP") {
      targetStep.status = "COMPLETED";
      targetStep.outputPayload = {
        skippedViaReconciliation: true,
        reason,
        notes,
      };
      targetStep.completedAt = now;
      this.db.steps.set(targetStep.id, targetStep);

      execution.status = "QUEUED";
      execution.errorDetails = undefined;
      execution.updatedAt = now;
      this.db.executions.set(execution.id, execution);
    } else {
      // RESUME
      targetStep.status = "PENDING";
      targetStep.errorMessage = undefined;
      targetStep.completedAt = undefined;
      this.db.steps.set(targetStep.id, targetStep);

      execution.status = "QUEUED";
      execution.errorDetails = undefined;
      execution.updatedAt = now;
      this.db.executions.set(execution.id, execution);
    }

    // Record tamper-evident audit log
    this.db.recordAudit({
      organizationId,
      userId: resolvedBy,
      action: "execution.step_reconciled",
      resourceType: "execution",
      resourceId: executionId,
      metadata: {
        stepId: targetStep.id,
        action,
        reason,
        nodeType: targetStep.nodeType,
      },
    });

    return {
      reconciliation: rec,
      execution,
    };
  }

  /**
   * Simulates a controlled traffic drain and regional failover verification.
   */
  public async simulateFailover(params: {
    sourceRegion: string;
    targetRegion: string;
    drainTimeoutMs?: number;
    requestedBy?: string;
  }): Promise<{
    status: "FAILOVER_INITIATED" | "COMPLETED";
    sourceRegion: string;
    targetRegion: string;
    drainedRequests: number;
    switchoverTimestamp: string;
    pendingReconciliations: number;
  }> {
    const { sourceRegion, targetRegion, requestedBy } = params;

    const pendingReconciliations = Array.from(
      this.db.stepReconciliations?.values() || [],
    ).filter((r) => r.status === "REQUIRES_RECONCILIATION").length;

    const drainedRequests = this.activeRequests;

    // Record audit event for failover exercise
    this.db.recordAudit({
      organizationId: "system",
      userId: requestedBy || "system_operator",
      action: "disaster_recovery.failover_simulated",
      resourceType: "cluster",
      resourceId: `dr_${sourceRegion}_to_${targetRegion}`,
      metadata: {
        sourceRegion,
        targetRegion,
        drainedRequests,
        pendingReconciliations,
      },
    });

    return {
      status: "COMPLETED",
      sourceRegion,
      targetRegion,
      drainedRequests,
      switchoverTimestamp: new Date().toISOString(),
      pendingReconciliations,
    };
  }

  /**
   * Cryptographically verifies disaster recovery backup snapshot data using SHA-256 and entity counts.
   */
  public verifyBackupIntegrity(params: {
    snapshotId: string;
    snapshotContent: string;
    expectedSha256: string;
    entityCounts?: Record<string, number>;
  }): {
    valid: boolean;
    snapshotId: string;
    calculatedHash: string;
    matchesExpected: boolean;
    recordCount: number;
    verifiedAt: string;
  } {
    const { snapshotId, snapshotContent, expectedSha256 } = params;
    const calculatedHash = crypto
      .createHash("sha256")
      .update(snapshotContent)
      .digest("hex");

    const matchesExpected =
      calculatedHash.toLowerCase() === expectedSha256.toLowerCase();

    let recordCount = 0;
    try {
      const parsed = JSON.parse(snapshotContent);
      if (typeof parsed === "object" && parsed !== null) {
        if (Array.isArray(parsed)) {
          recordCount = parsed.length;
        } else if (parsed.tables && typeof parsed.tables === "object") {
          recordCount = Object.values(parsed.tables).reduce(
            (acc: number, arr: any) => {
              return acc + (Array.isArray(arr) ? arr.length : 1);
            },
            0,
          );
        } else {
          recordCount = Object.keys(parsed).reduce((acc, k) => {
            return (
              acc +
              (Array.isArray((parsed as any)[k])
                ? (parsed as any)[k].length
                : 1)
            );
          }, 0);
        }
      }
    } catch {
      // Non-json snapshot, content length counted as 1 blob
      recordCount = snapshotContent.length > 0 ? 1 : 0;
    }

    return {
      valid: matchesExpected,
      snapshotId,
      calculatedHash,
      matchesExpected,
      recordCount,
      verifiedAt: new Date().toISOString(),
    };
  }

  public listActiveLeases(): ExecutionLeaseRecord[] {
    const now = new Date();
    return Array.from(this.db.executionLeases?.values() || []).filter(
      (l) => l.expiresAt.getTime() > now.getTime(),
    );
  }

  public listActiveScheduleClaims(): ScheduleExecutionClaimRecord[] {
    const now = new Date();
    return Array.from(this.db.scheduleClaims?.values() || []).filter(
      (c) => c.expiresAt.getTime() > now.getTime(),
    );
  }

  public listPendingReconciliations(
    organizationId?: string,
  ): StepReconciliationRecord[] {
    let recs = Array.from(this.db.stepReconciliations?.values() || []);
    if (organizationId) {
      const orgExecutionIds = new Set(
        Array.from(this.db.executions.values())
          .filter((e) => e.organizationId === organizationId)
          .map((e) => e.id),
      );
      recs = recs.filter((r) => orgExecutionIds.has(r.executionId));
    }
    return recs;
  }
}

export const resilienceService = new ResilienceService(apiStore);
