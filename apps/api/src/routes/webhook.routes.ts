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
import { resourceGovernanceService } from "../services/resource-governance.service.js";
import { apiReliabilityService } from "../services/api-reliability.service.js";

export const webhookRouter = Router();

// ==========================================
// In-Memory Signature Replay Prevention Cache
// ==========================================
const signatureReplayCache = new Map<string, number>();

export function isSignatureReplayed(signature: string): boolean {
  const now = Date.now();
  for (const [sig, ts] of signatureReplayCache.entries()) {
    if (now - ts > 300000) {
      signatureReplayCache.delete(sig);
    }
  }
  if (signatureReplayCache.has(signature)) {
    return true;
  }
  signatureReplayCache.set(signature, now);
  return false;
}

export function resetSignatureReplayCache(): void {
  signatureReplayCache.clear();
}

// ==========================================
// 1. INBOUND WEBHOOK INGESTION (Unauthenticated by Session, Authenticated by Signature)
// ==========================================
const handleInboundWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const targetId = req.params.id || req.params.workflowId;
  const requestId =
    (req as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    `req_${crypto.randomUUID()}`;

  apiReliabilityService.recordInboundWebhook("received");

  // 0. Payload size check (2MB maximum for webhooks)
  const contentLength = req.headers["content-length"]
    ? parseInt(req.headers["content-length"] as string, 10)
    : undefined;
  if (contentLength && contentLength > 2 * 1024 * 1024) {
    res.status(413).json({
      success: false,
      data: null,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Webhook payload exceeds maximum size limit of 2MB.",
        details: { contentLength, limit: 2 * 1024 * 1024 },
        requestId,
        retryable: false,
        docUrl: "https://docs.flowforge.dev/errors#PAYLOAD_TOO_LARGE",
      },
    });
    return;
  }

  // 1. Check if targetId references a registered WebhookConfig or workflow
  const webhookConfig =
    apiStore.webhooks.get(targetId) ||
    Array.from(apiStore.webhooks.values()).find(
      (w) => w.workflowId === targetId && w.enabled,
    );
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
    apiReliabilityService.recordInboundWebhook("disabled_or_not_found");
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Target webhook or workflow not found.",
        requestId,
        retryable: false,
      },
    });
    return;
  }

  if (webhookConfig && !webhookConfig.enabled) {
    apiReliabilityService.recordInboundWebhook("disabled_or_not_found");
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "WEBHOOK_DISABLED",
        message: "Webhook endpoint is disabled.",
        requestId,
        retryable: false,
      },
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
        requestId,
        retryable: false,
      },
    });
    return;
  }

  // 2. Cryptographic Signature, Dual-Secret Verification & Replay Window Verification
  const signature =
    (req.headers["x-signature-256"] as string) ||
    (req.headers["x-hub-signature-256"] as string) ||
    (req.headers["x-flowforge-signature"] as string);
  const timestamp =
    (req.headers["x-webhook-timestamp"] as string) ||
    (req.headers["x-timestamp"] as string) ||
    (req.headers["x-flowforge-timestamp"] as string);

  const publishedVersion = workflow.publishedVersionId
    ? apiStore.versions.get(workflow.publishedVersionId)
    : null;
  const triggerNode = publishedVersion?.definition?.nodes?.find(
    (n) => n.type === "TRIGGER",
  );
  const triggerSigningSecret = triggerNode?.config?.signingSecret as
    string | undefined;

  const primarySecret =
    webhookConfig?.signingSecret ||
    triggerSigningSecret ||
    process.env.WEBHOOK_SECRET;
  const secondarySecret = webhookConfig?.secondarySigningSecret;

  if (primarySecret || secondarySecret || signature) {
    const rawBody = JSON.stringify(req.body);
    let verification = verifyWebhookSignatureDetailed({
      payload: rawBody,
      signature,
      secret: primarySecret,
      timestamp,
      maxAgeSeconds: 300,
    });

    if (!verification.isValid && secondarySecret) {
      const secondaryVerification = verifyWebhookSignatureDetailed({
        payload: rawBody,
        signature,
        secret: secondarySecret,
        timestamp,
        maxAgeSeconds: 300,
      });
      if (secondaryVerification.isValid) {
        verification = secondaryVerification;
        apiStore.recordAudit({
          organizationId: workflow.organizationId,
          action: "webhook.secondary_secret_used",
          resourceType: "webhook_config",
          resourceId: webhookConfig?.id || workflow.id,
          metadata: { timestamp },
        });
      }
    }

    if (!verification.isValid) {
      apiReliabilityService.recordInboundWebhook(
        verification.errorCode === "TIMESTAMP_EXPIRED"
          ? "expired_timestamp"
          : "invalid_signature",
      );
      apiStore.recordAudit({
        organizationId: workflow.organizationId,
        action: "webhook.signature_failed",
        resourceType: "webhook_config",
        resourceId: webhookConfig?.id || workflow.id,
        metadata: {
          errorCode: verification.errorCode,
          message: verification.message,
        },
      });
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: verification.errorCode || "INVALID_SIGNATURE",
          message:
            verification.message || "Webhook signature verification failed.",
          requestId,
          retryable: false,
          docUrl: `https://docs.flowforge.dev/errors#${verification.errorCode || "INVALID_SIGNATURE"}`,
        },
      });
      return;
    }

    // Signature replay detection
    if (signature) {
      if (isSignatureReplayed(signature)) {
        apiReliabilityService.recordInboundWebhook("replay_detected");
        apiStore.recordAudit({
          organizationId: workflow.organizationId,
          action: "webhook.replay_detected",
          resourceType: "webhook_config",
          resourceId: webhookConfig?.id || workflow.id,
          metadata: { signature: signature.slice(0, 16) + "..." },
        });
        res.status(409).json({
          success: false,
          data: null,
          error: {
            code: "WEBHOOK_REPLAY_DETECTED",
            message:
              "Webhook signature has already been processed within the validity window (replay detected).",
            requestId,
            retryable: false,
            docUrl: "https://docs.flowforge.dev/errors#WEBHOOK_REPLAY_DETECTED",
          },
        });
        return;
      }
    }

    apiReliabilityService.recordInboundWebhook("verified");
  }

  // 3. Idempotency & Deduplication Check
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

  // 4. Authoritative Resource Governance & Admission Control
  const now = new Date();
  const resolvedVersionId =
    resolveActiveWorkflowVersionId(workflow.id, "production") ||
    workflow.publishedVersionId;

  const admission = resourceGovernanceService.admitExecution({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    workspaceId: workflow.workspaceId,
    workflowVersionId: resolvedVersionId,
    triggerType: "WEBHOOK",
    triggerPayload: req.body,
    environment: "production",
    idempotencyKey,
  });

  if (!admission.allowed) {
    if (admission.retryAfterSeconds) {
      res.setHeader("Retry-After", admission.retryAfterSeconds.toString());
    }
    res.status(admission.statusCode).json({
      success: false,
      data: null,
      error: {
        code: admission.outcome,
        message: admission.reason,
        details: {
          metric: admission.metric,
          limit: admission.limit,
          currentUsage: admission.currentUsage,
        },
      },
    });
    return;
  }

  const executionId = admission.execution.id;
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
        error: {
          code: "NOT_FOUND",
          message: "Webhook configuration not found.",
        },
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
        error: {
          code: "NOT_FOUND",
          message: "Webhook configuration not found.",
        },
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

    if (parseResult.data.name !== undefined)
      webhook.name = parseResult.data.name;
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

