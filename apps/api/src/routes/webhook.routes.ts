import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  CreateWebhookConfigSchema,
  UpdateWebhookConfigSchema,
} from "@flowforge/shared";
import {
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
} from "@flowforge/integrations";
import {
  apiStore,
  WorkflowExecutionRecord,
  WebhookConfigRecord,
  WebhookEventRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { resolveActiveWorkflowVersionId } from "./workflow.routes.js";

export const webhookRouter = Router();

// ==========================================
// 1. INBOUND WEBHOOK INGESTION (Unauthenticated by Session, Authenticated by Signature)
// ==========================================
const handleInboundWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const targetId = req.params.id || req.params.workflowId;

  // 1. Check if targetId references a registered WebhookConfig
  const webhookConfig = apiStore.webhooks.get(targetId);
  let workflow = webhookConfig
    ? apiStore.workflows.get(webhookConfig.workflowId)
    : apiStore.workflows.get(targetId);

  if (!workflow || workflow.deletedAt) {
    if (
      req.params.workflowId === "subscriptions" ||
      req.params.workflowId === "deliveries"
    ) {
      return next();
    }
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Target webhook or workflow not found." },
    });
    return;
  }

  if (webhookConfig && !webhookConfig.enabled) {
    res.status(403).json({
      success: false,
      data: null,
      error: { code: "WEBHOOK_DISABLED", message: "Webhook endpoint is disabled." },
    });
    return;
  }

  if (workflow.status !== "ACTIVE" || !workflow.publishedVersionId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "WORKFLOW_INACTIVE",
        message: "Workflow does not have an active published version.",
      },
    });
    return;
  }

  // 2. Idempotency & Deduplication Check
  const idempotencyKey =
    (req.headers["x-idempotency-key"] as string) ||
    (req.headers["x-event-id"] as string) ||
    req.body?.id ||
    req.body?.eventId;

  if (idempotencyKey) {
    const existingEvent = Array.from(apiStore.webhookEvents.values()).find(
      (e) =>
        e.organizationId === workflow.organizationId &&
        e.idempotencyKey === idempotencyKey,
    );

    if (existingEvent) {
      res.status(200).json({
        success: true,
        data: {
          message: "Duplicate webhook event ignored (idempotent).",
          executionId: existingEvent.executionId,
        },
        error: null,
        meta: { idempotent: true },
      });
      return;
    }
  }

  // 3. Cryptographic Signature & Replay Window Verification
  const signature =
    (req.headers["x-signature-256"] as string) ||
    (req.headers["x-hub-signature-256"] as string);
  const timestamp =
    (req.headers["x-webhook-timestamp"] as string) ||
    (req.headers["x-timestamp"] as string);

  const effectiveSecret =
    webhookConfig?.signingSecret || process.env.WEBHOOK_SECRET;

  if (effectiveSecret || signature) {
    const rawBody = JSON.stringify(req.body);
    const verification = verifyWebhookSignatureDetailed({
      payload: rawBody,
      signature,
      secret: effectiveSecret,
      timestamp,
      maxAgeSeconds: 300,
    });

    if (!verification.isValid) {
      const statusCode =
        verification.errorCode === "TIMESTAMP_EXPIRED" ? 401 : 401;
      res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: verification.errorCode || "INVALID_SIGNATURE",
          message:
            verification.message || "Webhook signature verification failed.",
        },
      });
      return;
    }
  }

  // 4. Create and persist execution & trigger event
  const executionId = `exec_${crypto.randomUUID()}`;
  const now = new Date();
  const resolvedVersionId = resolveActiveWorkflowVersionId(workflow.id, "production") || workflow.publishedVersionId;

  const execution: WorkflowExecutionRecord = {
    id: executionId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    workflowVersionId: resolvedVersionId,
    environment: "production",
    triggerType: "WEBHOOK",
    triggerPayload: req.body,
    status: "QUEUED",
    contextData: {
      trigger: {
        type: "WEBHOOK",
        payload: req.body,
        idempotencyKey,
      },
    },
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const eventId = `whevt_${crypto.randomUUID()}`;
  const eventRecord: WebhookEventRecord = {
    id: eventId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    webhookId: webhookConfig?.id,
    idempotencyKey,
    source: (req.headers["user-agent"] as string) || "webhook",
    payload: req.body,
    status: "PROCESSED",
    executionId,
    createdAt: now,
  };

  apiStore.executions.set(executionId, execution);
  apiStore.webhookEvents.set(eventId, eventRecord);

  res.status(202).json({
    success: true,
    data: {
      executionId,
      status: "QUEUED",
      message: "Webhook accepted and workflow queued for execution.",
    },
    error: null,
  });
};

webhookRouter.post("/incoming/:id", handleInboundWebhook);
webhookRouter.post("/:workflowId", handleInboundWebhook);

