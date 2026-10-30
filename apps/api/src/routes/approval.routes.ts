import { Router } from "express";
import {
  DecideApprovalSchema,
  ReassignApprovalSchema,
  Role,
} from "@flowforge/shared";
import { resolveNextNodes } from "@flowforge/workflow-engine";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const approvalRouter = Router();

approvalRouter.use(requireAuth);

function meetsRole(userRole: Role | undefined, requiredRole: Role): boolean {
  if (!userRole) return false;
  if (userRole === "OWNER") return true;
  if (userRole === "ADMIN") return requiredRole === "ADMIN" || requiredRole === "MEMBER";
  return requiredRole === "MEMBER";
}

// ==========================================
// 1. List approvals for organization (Filterable & Paginated)
// ==========================================
approvalRouter.get("/", requirePermission("approval:read"), (req, res) => {
  const orgId = req.organizationId!;
  const { status, assignedToMe, page = "1", pageSize = "20" } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 20));

  let approvals = Array.from(apiStore.approvals.values()).filter(
    (a) => a.organizationId === orgId,
  );

  if (status && typeof status === "string") {
    approvals = approvals.filter((a) => a.status === status);
  }

  if (assignedToMe === "true" || String(assignedToMe) === "true") {
    const currentUserId = req.user?.id;
    const userRole = req.role;
    approvals = approvals.filter((a) => {
      if (a.assignedUserId) {
        return a.assignedUserId === currentUserId;
      }
      return meetsRole(userRole, a.requiredRole);
    });
  }

  // Chronological sort: newest first
  approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = approvals.length;
  const startIndex = (pageNum - 1) * sizeNum;
  const paginated = approvals.slice(startIndex, startIndex + sizeNum);

  // Attach workflow name and execution metadata for rich listing
  const enriched = paginated.map((a) => {
    const exec = apiStore.executions.get(a.executionId);
    const wf = exec ? apiStore.workflows.get(exec.workflowId) : undefined;
    return {
      ...a,
      workflowId: exec?.workflowId,
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
// 2. Get single approval with execution & step context
// ==========================================
approvalRouter.get("/:id", requirePermission("approval:read"), (req, res) => {
  const approval = apiStore.approvals.get(req.params.id);
  if (!approval || approval.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Approval request not found." },
    });
    return;
  }

  const execution = apiStore.executions.get(approval.executionId);
  const workflow = execution ? apiStore.workflows.get(execution.workflowId) : undefined;
  const step = apiStore.steps.get(approval.stepId);
  const decider = approval.decidedById ? apiStore.users.get(approval.decidedById) : undefined;
  const assignee = approval.assignedUserId ? apiStore.users.get(approval.assignedUserId) : undefined;

  res.json({
    success: true,
    data: {
      ...approval,
      workflowName: workflow?.name,
      execution: execution
        ? {
            id: execution.id,
            status: execution.status,
            triggerType: execution.triggerType,
            triggerPayload: execution.triggerPayload,
            createdAt: execution.createdAt,
          }
        : null,
      step: step
        ? {
            id: step.id,
            nodeId: step.nodeId,
            nodeName: step.nodeName,
            status: step.status,
            inputPayload: step.inputPayload,
            attempt: step.attempt,
          }
        : null,
      decider: decider ? { id: decider.id, email: decider.email, firstName: decider.firstName, lastName: decider.lastName } : null,
      assignee: assignee ? { id: assignee.id, email: assignee.email, firstName: assignee.firstName, lastName: assignee.lastName } : null,
    },
    error: null,
  });
});

// ==========================================
// 3. Submit decision (Approve or Reject)
// ==========================================
approvalRouter.post(
  "/:id/decide",
  requirePermission("approval:decide"),
  (req, res) => {
    const approval = apiStore.approvals.get(req.params.id);
    if (!approval || approval.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Approval request not found." },
      });
      return;
    }

    // Atomic Conflict Guard: Cannot decide if not PENDING
    if (approval.status !== "PENDING") {
      res.status(409).json({
        success: false,
        data: null,
        error: {
          code: "ALREADY_DECIDED",
          message: `Approval has already been decided with status: ${approval.status}`,
        },
      });
      return;
    }

    const parseResult = DecideApprovalSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid decision payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const execution = apiStore.executions.get(approval.executionId);
    if (!execution) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Associated execution not found." },
      });
      return;
    }

    const workflow = apiStore.workflows.get(execution.workflowId);
    const version = apiStore.versions.get(execution.workflowVersionId);

    // Look up node config for self-approval policy
    const approvalNode = version?.definition.nodes.find(
      (n) => n.id === execution.currentNodeId || n.name === approval.title,
    );
    const allowSelfApproval = Boolean(approvalNode?.config?.allowSelfApproval);

    // Self-Approval Prevention Check:
    // Creator cannot approve own workflow unless explicitly allowed or user is OWNER
    const isWorkflowCreator = workflow?.createdById === req.user?.id;
    if (isWorkflowCreator && !allowSelfApproval && req.role !== "OWNER") {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "SELF_APPROVAL_FORBIDDEN",
          message: "Self-approval is forbidden for this workflow. An independent approver is required.",
        },
      });
      return;
    }

    // Assignee and Role Authorization Checks:
    if (approval.assignedUserId) {
      const isAssigned = approval.assignedUserId === req.user?.id;
      const isPrivileged = req.role === "OWNER" || req.role === "ADMIN";
      if (!isAssigned && !isPrivileged) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "NOT_ASSIGNED",
            message: "You are not assigned to decide this approval request.",
          },
        });
        return;
      }
    } else if (approval.requiredRole) {
      if (!meetsRole(req.role, approval.requiredRole)) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "INSUFFICIENT_ROLE",
            message: `Requires role '${approval.requiredRole}' or higher to decide this approval.`,
          },
        });
        return;
      }
    }

    const { decision, comment } = parseResult.data;
    const now = new Date();

    // Atomic state update
    approval.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    approval.decisionComment = comment;
    approval.decidedById = req.user?.id;
    approval.decidedAt = now;
    apiStore.approvals.set(approval.id, approval);

    // Update execution step
    const step = apiStore.steps.get(approval.stepId);
    if (step) {
      if (decision === "APPROVE") {
        step.status = "COMPLETED";
        step.outputPayload = {
          approved: true,
          comment,
          decidedById: req.user?.id,
          decidedAt: now.toISOString(),
        };
        step.completedAt = now;
      } else {
        step.status = "FAILED";
        step.errorMessage = comment || "Approval was rejected";
        step.completedAt = now;
      }
      apiStore.steps.set(step.id, step);
    }

    // Resume or fail execution (unless execution was already cancelled)
    if (execution.status !== "CANCELLED") {
      if (decision === "APPROVE") {
        if (version) {
          const currentNodeId = execution.currentNodeId || (step ? step.nodeId : "");
          execution.contextData = {
            ...execution.contextData,
            steps: {
              ...((execution.contextData.steps as any) || {}),
              [currentNodeId]: {
                output: {
                  approved: true,
                  comment,
                  decidedById: req.user?.id,
                  decidedAt: now.toISOString(),
                },
                status: "COMPLETED",
              },
            },
          };

          const plan = resolveNextNodes(version.definition, currentNodeId, {
            status: "COMPLETED",
            output: { approved: true, comment, decidedById: req.user?.id },
          });

          if (plan.isComplete || plan.nextNodes.length === 0) {
            execution.status = "SUCCEEDED";
            execution.completedAt = now;
          } else {
            execution.currentNodeId = plan.nextNodes[0].id;
            execution.status = "QUEUED";
          }
        } else {
          execution.status = "QUEUED";
        }
      } else {
        execution.status = "FAILED";
        execution.completedAt = now;
        execution.errorDetails = {
          message: comment || "Approval was rejected",
          decidedById: req.user?.id,
        };
      }
      execution.updatedAt = now;
      apiStore.executions.set(execution.id, execution);
    }

    // Audit log entry
    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "approval.decided",
      resourceType: "approval",
      resourceId: approval.id,
      metadata: {
        decision,
        comment,
        executionId: approval.executionId,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        approval,
        execution,
      },
      error: null,
    });
  },
);

