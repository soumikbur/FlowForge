import crypto from "crypto";
import {
  FlowForgeEvent,
  FlowForgeEventSchema,
  NotificationCategory,
  NotificationPriority,
} from "@flowforge/shared";
import { executeSafeHttpRequest } from "./http.js";
import { isPrivateOrBlockedDestination } from "./ssrf.js";
import { defaultEmailService } from "./email.js";
import { signWebhookPayload } from "./webhook.js";

export interface IDomainEventDatabase {
  publishOutboxEvent(event: any): any;
  outboxEvents: Map<string, any>;
  notificationPreferences: Map<string, any>;
  notifications: Map<string, any>;
  users: Map<string, any>;
  memberships: Map<string, any>;
  workflows: Map<string, any>;
  collaborators: Map<string, any>;
  approvals: Map<string, any>;
  executions: Map<string, any>;
  webhookSubscriptions: Map<string, any>;
  webhookDeliveries: Map<string, any>;
  createNotification(record: any): any;
  recordAudit(record: any): any;
}

/**
 * Creates and persists a canonical domain event into the transactional outbox.
 */
export async function publishDomainEvent(
  db: IDomainEventDatabase,
  options: {
    type: FlowForgeEvent["type"];
    organizationId: string;
    resourceType: FlowForgeEvent["resourceType"];
    resourceId: string;
    actorId?: string | null;
    correlationId?: string;
    causationId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<FlowForgeEvent> {
  const eventId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const correlationId =
    options.correlationId || `corr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const rawEvent: FlowForgeEvent = {
    id: eventId,
    type: options.type,
    version: "1.0",
    organizationId: options.organizationId,
    actorId: options.actorId || null,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    createdAt: new Date().toISOString(),
    correlationId,
    causationId: options.causationId || null,
    data: options.data || {},
  };

  const parsedEvent = FlowForgeEventSchema.parse(rawEvent);
  const outboxRecord = db.publishOutboxEvent(parsedEvent);

  // Asynchronously dispatch event delivery
  setImmediate(() => {
    dispatchOutboxEvent(db, outboxRecord.id).catch((err) => {
      console.error(`[EventDelivery] Error dispatching outbox event ${outboxRecord.id}:`, err);
    });
  });

  return parsedEvent;
}

/**
 * Resolves recipient user IDs eligible to receive notifications for a given event.
 */
export function resolveEventRecipients(
  db: IDomainEventDatabase,
  event: FlowForgeEvent,
): string[] {
  const recipientIds = new Set<string>();

  // 1. Organization Admins / Owners for operational & failure events
  const orgAdmins = Array.from(db.memberships.values())
    .filter(
      (m: any) =>
        m.organizationId === event.organizationId &&
        (m.role === "OWNER" || m.role === "ADMIN"),
    )
    .map((m: any) => m.userId);

  if (
    event.type === "connection.failed" ||
    event.type === "schedule.execution_failed" ||
    event.type === "workflow.execution.failed"
  ) {
    orgAdmins.forEach((id) => recipientIds.add(id));
  }

  // 2. Workflow owners and collaborators
  if (
    event.type.startsWith("workflow.") ||
    event.resourceType === "workflow" ||
    event.resourceType === "execution"
  ) {
    let workflowId = event.resourceId;
    if (event.resourceType === "execution") {
      const exec = db.executions.get(event.resourceId);
      if (exec) workflowId = exec.workflowId;
    }

    const workflow = db.workflows.get(workflowId);
    if (workflow) {
      if (workflow.createdById) {
        recipientIds.add(workflow.createdById);
      }

      // Add collaborators with MAINTAINER or EDITOR access
      Array.from(db.collaborators.values())
        .filter(
          (c: any) =>
            c.workflowId === workflow.id &&
            (c.role === "MAINTAINER" || c.role === "EDITOR"),
        )
        .forEach((c: any) => recipientIds.add(c.userId));
    }
  }

  // 3. Approvals
  if (event.type.startsWith("approval.")) {
    const approval = db.approvals.get(event.resourceId);
    const assignedUser =
      (event.data?.assignedUserId as string) || approval?.assignedUserId;
    if (assignedUser) {
      recipientIds.add(assignedUser);
    } else {
      // Broadcast to org admins if no single user assigned
      orgAdmins.forEach((id) => recipientIds.add(id));
    }

    if (approval) {
      // If decided, notify execution initiator or workflow creator
      if (event.type === "approval.decided") {
        const exec = db.executions.get(approval.executionId);
        if (exec) {
          const wf = db.workflows.get(exec.workflowId);
          if (wf?.createdById) recipientIds.add(wf.createdById);
        }
      }
    }
  }

  // 4. Targeted collaborator in collaborator events
  if (
    event.type === "workflow.collaborator_added" ||
    event.type === "workflow.collaborator_removed" ||
    event.type === "workflow.ownership_transferred"
  ) {
    const targetUserId =
      (event.data?.targetUserId as string) ||
      (event.data?.collaboratorUserId as string) ||
      (event.data?.newOwnerId as string);
    if (targetUserId) {
      recipientIds.add(targetUserId);
    }
  }

  // Strict multi-tenant verification: Recipient must be an active member of this organization
  const validMemberUserIds = new Set(
    Array.from(db.memberships.values())
      .filter((m: any) => m.organizationId === event.organizationId)
      .map((m: any) => m.userId),
  );

  const filtered = Array.from(recipientIds).filter(
    (id) => validMemberUserIds.has(id) && id !== event.actorId,
  );

  return filtered;
}

/**
 * Formats user-facing notification details (title, message, category, priority, linkUrl).
 */
export function formatNotificationForEvent(event: FlowForgeEvent): {
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  linkUrl: string;
} {
  switch (event.type) {
    case "workflow.execution.started":
      return {
        title: "Workflow Execution Started",
        message: `Execution ${event.resourceId.slice(0, 8)} has started.`,
        category: "WORKFLOW",
        priority: "LOW",
        linkUrl: `/executions/${event.resourceId}`,
      };
    case "workflow.execution.completed":
      return {
        title: "Workflow Execution Completed",
        message: `Execution ${event.resourceId.slice(0, 8)} finished successfully.`,
        category: "WORKFLOW",
        priority: "NORMAL",
        linkUrl: `/executions/${event.resourceId}`,
      };
    case "workflow.execution.failed":
      return {
        title: "Workflow Execution Failed",
        message: `Execution ${event.resourceId.slice(0, 8)} encountered an error: ${String(event.data.error || "Execution failed")}`,
        category: "WORKFLOW",
        priority: "HIGH",
        linkUrl: `/executions/${event.resourceId}`,
      };
    case "workflow.execution.cancelled":
      return {
        title: "Workflow Execution Cancelled",
        message: `Execution ${event.resourceId.slice(0, 8)} was cancelled.`,
        category: "WORKFLOW",
        priority: "NORMAL",
        linkUrl: `/executions/${event.resourceId}`,
      };
    case "approval.requested":
      return {
        title: "Approval Decision Required",
        message: `Approval requested: ${String(event.data.title || "Human review pending")}.`,
        category: "APPROVAL",
        priority: "URGENT",
        linkUrl: `/approvals`,
      };
    case "approval.decided":
      return {
        title: `Approval ${event.data.status === "APPROVED" ? "Approved" : "Rejected"}`,
        message: `Approval request was ${String(event.data.status || "decided")}.`,
        category: "APPROVAL",
        priority: "NORMAL",
        linkUrl: `/approvals`,
      };
    case "workflow.published":
      return {
        title: "New Workflow Version Published",
        message: `Version ${event.data.versionNumber || "new"} was published.`,
        category: "WORKFLOW",
        priority: "NORMAL",
        linkUrl: `/workflows/${event.resourceId}`,
      };
    case "workflow.ownership_transferred":
      return {
        title: "Workflow Ownership Transferred",
        message: `Primary ownership of workflow has been reassigned.`,
        category: "COLLABORATION",
        priority: "HIGH",
        linkUrl: `/workflows/${event.resourceId}`,
      };
    case "workflow.collaborator_added":
      return {
        title: "Added as Workflow Collaborator",
        message: `You were added as ${String(event.data.role || "collaborator")}.`,
        category: "COLLABORATION",
        priority: "NORMAL",
        linkUrl: `/workflows/${event.resourceId}`,
      };
    case "workflow.collaborator_removed":
      return {
        title: "Removed as Workflow Collaborator",
        message: `Your collaborator access on workflow was removed.`,
        category: "COLLABORATION",
        priority: "NORMAL",
        linkUrl: `/workflows`,
      };
    case "connection.failed":
      return {
        title: "Integration Connection Failure",
        message: `Connection '${String(event.data.connectionName || event.resourceId)}' reported authentication or health error.`,
        category: "SYSTEM",
        priority: "HIGH",
        linkUrl: `/settings`,
      };
    case "schedule.execution_failed":
      return {
        title: "Scheduled Trigger Failed",
        message: `Workflow schedule failed to trigger execution.`,
        category: "WORKFLOW",
        priority: "HIGH",
        linkUrl: `/workflows/${event.resourceId}`,
      };
    default:
      return {
        title: "System Notification",
        message: `Event ${event.type} occurred.`,
        category: "SYSTEM",
        priority: "NORMAL",
        linkUrl: `/dashboard`,
      };
  }
}

/**
 * Dispatches an outbox event to in-app notifications, email notifications, and outbound webhooks.
 */
export async function dispatchOutboxEvent(
  db: IDomainEventDatabase,
  outboxEventId: string,
): Promise<any> {
  const outbox = db.outboxEvents.get(outboxEventId);
  if (!outbox || outbox.status === "PUBLISHED") {
    return outbox || null;
  }

  outbox.status = "PROCESSING";
  outbox.attemptCount += 1;
  outbox.lastAttemptAt = new Date();
  db.outboxEvents.set(outbox.id, outbox);

  const event = outbox.payload as FlowForgeEvent;
  const recipients = resolveEventRecipients(db, event);
  const formatted = formatNotificationForEvent(event);

  // A. IN-APP NOTIFICATIONS & EMAIL DELIVERY
  for (const userId of recipients) {
    const prefKey = `${userId}_${formatted.category}`;
    const pref = db.notificationPreferences.get(prefKey);

    const inAppAllowed = pref ? pref.inApp : true;
    const emailAllowed = pref ? pref.email : formatted.category === "APPROVAL" || formatted.priority === "URGENT";

    // 1. In-App Notification
    if (inAppAllowed) {
      db.createNotification({
        organizationId: event.organizationId,
        userId,
        eventId: event.id,
        title: formatted.title,
        message: formatted.message,
        category: formatted.category,
        priority: formatted.priority,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        linkUrl: formatted.linkUrl,
      });
    }

    // 2. Email Delivery
    if (emailAllowed) {
      const user = db.users.get(userId);
      if (user?.email) {
        try {
          await defaultEmailService.sendEmail({
            idempotencyKey: `${event.id}_${userId}`,
            to: user.email,
            subject: `[FlowForge] ${formatted.title}`,
            text: `${formatted.message}\n\nView resource: ${formatted.linkUrl}`,
            html: `<div style="font-family:sans-serif;padding:16px;">
              <h2 style="color:#0f766e;">${formatted.title}</h2>
              <p>${formatted.message}</p>
              <p><a href="${formatted.linkUrl}" style="background:#0f766e;color:#fff;padding:8px 16px;text-decoration:none;border-radius:4px;">View in FlowForge</a></p>
            </div>`,
          });
        } catch (emailErr) {
          console.error(`[EventDelivery] Email dispatch failed for user ${userId}:`, emailErr);
        }
      }
    }
  }

  // B. OUTBOUND WEBHOOK SUBSCRIPTIONS & DELIVERY
  const matchingSubscriptions = Array.from(db.webhookSubscriptions.values()).filter(
    (s: any) =>
      s.organizationId === event.organizationId &&
      s.enabled &&
      (s.events.includes("*") || s.events.includes(event.type)),
  );

  for (const sub of matchingSubscriptions) {
    await executeWebhookDelivery(db, sub, event);
  }

  outbox.status = "PUBLISHED";
  outbox.publishedAt = new Date();
  db.outboxEvents.set(outbox.id, outbox);

  return outbox;
}

/**
 * Executes a single outbound webhook delivery attempt with SSRF defense, HMAC signing, and exponential backoff retry.
 */
export async function executeWebhookDelivery(
  db: IDomainEventDatabase,
  subscription: any,
  event: FlowForgeEvent,
  existingDeliveryId?: string,
): Promise<any> {
  const deliveryId =
    existingDeliveryId || `del_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  let delivery = db.webhookDeliveries.get(deliveryId);
  if (!delivery) {
    delivery = {
      id: deliveryId,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      eventId: event.id,
      url: subscription.url,
      status: "PROCESSING",
      attemptCount: 1,
      maxAttempts: 5,
      requestPayload: event as any,
      createdAt: now,
    };
  } else {
    delivery.status = "PROCESSING";
    delivery.attemptCount += 1;
  }

  db.webhookDeliveries.set(deliveryId, delivery);

  // 1. SSRF Security Check
  if (isPrivateOrBlockedDestination(subscription.url)) {
    delivery.status = "FAILED_PERMANENTLY";
    delivery.error = `SSRF Prevention: Blocked destination '${subscription.url}'`;
    delivery.completedAt = new Date();
    db.webhookDeliveries.set(deliveryId, delivery);
    return delivery;
  }

  // 2. Compute HMAC Signature Header
  const timestamp = Date.now();
  const rawPayload = JSON.stringify(event);
  const { headerValue } = signWebhookPayload(subscription.secret, rawPayload, timestamp);

  // 3. Execute HTTP Dispatch
  const startTime = Date.now();
  try {
    const res = await executeSafeHttpRequest({
      url: subscription.url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "FlowForge-Webhook-Deliverer/1.0",
        "X-FlowForge-Signature": headerValue,
        "X-FlowForge-Event": event.type,
        "X-FlowForge-Delivery": deliveryId,
        "X-FlowForge-Timestamp": String(timestamp),
      },
      body: rawPayload,
      timeoutMs: 8000,
      maxRetries: 0,
    });

    delivery.durationMs = Date.now() - startTime;
    delivery.statusCode = res.status;
    delivery.responseBody =
      typeof res.data === "string" ? res.data.slice(0, 1000) : JSON.stringify(res.data).slice(0, 1000);

    if (res.status >= 200 && res.status < 300) {
      delivery.status = "SUCCEEDED";
      delivery.completedAt = new Date();
      delivery.error = null;
    } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      delivery.status = "FAILED_PERMANENTLY";
      delivery.error = `HTTP ${res.status}: Client rejected webhook payload`;
      delivery.completedAt = new Date();
    } else {
      scheduleDeliveryRetry(delivery);
    }
  } catch (httpErr: any) {
    delivery.durationMs = Date.now() - startTime;
    delivery.error = httpErr.message || "Network delivery failed";

    if (httpErr.message && httpErr.message.includes("SSRF")) {
      delivery.status = "FAILED_PERMANENTLY";
      delivery.completedAt = new Date();
    } else {
      scheduleDeliveryRetry(delivery);
    }
  }

  db.webhookDeliveries.set(deliveryId, delivery);
  return delivery;
}

