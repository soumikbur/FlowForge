import { Router } from 'express';
import { DecideApprovalSchema } from '@flowforge/shared';
import { apiStore } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

export const approvalRouter = Router();

approvalRouter.use(requireAuth);

// List approvals for organization
approvalRouter.get('/', requirePermission('approval:read'), (req, res) => {
  const orgId = req.organizationId!;
  const { status } = req.query;

  let approvals = Array.from(apiStore.approvals.values()).filter(
    (a) => a.organizationId === orgId
  );

  if (status && typeof status === 'string') {
    approvals = approvals.filter((a) => a.status === status);
  }

  approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({
    success: true,
    data: approvals,
    error: null,
    meta: { total: approvals.length }
  });
});

// Get single approval with execution context
approvalRouter.get('/:id', requirePermission('approval:read'), (req, res) => {
  const approval = apiStore.approvals.get(req.params.id);
  if (!approval || approval.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Approval request not found.' }
    });
    return;
  }

  const execution = apiStore.executions.get(approval.executionId);

  res.json({
    success: true,
    data: {
      ...approval,
      execution
    },
    error: null
  });
});

// Submit decision (Approve or Reject)
approvalRouter.post('/:id/decide', requirePermission('approval:decide'), (req, res) => {
  const approval = apiStore.approvals.get(req.params.id);
  if (!approval || approval.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Approval request not found.' }
    });
    return;
  }

  if (approval.status !== 'PENDING') {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'ALREADY_DECIDED',
        message: `Approval has already been decided with status: ${approval.status}`
      }
    });
    return;
  }

  const parseResult = DecideApprovalSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid decision payload',
        details: parseResult.error.issues
      }
    });
    return;
  }

  const { decision, comment } = parseResult.data;
  const now = new Date();

  approval.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  approval.decisionComment = comment;
  approval.decidedById = req.user?.id;
  approval.decidedAt = now;
  apiStore.approvals.set(approval.id, approval);

  // Resume or conclude execution
  const execution = apiStore.executions.get(approval.executionId);
  if (execution) {
    if (decision === 'APPROVE') {
      execution.status = 'QUEUED';
      execution.contextData = {
        ...execution.contextData,
        approvalDecision: { approved: true, comment, decidedBy: req.user?.id }
      };
    } else {
      execution.status = 'FAILED';
      execution.completedAt = now;
      execution.errorDetails = { message: 'Approval was rejected', comment };
    }
    execution.updatedAt = now;
    apiStore.executions.set(execution.id, execution);
  }

  res.json({
    success: true,
    data: {
      approval,
      execution
    },
    error: null
  });
});