// ==========================================
// 4. Reassign approval to another user or role
// ==========================================
approvalRouter.post(
  "/:id/reassign",
  requirePermission("approval:decide"),
  (req, res) => {
    const approval = apiStore.approvals.get(req.params.id);
    if (!approval || approval.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Approval request not found." },
      });
      return;
    }

    if (approval.status !== "PENDING") {
      res.status(409).json({
        success: false,
        data: null,
        error: {
          code: "ALREADY_DECIDED",
          message: `Cannot reassign an approval that is already '${approval.status}'.`,
        },
      });
      return;
    }

    const parseResult = ReassignApprovalSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid reassignment payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { assignedUserId, requiredRole, reason } = parseResult.data;

    if (assignedUserId) {
      const membership = Array.from(apiStore.memberships.values()).find(
        (m) =>
          m.organizationId === req.organizationId &&
          m.userId === assignedUserId,
      );
      if (!membership) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "INVALID_ASSIGNEE",
            message: "Target user is not a member of this organization.",
          },
        });
        return;
      }
    }

    const previousAssignedUserId = approval.assignedUserId;
    const previousRole = approval.requiredRole;

    if (assignedUserId !== undefined) {
      approval.assignedUserId = assignedUserId;
    }
    if (requiredRole !== undefined) {
      approval.requiredRole = requiredRole;
    }
    apiStore.approvals.set(approval.id, approval);

    // Audit log
    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "approval.reassigned",
      resourceType: "approval",
      resourceId: approval.id,
      metadata: {
        previousAssignedUserId,
        newAssignedUserId: approval.assignedUserId,
        previousRole,
        newRole: approval.requiredRole,
        reason,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: approval,
      error: null,
    });
  },
);
