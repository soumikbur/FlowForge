import { Router } from "express";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { canTransition, deepScrubSecrets } from "@flowforge/workflow-engine";
import { RetryExecutionSchema } from "@flowforge/shared";
import { publishDomainEvent } from "../services/event-delivery.service.js";

export const executionRouter = Router();

executionRouter.use(requireAuth);

// ==========================================
// 1. List executions for organization (Filterable & Paginated)
// ==========================================
executionRouter.get("/", requirePermission("workflow:read"), (req, res) => {
  const orgId = req.organizationId!;
  const { status, workflowId, page = "1", pageSize = "20" } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const sizeNum = Math.min(
    100,
    Math.max(1, parseInt(pageSize as string, 10) || 20),
  );

  let executions = Array.from(apiStore.executions.values()).filter(
    (e) => e.organizationId === orgId,
  );

  if (status && typeof status === "string") {
    executions = executions.filter((e) => e.status === status);
  }
  if (workflowId && typeof workflowId === "string") {
    executions = executions.filter((e) => e.workflowId === workflowId);
  }

  // Sort descending by creation date
  executions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = executions.length;
  const startIndex = (pageNum - 1) * sizeNum;
  const paginated = executions.slice(startIndex, startIndex + sizeNum);

  // Attach workflow names
  const enriched = paginated.map((e) => {
    const wf = apiStore.workflows.get(e.workflowId);
    return {
      ...e,
      triggerPayload: deepScrubSecrets(e.triggerPayload) as Record<
        string,
        unknown
      >,
      contextData: deepScrubSecrets(e.contextData) as Record<string, unknown>,
      workflowName: wf?.name,
    };
  });

  res.json({
    success: true,
    data: enriched,
    error: null,
    meta: {
      page: pageNum,
      pageSize: sizeNum,
      total,
    },
  });
});

// ==========================================
// 2. Get single execution with step timeline & approvals
// ==========================================
executionRouter.get("/:id", requirePermission("workflow:read"), (req, res) => {
  const execution = apiStore.executions.get(req.params.id);
  if (!execution || execution.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Execution not found." },
    });
    return;
  }

  const steps = Array.from(apiStore.steps.values())
    .filter((s) => s.executionId === execution.id)
    .sort(
      (a, b) => (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0),
    );

  const approvals = Array.from(apiStore.approvals.values()).filter(
    (a) => a.executionId === execution.id,
  );

  const workflow = apiStore.workflows.get(execution.workflowId);

  const sanitizedExecution = {
    ...execution,
    triggerPayload: deepScrubSecrets(execution.triggerPayload) as Record<
      string,
      unknown
    >,
    contextData: deepScrubSecrets(execution.contextData) as Record<
      string,
      unknown
    >,
  };

  const sanitizedSteps = steps.map((s) => ({
    ...s,
    inputPayload: s.inputPayload
      ? (deepScrubSecrets(s.inputPayload) as Record<string, unknown>)
      : undefined,
    outputPayload: s.outputPayload
      ? (deepScrubSecrets(s.outputPayload) as Record<string, unknown>)
      : undefined,
  }));

  res.json({
    success: true,
    data: {
      ...sanitizedExecution,
      workflowName: workflow?.name,
      steps: sanitizedSteps,
      approvals,
    },
    error: null,
  });
});

// ==========================================
// 3. List execution steps for a specific execution
// ==========================================
executionRouter.get(
  "/:id/steps",
  requirePermission("workflow:read"),
  (req, res) => {
    const execution = apiStore.executions.get(req.params.id);
    if (!execution || execution.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Execution not found." },
      });
      return;
    }

    const steps = Array.from(apiStore.steps.values())
      .filter((s) => s.executionId === execution.id)
      .sort(
        (a, b) => (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0),
      );

    const sanitizedSteps = steps.map((s) => ({
      ...s,
      inputPayload: s.inputPayload
        ? (deepScrubSecrets(s.inputPayload) as Record<string, unknown>)
        : undefined,
      outputPayload: s.outputPayload
        ? (deepScrubSecrets(s.outputPayload) as Record<string, unknown>)
        : undefined,
    }));

    res.json({
      success: true,
      data: sanitizedSteps,
      error: null,
      meta: { total: sanitizedSteps.length },
    });
  },
);