// ==========================================
// 2. WEBHOOK CONFIGURATION MANAGEMENT APIS (Tenant-Protected)
// ==========================================

// List webhooks for organization (signingSecret redacted)
webhookRouter.get(
  "/",
  requireAuth,
  requirePermission("webhook:read"),
  (req, res) => {
    const orgId = req.organizationId!;
    const webhooks = Array.from(apiStore.webhooks.values())
      .filter((w) => w.organizationId === orgId)
      .map((w) => ({
        ...w,
        signingSecret: "[REDACTED]",
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: webhooks,
      error: null,
      meta: { total: webhooks.length },
    });
  },
);

// Create webhook configuration for a workflow
webhookRouter.post(
  "/",
  requireAuth,
  requirePermission("webhook:write"),
  (req, res) => {
    const parseResult = CreateWebhookConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid webhook payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { workflowId, name, eventFilter, enabled } = parseResult.data;
    const workflow = apiStore.workflows.get(workflowId);

    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Target workflow not found in active organization.",
        },
      });
      return;
    }

    const webhookId = `whk_${crypto.randomUUID()}`;
    const signingSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    const now = new Date();

    const record: WebhookConfigRecord = {
      id: webhookId,
      organizationId: req.organizationId!,
      workflowId,
      name,
      enabled: enabled ?? true,
      signingSecret,
      eventFilter,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.webhooks.set(webhookId, record);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "webhook.created",
      resourceType: "webhook_config",
      resourceId: webhookId,
      metadata: { name, workflowId },
      ipAddress: req.ip,
    });

    // Return the secret only on creation
    res.status(201).json({
      success: true,
      data: record,
      error: null,
    });
  },
);

// Get single webhook configuration
webhookRouter.get(
  "/config/:id",
  requireAuth,
  requirePermission("webhook:read"),
  (req, res) => {
    const webhook = apiStore.webhooks.get(req.params.id);
    if (!webhook || webhook.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook configuration not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...webhook,
        signingSecret: "[REDACTED]",
      },
      error: null,
    });
  },
);

// Update webhook configuration
webhookRouter.patch(
  "/config/:id",
  requireAuth,
  requirePermission("webhook:write"),
  (req, res) => {
    const webhook = apiStore.webhooks.get(req.params.id);
    if (!webhook || webhook.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook configuration not found." },
      });
      return;
    }

    const parseResult = UpdateWebhookConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid update payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    if (parseResult.data.name !== undefined) webhook.name = parseResult.data.name;
    if (parseResult.data.enabled !== undefined)
      webhook.enabled = parseResult.data.enabled;
    if (parseResult.data.eventFilter !== undefined)
      webhook.eventFilter = parseResult.data.eventFilter;
    webhook.updatedAt = new Date();

    apiStore.webhooks.set(webhook.id, webhook);

    res.json({
      success: true,
      data: {
        ...webhook,
        signingSecret: "[REDACTED]",
      },
      error: null,
    });
  },
);

// Rotate webhook signing secret
webhookRouter.post(
  "/config/:id/rotate-secret",
  requireAuth,
  requirePermission("webhook:write"),
  (req, res) => {
    const webhook = apiStore.webhooks.get(req.params.id);
    if (!webhook || webhook.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook configuration not found." },
      });
      return;
    }

    const newSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    webhook.signingSecret = newSecret;
    webhook.updatedAt = new Date();
    apiStore.webhooks.set(webhook.id, webhook);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "webhook.secret_rotated",
      resourceType: "webhook_config",
      resourceId: webhook.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        id: webhook.id,
        signingSecret: newSecret,
        message:
          "Secret rotated successfully. Update your provider configuration.",
      },
      error: null,
    });
  },
);

// Delete webhook configuration
webhookRouter.delete(
  "/config/:id",
  requireAuth,
  requirePermission("webhook:write"),
  (req, res) => {
    const webhook = apiStore.webhooks.get(req.params.id);
    if (!webhook || webhook.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook configuration not found." },
      });
      return;
    }

    apiStore.webhooks.delete(webhook.id);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "webhook.deleted",
      resourceType: "webhook_config",
      resourceId: webhook.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Webhook configuration deleted successfully." },
      error: null,
    });
  },
);

// Query deliveries for webhook
webhookRouter.get(
  "/config/:id/deliveries",
  requireAuth,
  requirePermission("webhook:read"),
  (req, res) => {
    const webhook = apiStore.webhooks.get(req.params.id);
    if (!webhook || webhook.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook configuration not found." },
      });
      return;
    }

    const events = Array.from(apiStore.webhookEvents.values())
      .filter((e) => e.webhookId === webhook.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: events,
      error: null,
      meta: { total: events.length },
    });
  },
);
