import { Router } from "express";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { canTransition } from "@flowforge/workflow-engine";

export const executionRouter = Router();

executionRouter.use(requireAuth);

// List executions for organization
executionRouter.get("/", requirePermission("workflow:read"), (req, res) => {
  const orgId = req.organizationId!;
  const { status, workflowId } = req.query;

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

  res.json({
    success: true,
    data: executions,
    error: null,
    meta: { total: executions.length },
  });
});

// Get single execution with step timeline
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

// List execution steps for a specific execution
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

// Cancel active execution
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

    // Cancel running steps
    for (const step of apiStore.steps.values()) {
      if (step.executionId === execution.id && step.status === "RUNNING") {
        step.status = "SKIPPED";
        step.errorMessage = "Execution was cancelled";
        step.completedAt = now;
        apiStore.steps.set(step.id, step);
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

    res.json({
      success: true,
      data: execution,
      error: null,
    });
  },
);