// ==========================================
// 4. Cancel active or waiting execution
// ==========================================
executionRouter.post(
  "/:id/cancel",
  requirePermission("workflow:execute"),
  (req, res) => {
    const execution = apiStore.executions.get(req.params.id);
    if (!execution || execution.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Execution not found." },
      });
      return;
    }

    if (!canTransition(execution.status, "CANCELLED")) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot cancel execution in state '${execution.status}'.`,
        },
      });
      return;
    }

    const now = new Date();
    const reason =
      (req.body?.reason as string) || "Execution cancelled by user";
    execution.status = "CANCELLED";
    execution.completedAt = now;
    execution.updatedAt = now;
    execution.errorDetails = {
      cancellationReason: reason,
      message: reason,
    };
    apiStore.executions.set(execution.id, execution);

    // Cancel in-flight or waiting steps
    for (const step of apiStore.steps.values()) {
      if (
        step.executionId === execution.id &&
        (step.status === "RUNNING" || step.status === "WAITING")
      ) {
        step.status = "SKIPPED";
        step.errorMessage = "Execution was cancelled";
        step.completedAt = now;
        apiStore.steps.set(step.id, step);
      }
    }

    // Cancel pending delays
    for (const delay of apiStore.delays.values()) {
      if (delay.executionId === execution.id && delay.status === "PENDING") {
        delay.status = "CANCELLED";
        apiStore.delays.set(delay.id, delay);
      }
    }

    // Invalidate/reject pending approvals linked to cancelled execution
    for (const approval of apiStore.approvals.values()) {
      if (
        approval.executionId === execution.id &&
        approval.status === "PENDING"
      ) {
        approval.status = "REJECTED";
        approval.decisionComment = "Execution was cancelled";
        approval.decidedAt = now;
        apiStore.approvals.set(approval.id, approval);
      }
    }

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "execution.cancelled",
      resourceType: "execution",
      resourceId: execution.id,
      metadata: { reason },
      ipAddress: req.ip,
    });

    publishDomainEvent(apiStore, {
      type: "workflow.execution.cancelled",
      organizationId: req.organizationId!,
      resourceType: "execution",
      resourceId: execution.id,
      actorId: req.user?.id,
      data: {
        workflowId: execution.workflowId,
        executionId: execution.id,
        reason,
      },
    });

    res.json({
      success: true,
      data: execution,
      error: null,
    });
  },
);

// ==========================================
// 5. Retry failed execution or specific failed step
// ==========================================
executionRouter.post(
  "/:id/retry",
  requirePermission("workflow:execute"),
  (req, res) => {
    const execution = apiStore.executions.get(req.params.id);
    if (!execution || execution.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Execution not found." },
      });
      return;
    }

    if (execution.status !== "FAILED") {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_STATE",
          message: `Cannot retry execution in state '${execution.status}'. Only FAILED executions can be retried.`,
        },
      });
      return;
    }

    const parseResult = RetryExecutionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid retry payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { stepId, reason } = parseResult.data;
    const now = new Date();
    let targetNodeId = execution.currentNodeId;

    if (stepId) {
      const step = apiStore.steps.get(stepId);
      if (!step || step.executionId !== execution.id) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Step '${stepId}' not found for execution.`,
          },
        });
        return;
      }
      targetNodeId = step.nodeId;
      step.status = "PENDING";
      step.errorMessage = undefined;
      step.attempt = (step.attempt || 1) + 1;
      apiStore.steps.set(step.id, step);
    } else {
      // Find the step that failed
      const failedStep = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execution.id && s.status === "FAILED",
      );
      if (failedStep) {
        targetNodeId = failedStep.nodeId;
        failedStep.status = "PENDING";
        failedStep.errorMessage = undefined;
        failedStep.attempt = (failedStep.attempt || 1) + 1;
        apiStore.steps.set(failedStep.id, failedStep);
      }
    }

    execution.currentNodeId = targetNodeId;
    execution.status = "QUEUED";
    execution.completedAt = undefined;
    execution.errorDetails = undefined;
    execution.retryCount = (execution.retryCount || 0) + 1;
    execution.updatedAt = now;
    apiStore.executions.set(execution.id, execution);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "execution.retried",
      resourceType: "execution",
      resourceId: execution.id,
      metadata: {
        stepId,
        targetNodeId,
        reason: reason || "User initiated retry",
        retryCount: execution.retryCount,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: execution,
      error: null,
    });
  },
);

