import { Router } from 'express';
import crypto from 'crypto';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  TriggerWorkflowSchema
} from '@flowforge/shared';
import { validateWorkflowGraph } from '@flowforge/workflow-engine';
import { apiStore, WorkflowRecord, WorkflowVersionRecord, WorkflowExecutionRecord } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

export const workflowRouter = Router();

workflowRouter.use(requireAuth);

// List Workflows for active organization
workflowRouter.get('/', requirePermission('workflow:read'), (req, res) => {
  const orgId = req.organizationId!;
  const workflows = Array.from(apiStore.workflows.values()).filter(
    (w) => w.organizationId === orgId
  );

  res.json({
    success: true,
    data: workflows,
    error: null,
    meta: { total: workflows.length }
  });
});

// Create new workflow draft
workflowRouter.post('/', requirePermission('workflow:write'), (req, res) => {
  const parseResult = CreateWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid workflow payload',
        details: parseResult.error.issues
      }
    });
    return;
  }

  const { name, description } = parseResult.data;
  const workflowId = `wf_${crypto.randomUUID()}`;
  const now = new Date();

  const newWorkflow: WorkflowRecord = {
    id: workflowId,
    organizationId: req.organizationId!,
    name,
    description,
    status: 'DRAFT',
    draftDefinition: {
      nodes: [
        {
          id: 'trigger_1',
          type: 'TRIGGER',
          name: 'Manual Trigger',
          config: { triggerType: 'MANUAL' },
          position: { x: 100, y: 100 }
        }
      ],
      edges: []
    },
    createdAt: now,
    updatedAt: now
  };

  apiStore.workflows.set(workflowId, newWorkflow);

  res.status(201).json({
    success: true,
    data: newWorkflow,
    error: null
  });
});

// Get single workflow
workflowRouter.get('/:id', requirePermission('workflow:read'), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Workflow not found.' }
    });
    return;
  }

  const versions = Array.from(apiStore.versions.values()).filter(
    (v) => v.workflowId === workflow.id
  );

  res.json({
    success: true,
    data: {
      ...workflow,
      versions
    },
    error: null
  });
});

// Update workflow draft
workflowRouter.patch('/:id', requirePermission('workflow:write'), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Workflow not found.' }
    });
    return;
  }

  const parseResult = UpdateWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid update payload',
        details: parseResult.error.issues
      }
    });
    return;
  }

  const { name, description, nodes, edges } = parseResult.data;

  if (name !== undefined) workflow.name = name;
  if (description !== undefined) workflow.description = description;
  if (nodes !== undefined || edges !== undefined) {
    workflow.draftDefinition = {
      nodes: nodes ?? workflow.draftDefinition.nodes,
      edges: edges ?? workflow.draftDefinition.edges
    };
  }
  workflow.updatedAt = new Date();

  apiStore.workflows.set(workflow.id, workflow);

  res.json({
    success: true,
    data: workflow,
    error: null
  });
});

// Validate workflow draft
workflowRouter.post('/:id/validate', requirePermission('workflow:read'), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Workflow not found.' }
    });
    return;
  }

  const validation = validateWorkflowGraph(workflow.draftDefinition);

  res.json({
    success: true,
    data: validation,
    error: null
  });
});

// Publish workflow draft into an immutable version
workflowRouter.post('/:id/publish', requirePermission('workflow:publish'), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Workflow not found.' }
    });
    return;
  }

  const validation = validateWorkflowGraph(workflow.draftDefinition);
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'GRAPH_VALIDATION_FAILED',
        message: 'Cannot publish workflow with validation errors.',
        details: validation.errors
      }
    });
    return;
  }

  // Count existing versions
  const existingVersions = Array.from(apiStore.versions.values()).filter(
    (v) => v.workflowId === workflow.id
  );
  const nextVersionNumber = existingVersions.length + 1;
  const versionId = `ver_${crypto.randomUUID()}`;

  const newVersion: WorkflowVersionRecord = {
    id: versionId,
    workflowId: workflow.id,
    versionNumber: nextVersionNumber,
    definition: JSON.parse(JSON.stringify(workflow.draftDefinition)),
    publishedAt: new Date(),
    publishedById: req.user?.id
  };

  apiStore.versions.set(versionId, newVersion);

  workflow.publishedVersionId = versionId;
  workflow.status = 'ACTIVE';
  workflow.updatedAt = new Date();
  apiStore.workflows.set(workflow.id, workflow);

  res.status(201).json({
    success: true,
    data: {
      workflow,
      version: newVersion
    },
    error: null
  });
});

// Trigger workflow execution
workflowRouter.post('/:id/trigger', requirePermission('workflow:execute'), async (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Workflow not found.' }
    });
    return;
  }

  if (!workflow.publishedVersionId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'WORKFLOW_NOT_PUBLISHED',
        message: 'Workflow must have a published version before execution.'
      }
    });
    return;
  }

  const parseResult = TriggerWorkflowSchema.safeParse(req.body);
  const triggerPayload = parseResult.success ? parseResult.data.payload : {};

  const executionId = `exec_${crypto.randomUUID()}`;
  const now = new Date();

  const execution: WorkflowExecutionRecord = {
    id: executionId,
    organizationId: req.organizationId!,
    workflowId: workflow.id,
    workflowVersionId: workflow.publishedVersionId,
    triggerType: 'MANUAL',
    triggerPayload,
    status: 'QUEUED',
    contextData: { trigger: { payload: triggerPayload, type: 'MANUAL' } },
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  };

  apiStore.executions.set(executionId, execution);

  res.status(202).json({
    success: true,
    data: execution,
    error: null
  });
});
