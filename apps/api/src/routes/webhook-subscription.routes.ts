import crypto from "crypto";
import { Router, Request, Response } from "express";
import {
  CreateWebhookSubscriptionSchema,
  UpdateWebhookSubscriptionSchema,
} from "@flowforge/shared";
import { isPrivateOrBlockedDestination } from "@flowforge/integrations";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { replayWebhookDelivery } from "../services/event-delivery.service.js";

export const webhookSubscriptionRouter = Router();
webhookSubscriptionRouter.use(requireAuth);

/**
 * GET /api/v1/webhooks/subscriptions
 * List outbound webhook subscriptions for the current organization.
 */
webhookSubscriptionRouter.get(
  "/subscriptions",
  requirePermission("webhook:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const subscriptions = Array.from(apiStore.webhookSubscriptions.values())
      .filter((s) => s.organizationId === orgId)
      .map((s) => ({
        id: s.id,
        organizationId: s.organizationId,
        name: s.name,
        url: s.url,
        events: s.events,
        enabled: s.enabled,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        // Secret is masked for security
      }));

    res.json({
      success: true,
      data: subscriptions,
      meta: { total: subscriptions.length },
      error: null,
    });
  },
);

/**
 * POST /api/v1/webhooks/subscriptions
 * Create a new outbound webhook subscription.
 */
webhookSubscriptionRouter.post(
  "/subscriptions",
  requirePermission("webhook:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const parseResult = CreateWebhookSubscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid webhook subscription payload.",
          details: parseResult.error.format(),
        },
      });
      return;
    }

    const { name, url, events, enabled, secret: customSecret } = parseResult.data;

    // SSRF Destination Validation
    if (isPrivateOrBlockedDestination(url)) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "SSRF_BLOCKED_DESTINATION",
          message: "The destination URL resolves to a private, loopback, or prohibited network address.",
        },
      });
      return;
    }

    const subId = `whsub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const generatedSecret =
      customSecret || `whsec_${crypto.randomBytes(24).toString("hex")}`;
    const now = new Date();

    const record = {
      id: subId,
      organizationId: orgId,
      name,
      url,
      events,
      enabled: enabled !== undefined ? enabled : true,
      secret: generatedSecret,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.webhookSubscriptions.set(subId, record);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "webhook_subscription:create",
      resourceType: "webhook_subscription",
      resourceId: subId,
      metadata: { name, url, events },
    });

    res.status(201).json({
      success: true,
      data: {
        id: record.id,
        organizationId: record.organizationId,
        name: record.name,
        url: record.url,
        events: record.events,
        enabled: record.enabled,
        secret: generatedSecret, // Returned once on creation
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      },
      error: null,
    });
  },
);

/**
 * GET /api/v1/webhooks/subscriptions/:id
 * Retrieve a webhook subscription details.
 */
webhookSubscriptionRouter.get(
  "/subscriptions/:id",
  requirePermission("webhook:read"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const sub = apiStore.webhookSubscriptions.get(id);
    if (!sub || sub.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: sub.id,
        organizationId: sub.organizationId,
        name: sub.name,
        url: sub.url,
        events: sub.events,
        enabled: sub.enabled,
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
      },
      error: null,
    });
  },
);

/**
 * PATCH /api/v1/webhooks/subscriptions/:id
 * Update an existing outbound webhook subscription.
 */
webhookSubscriptionRouter.patch(
  "/subscriptions/:id",
  requirePermission("webhook:write"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const sub = apiStore.webhookSubscriptions.get(id);
    if (!sub || sub.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." },
      });
      return;
    }

    const parseResult = UpdateWebhookSubscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid webhook update payload.",
          details: parseResult.error.format(),
        },
      });
      return;
    }

    if (parseResult.data.url) {
      if (isPrivateOrBlockedDestination(parseResult.data.url)) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "SSRF_BLOCKED_DESTINATION",
            message: "The destination URL resolves to a private, loopback, or prohibited network address.",
          },
        });
        return;
      }
      sub.url = parseResult.data.url;
    }

    if (parseResult.data.name !== undefined) sub.name = parseResult.data.name;
    if (parseResult.data.events !== undefined) sub.events = parseResult.data.events;
    if (parseResult.data.enabled !== undefined) sub.enabled = parseResult.data.enabled;
    sub.updatedAt = new Date();

    apiStore.webhookSubscriptions.set(id, sub);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "webhook_subscription:update",
      resourceType: "webhook_subscription",
      resourceId: id,
    });

    res.json({
      success: true,
      data: {
        id: sub.id,
        organizationId: sub.organizationId,
        name: sub.name,
        url: sub.url,
        events: sub.events,
        enabled: sub.enabled,
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
      },
      error: null,
    });
  },
);

/**
 * POST /api/v1/webhooks/subscriptions/:id/rotate-secret
 * Rotate HMAC signing secret for a subscription.
 */
webhookSubscriptionRouter.post(
  "/subscriptions/:id/rotate-secret",
  requirePermission("webhook:write"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const sub = apiStore.webhookSubscriptions.get(id);
    if (!sub || sub.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." },
      });
      return;
    }

    const newSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    sub.secret = newSecret;
    sub.updatedAt = new Date();
    apiStore.webhookSubscriptions.set(id, sub);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "webhook_subscription:rotate_secret",
      resourceType: "webhook_subscription",
      resourceId: id,
    });

    res.json({
      success: true,
      data: {
        subscriptionId: id,
        secret: newSecret,
        newSecret,
        updatedAt: sub.updatedAt.toISOString(),
      },
      error: null,
    });
  },
);

/**
 * DELETE /api/v1/webhooks/subscriptions/:id
 * Delete a webhook subscription.
 */
webhookSubscriptionRouter.delete(
  "/subscriptions/:id",
  requirePermission("webhook:write"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const sub = apiStore.webhookSubscriptions.get(id);
    if (!sub || sub.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." },
      });
      return;
    }

    apiStore.webhookSubscriptions.delete(id);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "webhook_subscription:delete",
      resourceType: "webhook_subscription",
      resourceId: id,
    });

    res.json({
      success: true,
      data: { message: "Webhook subscription deleted successfully." },
      error: null,
    });
  },
);

/**
 * GET /api/v1/webhooks/subscriptions/:id/deliveries
 * List delivery history and status for a specific subscription.
 */
webhookSubscriptionRouter.get(
  "/subscriptions/:id/deliveries",
  requirePermission("webhook:read"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const sub = apiStore.webhookSubscriptions.get(id);
    if (!sub || sub.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." },
      });
      return;
    }

    const deliveries = Array.from(apiStore.webhookDeliveries.values())
      .filter((d) => d.subscriptionId === id && d.organizationId === orgId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    res.json({
      success: true,
      data: deliveries,
      meta: { total: deliveries.length },
      error: null,
    });
  },
);

/**
 * POST /api/v1/webhooks/deliveries/:id/retry
 * Replays a failed or dead-lettered delivery.
 */
webhookSubscriptionRouter.post(
  "/deliveries/:id/retry",
  requirePermission("webhook:write"),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = req.organizationId!;

    const delivery = apiStore.webhookDeliveries.get(id);
    if (!delivery || delivery.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Webhook delivery record not found." },
      });
      return;
    }

    try {
      const retried = await replayWebhookDelivery(apiStore, id, req.user?.id);
      res.json({
        success: true,
        data: retried,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "REPLAY_FAILED", message: err.message },
      });
    }
  },
);
