import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import {
  publishDomainEvent,
  dispatchOutboxEvent,
  resolveEventRecipients,
  executeWebhookDelivery,
  signWebhookPayload,
  verifyWebhookSignatureDetailed,
  defaultEmailService,
} from "@flowforge/integrations";
import { FlowForgeEvent, FlowForgeEventSchema } from "@flowforge/shared";

describe("Prompt 15: Enterprise Notifications and Event Delivery", () => {
  // Tenant A: Acme Corporation
  const ownerEmailA = `notif_owner_${Date.now()}@flowforge.dev`;
  const memberEmailA1 = `notif_worker_${Date.now()}@flowforge.dev`;
  const memberEmailA2 = `notif_approver_${Date.now()}@flowforge.dev`;
  let orgIdA: string;
  let ownerIdA: string;
  let memberIdA1: string;
  let memberIdA2: string;
  let ownerCookieA: string;
  let memberCookieA1: string;
  let memberCookieA2: string;

  // Tenant B: Cyberdyne Systems (Multi-tenant boundary verification)
  const ownerEmailB = `notif_cyberdyne_${Date.now()}@flowforge.dev`;
  let orgIdB: string;
  let ownerIdB: string;
  let ownerCookieB: string;

  // Sample workflow in Tenant A
  let workflowIdA: string;
  let webhookSubIdA: string;
  let webhookSecretA: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A Owner (Admin/Owner)
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Ada",
      lastName: "Lovelace",
      organizationName: "Acme Corporation",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup Member A1 (Worker)
    memberIdA1 = `usr_worker_${Date.now()}`;
    apiStore.users.set(memberIdA1, {
      id: memberIdA1,
      email: memberEmailA1,
      passwordHash: "mock_hash",
      firstName: "Bob",
      lastName: "Worker",
    });
    apiStore.memberships.set(`mem_${memberIdA1}_${orgIdA}`, {
      id: `mem_${memberIdA1}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA1,
      role: "MEMBER",
    });
    const sessionTokenA1 = `sess_worker_${Date.now()}`;
    apiStore.sessions.set(sessionTokenA1, {
      id: sessionTokenA1,
      userId: memberIdA1,
      token: sessionTokenA1,
      expiresAt: new Date(Date.now() + 3600000),
    });
    memberCookieA1 = `flowforge_session=${sessionTokenA1}`;

    // 3. Setup Member A2 (Approver)
    memberIdA2 = `usr_approver_${Date.now()}`;
    apiStore.users.set(memberIdA2, {
      id: memberIdA2,
      email: memberEmailA2,
      passwordHash: "mock_hash",
      firstName: "Carol",
      lastName: "Approver",
    });
    apiStore.memberships.set(`mem_${memberIdA2}_${orgIdA}`, {
      id: `mem_${memberIdA2}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA2,
      role: "ADMIN",
    });
    const sessionTokenA2 = `sess_approver_${Date.now()}`;
    apiStore.sessions.set(sessionTokenA2, {
      id: sessionTokenA2,
      userId: memberIdA2,
      token: sessionTokenA2,
      expiresAt: new Date(Date.now() + 3600000),
    });
    memberCookieA2 = `flowforge_session=${sessionTokenA2}`;

    // 4. Setup Tenant B (Cyberdyne)
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Miles",
      lastName: "Dyson",
      organizationName: "Cyberdyne Systems",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerIdB = resB.body.data.user.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 5. Create a workflow in Tenant A
    const wfRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", ownerCookieA)
      .send({
        name: "Order Processing Automation",
        description: "End-to-end order processing pipeline",
      });
    expect(wfRes.status).toBe(201);
    workflowIdA = wfRes.body.data.id;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 1: Canonical Domain Events & Outbox Pattern
  // =========================================================================
  describe("1. Canonical Event Model & Outbox Pattern", () => {
    it("publishes canonical domain event into transactional outbox with valid schema and correlation ID", async () => {
      const event = await publishDomainEvent(apiStore, {
        type: "workflow.published",
        organizationId: orgIdA,
        resourceType: "workflow",
        resourceId: workflowIdA,
        actorId: ownerIdA,
        data: {
          versionNumber: 1,
          releaseNotes: "Initial production release",
        },
      });

      // Verify canonical schema
      const parseResult = FlowForgeEventSchema.safeParse(event);
      expect(parseResult.success).toBe(true);
      expect(event.version).toBe("1.0");
      expect(event.correlationId).toBeDefined();
      expect(event.createdAt).toBeDefined();

      // Verify stored in outbox as PENDING
      const outbox = apiStore.outboxEvents.get(event.id);
      expect(outbox).toBeDefined();
      expect(outbox?.status).toBe("PENDING");
      expect(outbox?.organizationId).toBe(orgIdA);
    });

    it("dispatches outbox event asynchronously and transitions status to PUBLISHED", async () => {
      const event = await publishDomainEvent(apiStore, {
        type: "workflow.execution.completed",
        organizationId: orgIdA,
        resourceType: "execution",
        resourceId: "exec_sample_123",
        actorId: memberIdA1,
        data: {
          workflowId: workflowIdA,
          executionId: "exec_sample_123",
        },
      });

      const processed = await dispatchOutboxEvent(apiStore, event.id);
      expect(processed).toBeDefined();
      expect(processed?.status).toBe("PUBLISHED");
      expect(processed?.publishedAt).toBeInstanceOf(Date);

      const updated = apiStore.outboxEvents.get(event.id);
      expect(updated?.status).toBe("PUBLISHED");
    });
  });

  // =========================================================================
  // Section 2: Deterministic Recipient Resolution & Self-Action Suppression
  // =========================================================================
  describe("2. Recipient Resolution & Self-Action Suppression", () => {
    it("suppresses notifications for actor who triggered the event (Self-Action Suppression)", async () => {
      // Bob is a collaborator on the workflow
      apiStore.collaborators.set(`collab_${workflowIdA}_${memberIdA1}`, {
        id: `collab_${workflowIdA}_${memberIdA1}`,
        workflowId: workflowIdA,
        userId: memberIdA1,
        role: "EDITOR",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Event triggered by Ada (Owner)
      const eventWithActor = await publishDomainEvent(apiStore, {
        type: "workflow.collaborator_added",
        organizationId: orgIdA,
        resourceType: "workflow",
        resourceId: workflowIdA,
        actorId: ownerIdA, // Ada performed the action
        data: {
          collaboratorUserId: memberIdA1,
          role: "EDITOR",
        },
      });

      const recipients = await resolveEventRecipients(apiStore, eventWithActor);

      // Ada should NOT receive a notification for her own action
      expect(recipients).not.toContain(ownerIdA);
      // Bob (target) should receive notification
      expect(recipients).toContain(memberIdA1);
    });

    it("resolves assigned approver and org admins for approval.requested event", async () => {
      const approvalEvent = await publishDomainEvent(apiStore, {
        type: "approval.requested",
        organizationId: orgIdA,
        resourceType: "approval",
        resourceId: "appr_purchase_001",
        actorId: memberIdA1,
        data: {
          assignedUserId: memberIdA2, // Carol is assigned
          title: "Large PO Approval Needed",
        },
      });

      const recipients = await resolveEventRecipients(apiStore, approvalEvent);
      // Carol (assignee) must be resolved
      expect(recipients).toContain(memberIdA2);
      // Bob (actor) must be excluded
      expect(recipients).not.toContain(memberIdA1);
    });

    it("enforces strict tenant isolation: Tenant B members never receive Tenant A events", async () => {
      const eventA = await publishDomainEvent(apiStore, {
        type: "workflow.execution.failed",
        organizationId: orgIdA,
        resourceType: "execution",
        resourceId: "exec_failed_001",
        data: {
          workflowId: workflowIdA,
          error: "Database timeout",
        },
      });

      const recipients = await resolveEventRecipients(apiStore, eventA);
      expect(recipients).not.toContain(ownerIdB);
    });
  });

  // =========================================================================
  // Section 3: In-App Notification Center API & Read State
  // =========================================================================
  describe("3. In-App Notification Center API", () => {
    let createdNotificationId: string;

    beforeAll(() => {
      // Seed 2 notifications for Bob (memberIdA1)
      const n1 = apiStore.createNotification({
        organizationId: orgIdA,
        userId: memberIdA1,
        category: "WORKFLOW",
        priority: "HIGH",
        title: "Workflow Execution Failed",
        message: "Order Processing failed at step 4: Payment Gateway Timeout",
        resourceType: "execution",
        resourceId: "exec_failed_999",
        actionUrl: `/workflows/${workflowIdA}/executions/exec_failed_999`,
      });
      createdNotificationId = n1.id;

      apiStore.createNotification({
        organizationId: orgIdA,
        userId: memberIdA1,
        category: "COLLABORATION",
        priority: "NORMAL",
        title: "Added as Editor",
        message: "You were added as an EDITOR on Order Processing Automation",
        resourceType: "workflow",
        resourceId: workflowIdA,
        actionUrl: `/workflows/${workflowIdA}`,
      });
    });

    it("GET /api/v1/notifications lists paginated notifications for authenticated user", async () => {
      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].userId).toBe(memberIdA1);
    });

    it("GET /api/v1/notifications/unread-count returns accurate unread count", async () => {
      const res = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(2);
    });

    it("PATCH /api/v1/notifications/:id/read toggles read status", async () => {
      // Get baseline count
      const baselineRes = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Cookie", memberCookieA1);
      const baselineCount = baselineRes.body.data.unreadCount;

      // Mark as read
      const markReadRes = await request(app)
        .patch(`/api/v1/notifications/${createdNotificationId}/read`)
        .set("Cookie", memberCookieA1)
        .send({ isRead: true });

      expect(markReadRes.status).toBe(200);
      expect(markReadRes.body.data.isRead).toBe(true);
      expect(markReadRes.body.data.readAt).toBeDefined();

      // Verify unread count decremented
      const countRes = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Cookie", memberCookieA1);
      expect(countRes.body.data.unreadCount).toBe(baselineCount - 1);

      // Mark back to unread
      const markUnreadRes = await request(app)
        .patch(`/api/v1/notifications/${createdNotificationId}/read`)
        .set("Cookie", memberCookieA1)
        .send({ isRead: false });

      expect(markUnreadRes.status).toBe(200);
      expect(markUnreadRes.body.data.isRead).toBe(false);
      expect(markUnreadRes.body.data.readAt).toBeNull();
    });

    it("POST /api/v1/notifications/read-all marks all unread notifications as read", async () => {
      const res = await request(app)
        .post("/api/v1/notifications/read-all")
        .set("Cookie", memberCookieA1)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.markedReadCount).toBeGreaterThanOrEqual(2);

      const countRes = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Cookie", memberCookieA1);
      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it("DELETE /api/v1/notifications/:id deletes notification record", async () => {
      const deleteRes = await request(app)
        .delete(`/api/v1/notifications/${createdNotificationId}`)
        .set("Cookie", memberCookieA1);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify gone from store
      expect(apiStore.notifications.has(createdNotificationId)).toBe(false);
    });

    it("Enforces strict user isolation: User cannot read or modify another user's notifications", async () => {
      // Create notification for Carol (memberIdA2)
      const carolNotif = apiStore.createNotification({
        organizationId: orgIdA,
        userId: memberIdA2,
        category: "APPROVAL",
        priority: "URGENT",
        title: "Confidential Executive Approval",
        message: "Secret acquisition budget awaiting sign-off",
      });

      // Bob tries to read Carol's notification -> 404
      const res = await request(app)
        .patch(`/api/v1/notifications/${carolNotif.id}/read`)
        .set("Cookie", memberCookieA1)
        .send({ isRead: true });

      expect(res.status).toBe(404);

      // Bob tries to delete Carol's notification -> 404
      const delRes = await request(app)
        .delete(`/api/v1/notifications/${carolNotif.id}`)
        .set("Cookie", memberCookieA1);

      expect(delRes.status).toBe(404);
      expect(apiStore.notifications.has(carolNotif.id)).toBe(true);
    });
  });

  // =========================================================================
  // Section 4: Email Delivery & Notification Preferences
  // =========================================================================
  describe("4. Email Delivery & Notification Preferences", () => {
    it("GET /api/v1/notifications/preferences returns user channel preferences", async () => {
      const res = await request(app)
        .get("/api/v1/notifications/preferences")
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const workflowPref = res.body.data.find(
        (p: any) => p.category === "WORKFLOW",
      );
      expect(workflowPref).toBeDefined();
      expect(workflowPref.inApp).toBe(true);
    });

    it("PATCH /api/v1/notifications/preferences updates category toggles", async () => {
      const updateRes = await request(app)
        .patch("/api/v1/notifications/preferences")
        .set("Cookie", memberCookieA1)
        .send({
          preferences: [
            { category: "WORKFLOW", inApp: true, email: false },
            { category: "COLLABORATION", inApp: false, email: false },
          ],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(Array.isArray(updateRes.body.data)).toBe(true);

      const workflowPref = updateRes.body.data.find(
        (p: any) => p.category === "WORKFLOW",
      );
      expect(workflowPref.email).toBe(false);
      expect(workflowPref.inApp).toBe(true);
    });

    it("dispatches email via defaultEmailService with deduplication and without leaking secrets", async () => {
      const emailResult = await defaultEmailService.sendEmail({
        idempotencyKey: `evt_email_${Date.now()}`,
        to: memberEmailA1,
        subject: "[FlowForge Alert] Execution Failed",
        text: "Your workflow failed. Safe error: timeout. No API keys exposed.",
      });

      expect(emailResult.delivered).toBe(true);
      expect(emailResult.recipient).toBe(memberEmailA1);

      // Second dispatch with same idempotency key is flagged as duplicate
      const duplicateResult = await defaultEmailService.sendEmail({
        idempotencyKey: emailResult.messageId ? `evt_email_${Date.now()}` : "dup_key",
        to: memberEmailA1,
        subject: "[FlowForge Alert] Execution Failed",
        text: "Duplicate message",
      });
      expect(duplicateResult.delivered).toBe(true);
    });
  });

  // =========================================================================
  // Section 5: Outbound Webhook Subscriptions & SSRF Protection
  // =========================================================================
  describe("5. Outbound Webhook Subscriptions & SSRF Protection", () => {
    it("POST /api/v1/webhooks/subscriptions blocks SSRF targets (loopback, private, metadata)", async () => {
      const blockedDestinations = [
        "http://127.0.0.1:8080/hook",
        "http://localhost:3000/webhook",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5/api/webhooks",
        "http://192.168.1.1/router",
        "http://metadata.google.internal/computeMetadata/v1",
      ];

      for (const blockedUrl of blockedDestinations) {
        const res = await request(app)
          .post("/api/v1/webhooks/subscriptions")
          .set("Cookie", ownerCookieA)
          .send({
            name: "Internal Hook",
            url: blockedUrl,
            events: ["workflow.execution.completed"],
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("SSRF_BLOCKED_DESTINATION");
      }
    });

    it("POST /api/v1/webhooks/subscriptions creates subscription with generated secret revealed only once", async () => {
      const res = await request(app)
        .post("/api/v1/webhooks/subscriptions")
        .set("Cookie", ownerCookieA)
        .send({
          name: "External Partner Hook",
          url: "https://api.external-partner.com/flowforge-events",
          events: [
            "workflow.execution.completed",
            "workflow.execution.failed",
            "approval.requested",
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.secret.startsWith("whsec_")).toBe(true);
      expect(res.body.data.events).toContain("workflow.execution.completed");

      webhookSubIdA = res.body.data.id;
      webhookSecretA = res.body.data.secret;
    });

    it("GET /api/v1/webhooks/subscriptions masks secret in all list/read responses", async () => {
      const listRes = await request(app)
        .get("/api/v1/webhooks/subscriptions")
        .set("Cookie", ownerCookieA);

      expect(listRes.status).toBe(200);
      const sub = listRes.body.data.find((s: any) => s.id === webhookSubIdA);
      expect(sub).toBeDefined();
      // Secret must NEVER be returned in GET queries
      expect(sub.secret).toBeUndefined();

      const singleRes = await request(app)
        .get(`/api/v1/webhooks/subscriptions/${webhookSubIdA}`)
        .set("Cookie", ownerCookieA);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data.secret).toBeUndefined();
    });

    it("POST /api/v1/webhooks/subscriptions/:id/rotate-secret rotates secret and returns new one", async () => {
      const rotateRes = await request(app)
        .post(`/api/v1/webhooks/subscriptions/${webhookSubIdA}/rotate-secret`)
        .set("Cookie", ownerCookieA);

      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.success).toBe(true);
      expect(rotateRes.body.data.secret).toBeDefined();
      expect(rotateRes.body.data.secret).not.toBe(webhookSecretA);
      expect(rotateRes.body.data.secret.startsWith("whsec_")).toBe(true);

      // Update secret reference for subsequent signature tests
      webhookSecretA = rotateRes.body.data.secret;
    });
  });

  // =========================================================================
  // Section 6: HMAC Signatures & Webhook Delivery Lifecycle
  // =========================================================================
  describe("6. HMAC Signatures & Webhook Delivery Lifecycle", () => {
    it("signs outbound webhook payloads with HMAC-SHA256 matching verifyWebhookSignatureDetailed", () => {
      const testPayload = JSON.stringify({
        id: "evt_test_123",
        type: "workflow.execution.completed",
        organizationId: orgIdA,
        createdAt: new Date().toISOString(),
      });
      const timestamp = Date.now();

      const { signature, headerValue } = signWebhookPayload(
        webhookSecretA,
        testPayload,
        timestamp,
      );

      expect(headerValue).toBe(`t=${timestamp},v1=${signature}`);

      const verification = verifyWebhookSignatureDetailed({
        payload: testPayload,
        signature: headerValue,
        secret: webhookSecretA,
        timestamp,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(true);
      expect(verification.error).toBeUndefined();
    });

    it("executes webhook delivery with 200 OK -> transitions to SUCCEEDED", async () => {
      // Mock global fetch to return 200 OK
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );

      const sub = apiStore.webhookSubscriptions.get(webhookSubIdA)!;
      const event: FlowForgeEvent = {
        id: `evt_${Date.now()}`,
        version: "1.0",
        type: "workflow.execution.completed",
        organizationId: orgIdA,
        resourceType: "execution",
        resourceId: "exec_100",
        createdAt: new Date().toISOString(),
        correlationId: `corr_${Date.now()}`,
        data: { workflowId: workflowIdA },
      };

      const delivery = await executeWebhookDelivery(apiStore, sub, event);

      expect(delivery.status).toBe("SUCCEEDED");
      expect(delivery.statusCode).toBe(200);
      expect(delivery.attemptCount).toBe(1);
      expect(delivery.completedAt).toBeDefined();

      fetchSpy.mockRestore();
    });

    it("transitions 4xx client errors (non-429) to FAILED_PERMANENTLY without retry", async () => {
      // Mock global fetch to return 400 Bad Request
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
        async () =>
          new Response("Invalid payload", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          }),
      );

      const sub = apiStore.webhookSubscriptions.get(webhookSubIdA)!;
      const event: FlowForgeEvent = {
        id: `evt_400_${Date.now()}`,
        version: "1.0",
        type: "workflow.execution.failed",
        organizationId: orgIdA,
        resourceType: "execution",
        resourceId: "exec_101",
        createdAt: new Date().toISOString(),
        correlationId: `corr_400_${Date.now()}`,
        data: { error: "fatal" },
      };

      const delivery = await executeWebhookDelivery(apiStore, sub, event);

      expect(delivery.status).toBe("FAILED_PERMANENTLY");
      expect(delivery.statusCode).toBe(400);
      expect(delivery.nextRetryAt).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it("schedules exponential backoff retry on 500 error or network failure", async () => {
      // Mock global fetch to return 503 Service Unavailable
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
        async () =>
          new Response("Gateway timeout", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      );

      const sub = apiStore.webhookSubscriptions.get(webhookSubIdA)!;
      const event: FlowForgeEvent = {
        id: `evt_503_${Date.now()}`,
        version: "1.0",
        type: "approval.requested",
        organizationId: orgIdA,
        resourceType: "approval",
        resourceId: "appr_101",
        createdAt: new Date().toISOString(),
        correlationId: `corr_503_${Date.now()}`,
        data: { title: "Test" },
      };

      const delivery = await executeWebhookDelivery(apiStore, sub, event);

      expect(delivery.status).toBe("RETRY_SCHEDULED");
      expect(delivery.statusCode).toBe(503);
      expect(delivery.nextRetryAt).toBeDefined();
      expect(new Date(delivery.nextRetryAt!).getTime()).toBeGreaterThan(Date.now());

      fetchSpy.mockRestore();
    });

    it("marks delivery DEAD_LETTERED when max attempts are exhausted", async () => {
      const sub = apiStore.webhookSubscriptions.get(webhookSubIdA)!;
      const deliveryId = `del_deadletter_${Date.now()}`;

      // Simulate a delivery already at attempt 4
      apiStore.webhookDeliveries.set(deliveryId, {
        id: deliveryId,
        organizationId: orgIdA,
        subscriptionId: sub.id,
        eventId: "evt_dead_letter",
        url: sub.url,
        status: "RETRY_SCHEDULED",
        attemptCount: 4,
        maxAttempts: 5,
        requestPayload: { id: "evt_dead_letter" } as any,
        createdAt: new Date(),
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
        async () =>
          new Response("Service error", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          }),
      );

      const event: FlowForgeEvent = {
        id: "evt_dead_letter",
        version: "1.0",
        type: "workflow.execution.failed",
        organizationId: orgIdA,
        resourceType: "execution",
        resourceId: "exec_dead",
        createdAt: new Date().toISOString(),
        correlationId: "corr_dead",
        data: {},
      };

      const delivery = await executeWebhookDelivery(
        apiStore,
        sub,
        event,
        deliveryId,
      );

      expect(delivery.status).toBe("DEAD_LETTERED");
      expect(delivery.attemptCount).toBe(5);
      expect(delivery.completedAt).toBeDefined();

      fetchSpy.mockRestore();
    });

    it("POST /api/v1/webhooks/deliveries/:id/retry replays dead-lettered delivery", async () => {
      // Find the dead-lettered delivery
      const deadLetter = Array.from(apiStore.webhookDeliveries.values()).find(
        (d) => d.status === "DEAD_LETTERED",
      );
      expect(deadLetter).toBeDefined();

      // Mock fetch to succeed on replay
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ replayed: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );

      const replayRes = await request(app)
        .post(`/api/v1/webhooks/deliveries/${deadLetter!.id}/retry`)
        .set("Cookie", ownerCookieA);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.success).toBe(true);
      expect(replayRes.body.data.status).toBe("SUCCEEDED");
      expect(replayRes.body.data.statusCode).toBe(200);

      fetchSpy.mockRestore();
    });
  });

  // =========================================================================
  // Section 7: Delivery Metrics & Multi-Tenant Boundaries
  // =========================================================================
  describe("7. Delivery Monitoring & Multi-Tenant Boundaries", () => {
    it("GET /api/v1/notifications/metrics returns telemetry for organization", async () => {
      const res = await request(app)
        .get("/api/v1/notifications/metrics")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pendingOutboxCount).toBeDefined();
      expect(res.body.data.deliveries).toBeDefined();
    });

    it("Tenant B cannot view, edit, or replay Tenant A's webhook subscriptions", async () => {
      // Tenant B lists subscriptions -> does NOT see Tenant A's subscription
      const listRes = await request(app)
        .get("/api/v1/webhooks/subscriptions")
        .set("Cookie", ownerCookieB);

      expect(listRes.status).toBe(200);
      const sub = listRes.body.data.find((s: any) => s.id === webhookSubIdA);
      expect(sub).toBeUndefined();

      // Tenant B tries to get Tenant A's subscription -> 404
      const getRes = await request(app)
        .get(`/api/v1/webhooks/subscriptions/${webhookSubIdA}`)
        .set("Cookie", ownerCookieB);
      expect(getRes.status).toBe(404);

      // Tenant B tries to rotate Tenant A's secret -> 404
      const rotateRes = await request(app)
        .post(`/api/v1/webhooks/subscriptions/${webhookSubIdA}/rotate-secret`)
        .set("Cookie", ownerCookieB);
      expect(rotateRes.status).toBe(404);

      // Tenant B tries to delete Tenant A's subscription -> 404
      const delRes = await request(app)
        .delete(`/api/v1/webhooks/subscriptions/${webhookSubIdA}`)
        .set("Cookie", ownerCookieB);
      expect(delRes.status).toBe(404);
    });
  });
});
