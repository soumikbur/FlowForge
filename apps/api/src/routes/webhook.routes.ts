import { Router } from 'express';
import crypto from 'crypto';
import { verifyWebhookSignature } from '@flowforge/integrations';
import { apiStore, WorkflowExecutionRecord } from '../store.js';

export const webhookRouter = Router();

const processedEvents = new Set<string>();

// Ingest external webhook
webhookRouter.post('/:workflowId', async (req, res) => {
  const { workflowId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Target workflow not found.' }
    });
    return;
  }

  if (workflow.status !== 'ACTIVE' || !workflow.publishedVersionId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'WORKFLOW_INACTIVE', message: 'Workflow is not currently active.' }
    });
    return;
  }

  // Idempotency check
  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) ||
    req.body?.id ||
    req.body?.eventId;

  if (idempotencyKey) {
    const dedupeKey = `${workflowId}:${idempotencyKey}`;
    if (processedEvents.has(dedupeKey)) {
      res.status(200).json({
        success: true,
        data: { message: 'Duplicate webhook event ignored (idempotent).' },
        error: null
      });
      return;
    }
    processedEvents.add(dedupeKey);
  }

  // Optional signature verification if header provided
  const signature = req.headers['x-signature-256'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (webhookSecret && signature) {
    const rawBody = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret: webhookSecret
    });

    if (!isValid) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed.' }
      });
      return;
    }
  }

  const executionId = `exec_${crypto.randomUUID()}`;
  const now = new Date();

  const execution: WorkflowExecutionRecord = {
    id: executionId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    workflowVersionId: workflow.publishedVersionId,
    triggerType: 'WEBHOOK',
    triggerPayload: req.body,
    status: 'QUEUED',
    contextData: { trigger: { payload: req.body, type: 'WEBHOOK' } },
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  };

  apiStore.executions.set(executionId, execution);

  res.status(202).json({
    success: true,
    data: {
      executionId,
      status: 'QUEUED',
      message: 'Webhook received and workflow queued successfully.'
    },
    error: null
  });
});