function scheduleDeliveryRetry(delivery: any): void {
  if (delivery.attemptCount >= delivery.maxAttempts) {
    delivery.status = "DEAD_LETTERED";
    delivery.completedAt = new Date();
    return;
  }

  delivery.status = "RETRY_SCHEDULED";
  const baseSeconds = 5;
  const backoffSec = baseSeconds * Math.pow(2, delivery.attemptCount - 1);
  const jitterMs = Math.floor(Math.random() * 2000);
  const delayMs = backoffSec * 1000 + jitterMs;

  delivery.nextRetryAt = new Date(Date.now() + delayMs);
}

/**
 * Manually replays a failed or dead-lettered webhook delivery.
 */
export async function replayWebhookDelivery(
  db: IDomainEventDatabase,
  deliveryId: string,
  actorUserId?: string,
): Promise<any> {
  const delivery = db.webhookDeliveries.get(deliveryId);
  if (!delivery) {
    throw new Error("Webhook delivery record not found.");
  }

  const subscription = db.webhookSubscriptions.get(delivery.subscriptionId);
  if (!subscription) {
    throw new Error("Target webhook subscription no longer exists.");
  }

  if (!subscription.enabled) {
    throw new Error("Target webhook subscription is disabled.");
  }

  delivery.attemptCount = 0;
  delivery.status = "PENDING";
  delivery.error = null;
  delivery.nextRetryAt = null;

  db.recordAudit({
    organizationId: delivery.organizationId,
    userId: actorUserId,
    action: "webhook_delivery:replay",
    resourceType: "webhook_delivery",
    resourceId: deliveryId,
    metadata: { subscriptionId: subscription.id, eventId: delivery.eventId },
  });

  const event = delivery.requestPayload as unknown as FlowForgeEvent;
  return executeWebhookDelivery(db, subscription, event, delivery.id);
}
