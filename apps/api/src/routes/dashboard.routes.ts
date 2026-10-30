import { Router } from 'express';
import { apiStore } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/stats', requirePermission('org:read'), (req, res) => {
  const orgId = req.organizationId!;

  const workflows = Array.from(apiStore.workflows.values()).filter(
    (w) => w.organizationId === orgId
  );
  const activeWorkflows = workflows.filter((w) => w.status === 'ACTIVE');

  const executions = Array.from(apiStore.executions.values()).filter(
    (e) => e.organizationId === orgId
  );
  const successfulExecutions = executions.filter((e) => e.status === 'SUCCEEDED');
  const failedExecutions = executions.filter((e) => e.status === 'FAILED');

  const approvals = Array.from(apiStore.approvals.values()).filter(
    (a) => a.organizationId === orgId
  );
  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');

  const totalFinished = successfulExecutions.length + failedExecutions.length;
  const successRate = totalFinished > 0 ? (successfulExecutions.length / totalFinished) * 100 : 100;

  res.json({
    success: true,
    data: {
      totalWorkflows: workflows.length,
      activeWorkflows: activeWorkflows.length,
      totalExecutions: executions.length,
      successfulExecutions: successfulExecutions.length,
      failedExecutions: failedExecutions.length,
      pendingApprovals: pendingApprovals.length,
      successRate: Math.round(successRate * 10) / 10
    },
    error: null
  });
});

dashboardRouter.get('/activity', requirePermission('org:read'), (req, res) => {
  const orgId = req.organizationId!;

  const recentExecutions = Array.from(apiStore.executions.values())
    .filter((e) => e.organizationId === orgId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((e) => {
      const wf = apiStore.workflows.get(e.workflowId);
      return {
        id: e.id,
        workflowId: e.workflowId,
        workflowName: wf?.name || 'Unknown Workflow',
        triggerType: e.triggerType,
        status: e.status,
        createdAt: e.createdAt,
        completedAt: e.completedAt
      };
    });

  res.json({
    success: true,
    data: {
      recentExecutions
    },
    error: null
  });
});