// ==========================================
// 6. Get execution lifecycle event stream (Prompt 20 Observability)
// ==========================================
executionRouter.get(
  "/:id/events",
  requirePermission("workflow:read"),
  (req, res) => {
    const execution = apiStore.executions.get(req.params.id);
    if (!execution || execution.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Execution not found." },
      });
      return;
    }

    interface ExecutionLifecycleEvent {
      id: string;
      executionId: string;
      workflowId: string;
      eventType: string;
      timestamp: Date;
      nodeId?: string;
      nodeType?: string;
      nodeName?: string;
      durationMs?: number;
      details?: Record<string, unknown>;
    }

    const events: ExecutionLifecycleEvent[] = [];

    // 1. EXECUTION_ACCEPTED
    events.push({
      id: `evt_accepted_${execution.id}`,
      executionId: execution.id,
      workflowId: execution.workflowId,
      eventType: "EXECUTION_ACCEPTED",
      timestamp: execution.createdAt,
      details: {
        triggerType: execution.triggerType,
        environment: execution.environment,
      },
    });

    // 2. EXECUTION_STARTED
    if (execution.startedAt) {
      events.push({
        id: `evt_started_${execution.id}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "EXECUTION_STARTED",
        timestamp: execution.startedAt,
      });
    }

    // 3. Step events
    const steps = Array.from(apiStore.steps.values())
      .filter((s) => s.executionId === execution.id)
      .sort(
        (a, b) => (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0),
      );

    for (const step of steps) {
      if (step.startedAt) {
        events.push({
          id: `evt_node_started_${step.id}`,
          executionId: execution.id,
          workflowId: execution.workflowId,
          eventType: "NODE_STARTED",
          timestamp: step.startedAt,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          nodeName: step.nodeName,
          details: { attempt: step.attempt },
        });
      }

      if (step.status === "COMPLETED" && step.completedAt) {
        const durationMs = step.startedAt
          ? step.completedAt.getTime() - step.startedAt.getTime()
          : undefined;

        events.push({
          id: `evt_node_completed_${step.id}`,
          executionId: execution.id,
          workflowId: execution.workflowId,
          eventType: "NODE_COMPLETED",
          timestamp: step.completedAt,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          nodeName: step.nodeName,
          durationMs,
        });

        if (step.nodeType === "CONDITION") {
          events.push({
            id: `evt_cond_${step.id}`,
            executionId: execution.id,
            workflowId: execution.workflowId,
            eventType: "CONDITION_EVALUATED",
            timestamp: step.completedAt,
            nodeId: step.nodeId,
            nodeType: step.nodeType,
            details: step.outputPayload,
          });
        }
      } else if (step.status === "FAILED" && step.completedAt) {
        events.push({
          id: `evt_node_failed_${step.id}`,
          executionId: execution.id,
          workflowId: execution.workflowId,
          eventType: "NODE_FAILED",
          timestamp: step.completedAt,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          nodeName: step.nodeName,
          details: { errorMessage: step.errorMessage },
        });
      }
    }

    // 4. Approval events
    const approvals = Array.from(apiStore.approvals.values()).filter(
      (a) => a.executionId === execution.id,
    );
    for (const apprv of approvals) {
      events.push({
        id: `evt_apprv_req_${apprv.id}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "APPROVAL_REQUESTED",
        timestamp: apprv.createdAt,
        details: { requiredRole: apprv.requiredRole, title: apprv.title },
      });

      if (apprv.status !== "PENDING" && apprv.decidedAt) {
        events.push({
          id: `evt_apprv_res_${apprv.id}`,
          executionId: execution.id,
          workflowId: execution.workflowId,
          eventType: "APPROVAL_RESOLVED",
          timestamp: apprv.decidedAt,
          details: {
            decision: apprv.status,
            comment: apprv.decisionComment,
          },
        });
      }
    }

    // 5. Terminal & Retry events
    if (execution.retryCount > 0) {
      events.push({
        id: `evt_retry_${execution.id}_${execution.retryCount}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "RETRY_SCHEDULED",
        timestamp: execution.updatedAt,
        details: { retryCount: execution.retryCount },
      });
    }

    if (execution.status === "CANCELLED" && execution.completedAt) {
      events.push({
        id: `evt_cancel_${execution.id}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "EXECUTION_CANCELLED",
        timestamp: execution.completedAt,
        details: execution.errorDetails as Record<string, unknown>,
      });
    } else if (execution.status === "SUCCEEDED" && execution.completedAt) {
      const durationMs = execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined;

      events.push({
        id: `evt_succeeded_${execution.id}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "EXECUTION_COMPLETED",
        timestamp: execution.completedAt,
        durationMs,
      });
    } else if (execution.status === "FAILED" && execution.completedAt) {
      events.push({
        id: `evt_failed_${execution.id}`,
        executionId: execution.id,
        workflowId: execution.workflowId,
        eventType: "EXECUTION_FAILED",
        timestamp: execution.completedAt,
        details: execution.errorDetails as Record<string, unknown>,
      });
    }

    // Sort chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    res.json({
      success: true,
      data: events,
      meta: { total: events.length },
      error: null,
    });
  },
);

// ==========================================
// 7. Safe operator-initiated recovery (Prompt 20 Self-Healing)
// ==========================================
executionRouter.post(
  "/:id/recover",
  requirePermission("workflow:execute"),
  (req, res) => {
    const execution = apiStore.executions.get(req.params.id);
    if (!execution || execution.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Execution not found." },
      });
      return;
    }

    const action = req.body?.action || "RECONCILE_FAILED"; // "RECONCILE_FAILED" | "RETRY_SAFE" | "SKIP_STEP"
    const confirmAmbiguousSideEffect = Boolean(
      req.body?.confirmAmbiguousSideEffect,
    );
    const reason = req.body?.reason || "Operator initiated recovery";
    const now = new Date();

    if (action === "RETRY_SAFE") {
      // Find the step that failed
      const failedStep = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execution.id && s.status === "FAILED",
      );

      if (failedStep) {
        // Ambiguous external side effect guard:
        // If HTTP/external step timed out without an idempotency key, we cannot safely re-execute it automatically
        const isExternalStep = [
          "HTTP_REQUEST",
          "CONNECTOR_ACTION",
          "EMAIL",
        ].includes(failedStep.nodeType);
        const headers = failedStep.inputPayload?.headers as
          Record<string, string> | undefined;
        const hasIdempotencyKey = Boolean(
          failedStep.inputPayload?.idempotencyKey ||
          headers?.["Idempotency-Key"],
        );

        if (
          isExternalStep &&
          !hasIdempotencyKey &&
          !confirmAmbiguousSideEffect
        ) {
          res.status(400).json({
            success: false,
            data: null,
            error: {
              code: "AMBIGUOUS_SIDE_EFFECT_CONFIRMATION_REQUIRED",
              message: `Step '${failedStep.nodeName || failedStep.nodeType}' may have been processed by the external service without an idempotency key. Explicit confirmation (confirmAmbiguousSideEffect: true) is required to prevent duplicate operations.`,
            },
          });
          return;
        }

        failedStep.status = "PENDING";
        failedStep.errorMessage = undefined;
        failedStep.attempt = (failedStep.attempt || 1) + 1;
        apiStore.steps.set(failedStep.id, failedStep);
      }

      execution.status = "QUEUED";
      execution.completedAt = undefined;
      execution.errorDetails = undefined;
      execution.retryCount = (execution.retryCount || 0) + 1;
      execution.updatedAt = now;
      apiStore.executions.set(execution.id, execution);
    } else if (action === "SKIP_STEP") {
      const failedStep = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execution.id && s.status === "FAILED",
      );
      if (failedStep) {
        failedStep.status = "SKIPPED";
        failedStep.errorMessage = `Step skipped during operator recovery: ${reason}`;
        failedStep.completedAt = now;
        apiStore.steps.set(failedStep.id, failedStep);
      }
      execution.status = "QUEUED";
      execution.completedAt = undefined;
      execution.updatedAt = now;
      apiStore.executions.set(execution.id, execution);
    } else {
      // Default: RECONCILE_FAILED
      // Safely reconciles any stranded in-flight RUNNING steps and marks execution as FAILED
      for (const step of apiStore.steps.values()) {
        if (step.executionId === execution.id && step.status === "RUNNING") {
          step.status = "FAILED";
          step.errorMessage = `Interrupted execution recovered as FAILED: ${reason}`;
          step.completedAt = now;
          apiStore.steps.set(step.id, step);
        }
      }

      execution.status = "FAILED";
      execution.completedAt = now;
      execution.updatedAt = now;
      execution.errorDetails = {
        recovered: true,
        recoveryAction: action,
        recoveryReason: reason,
      };
      apiStore.executions.set(execution.id, execution);
    }

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "execution.recovered",
      resourceType: "execution",
      resourceId: execution.id,
      metadata: { action, reason, confirmAmbiguousSideEffect },
      ipAddress: req.ip,
    });

    publishDomainEvent(apiStore, {
      type: "workflow.execution.recovered",
      organizationId: req.organizationId!,
      resourceType: "execution",
      resourceId: execution.id,
      actorId: req.user?.id,
      data: { executionId: execution.id, action, reason },
    });

    res.json({
      success: true,
      data: execution,
      error: null,
    });
  },
);
