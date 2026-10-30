import { Router } from "express";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { canTransition } from "@flowforge/workflow-engine";
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
  const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 20));

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

  res.json({
    success: true,
    data: {
      ...execution,
      workflowName: workflow?.name,
      steps,
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
        (a, b) =>
          (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0),
      );

    res.json({
      success: true,
      data: steps,
      error: null,
      meta: { total: steps.length },
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