// Rotate webhook signing secret (with zero-downtime dual-secret rotation grace period)
const rotateWebhookSecretHandler = (req: Request, res: Response) => {
  const targetId = req.params.id;
  const requestId =
    (req as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    `req_${crypto.randomUUID()}`;

  const webhook = apiStore.webhooks.get(targetId);
  if (!webhook || webhook.organizationId !== req.organizationId) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Webhook configuration not found.",
        requestId,
        retryable: false,
      },
    });
    return;
  }

  const previousSecret = webhook.signingSecret;
  const newSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const now = new Date();

  webhook.secondarySigningSecret = previousSecret;
  webhook.signingSecret = newSecret;
  webhook.secretRotatedAt = now;
  webhook.updatedAt = now;
  apiStore.webhooks.set(webhook.id, webhook);

  apiStore.recordAudit({
    organizationId: req.organizationId!,
    userId: req.user?.id,
    action: "webhook.secret_rotated",
    resourceType: "webhook_config",
    resourceId: webhook.id,
    ipAddress: req.ip,
    metadata: {
      hasSecondarySecret: true,
      rotatedAt: now.toISOString(),
    },
  });

  res.json({
    success: true,
    data: {
      id: webhook.id,
      webhookId: webhook.id,
      signingSecret: newSecret,
      secondarySigningSecret: previousSecret,
      secretRotatedAt: now.toISOString(),
      message:
        "Secret rotated successfully. Previous secret remains valid as secondary during rotation grace period.",
    },
    error: null,
  });
};

webhookRouter.post(
  "/config/:id/rotate-secret",
  requireAuth,
  requirePermission("webhook:write"),
  rotateWebhookSecretHandler,
);

webhookRouter.post(
  "/:id/rotate-secret",
  requireAuth,
  requirePermission("webhook:write"),
  rotateWebhookSecretHandler,
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
        error: {
          code: "NOT_FOUND",
          message: "Webhook configuration not found.",
        },
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
        error: {
          code: "NOT_FOUND",
          message: "Webhook configuration not found.",
        },
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
