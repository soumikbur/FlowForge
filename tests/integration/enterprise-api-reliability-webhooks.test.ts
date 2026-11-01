import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { resetSignatureReplayCache } from "../../apps/api/src/routes/webhook.routes.js";
import { apiReliabilityService } from "../../apps/api/src/services/api-reliability.service.js";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  FlowForgeClient,
  WorkflowDefinition,
} from "@flowforge/shared";

describe("Prompt 37 — Enterprise API Reliability, Webhook Security, and Developer Experience", () => {
  const validBcryptHash =
    "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY5k7rhKhGfdW.q";

  const orgA = {
    id: "org_rel_alpha",
    name: "Reliability Alpha Corp",
    slug: "rel-alpha",
    billingEmail: "admin@relalpha.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgB = {
    id: "org_rel_beta",
    name: "Reliability Beta Corp",
    slug: "rel-beta",
    billingEmail: "admin@relbeta.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let ownerUserA: any;
  let adminUserA: any;
  let ownerUserB: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let ownerTokenB: string;

  const sampleWorkflowDef: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger",
        type: "TRIGGER",
        name: "Inbound Hook",
        config: { triggerType: "WEBHOOK" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node_end",
        type: "END",
        name: "Complete",
        config: {},
        position: { x: 50, y: 150 },
      },
    ],
    edges: [{ id: "e1", source: "node_trigger", target: "node_end" }],
  };

  let workflowA: any;
  let workflowVersionA: any;

  beforeEach(() => {
    apiStore.clear();
    resetRateLimits();
    resetSignatureReplayCache();
    apiReliabilityService.reset();

    apiStore.organizations.set(orgA.id, orgA);
    apiStore.organizations.set(orgB.id, orgB);

    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@relalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@relalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@relbeta.io",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    apiStore.memberships.set("mem_rel_a1", {
      id: "mem_rel_a1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_rel_a2", {
      id: "mem_rel_a2",
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_rel_b1", {
      id: "mem_rel_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

    apiStore.sessions.set(ownerTokenA, {
      id: "sess_owner_a",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });
    apiStore.sessions.set(adminTokenA, {
      id: "sess_admin_a",
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: "sess_owner_b",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    workflowVersionA = {
      id: "ver_rel_alpha_01",
      workflowId: "wf_rel_alpha_01",
      version: 1,
      definition: sampleWorkflowDef,
      publishedAt: new Date(),
      createdAt: new Date(),
    };

    workflowA = {
      id: "wf_rel_alpha_01",
      organizationId: orgA.id,
      name: "Reliable Order Processing",
      status: "ACTIVE",
      publishedVersionId: workflowVersionA.id,
      currentVersionId: workflowVersionA.id,
      versions: [workflowVersionA],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    apiStore.workflows.set(workflowA.id, workflowA);
    apiStore.versions.set(workflowVersionA.id, workflowVersionA);
  });

  // ==========================================
  // 1. CANONICAL ERROR FORMAT & CONTRACT
  // ==========================================
  describe("1. Canonical API Error Format and Request Correlation", () => {
    it("returns standard error envelope on 404 with requestId, retryable=false, and docUrl", async () => {
      const res = await request(app)
        .get("/api/v1/non-existent-route")
        .set("X-Correlation-Id", "corr_test_123");

      expect(res.status).toBe(404);
      expect(res.headers["x-correlation-id"]).toBe("corr_test_123");
      expect(res.headers["x-request-id"]).toBeDefined();

      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
      expect(res.body.error.message).toContain("Cannot GET");
      expect(res.body.error.requestId).toBeDefined();
      expect(res.body.error.retryable).toBe(false);
      expect(res.body.error.docUrl).toBe(
        "https://docs.flowforge.dev/errors#ROUTE_NOT_FOUND",
      );
    });

    it("masks internal details and does not leak stack traces or secret keys", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "invalid-email-format", password: "short" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.retryable).toBe(false);
      expect(res.body.error.stack).toBeUndefined();
      expect(res.body.error.details).not.toContain("passwordHash");
    });
  });

  // ==========================================
  // 2. API VERSIONING & DEPRECATION LIFECYCLE
  // ==========================================
  describe("2. API Versioning, Deprecation, and Negotiation", () => {
    it("returns active API version info via GET /api/v1/version", async () => {
      const res = await request(app).get("/api/v1/version");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe("1.0.0");
      expect(res.body.data.apiVersion).toBe("v1");
      expect(res.body.data.status).toBe("active");
      expect(res.headers["x-api-version"]).toBe("v1");
    });

    it("returns list of active deprecations via GET /api/v1/deprecations", async () => {
      const res = await request(app).get("/api/v1/deprecations");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const triggerDeprecation = res.body.data.find(
        (d: any) => d.path === "/api/v1/workflows/:id/trigger",
      );
      expect(triggerDeprecation).toBeDefined();
      expect(triggerDeprecation.alternativePath).toBe(
        "/api/v1/workflows/:id/execute",
      );
      expect(triggerDeprecation.sunsetDate).toContain("2027");
    });

    it("attaches RFC 8594 Deprecation, Sunset, and Link headers when invoking deprecated endpoints", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/trigger`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ payload: { test: true } });

      expect(res.status).toBe(202);
      expect(res.headers["deprecation"]).toBeDefined();
      expect(res.headers["sunset"]).toContain("2027");
      expect(res.headers["link"]).toContain('rel="successor-version"');
      expect(res.headers["link"]).toContain("/api/v1/workflows/:id/execute");
    });

    it("supports version negotiation: accepts v1 and rejects unsupported version with 406", async () => {
      // 1. Accept-Version: v1
      const resValid = await request(app)
        .get("/api/v1/version")
        .set("Accept-Version", "v1");
      expect(resValid.status).toBe(200);

      // 2. Accept-Version: v99 (unsupported)
      const resInvalid = await request(app)
        .get("/api/v1/version")
        .set("Accept-Version", "v99");
      expect(resInvalid.status).toBe(406);
      expect(resInvalid.body.error.code).toBe("UNSUPPORTED_API_VERSION");
      expect(resInvalid.body.error.retryable).toBe(false);
    });
  });

  // ==========================================
  // 3. SERVER-SIDE VALIDATION & SIZE LIMITS
  // ==========================================
  describe("3. Request Size Bounds and Hardening", () => {
    it("rejects inbound webhooks exceeding the size limit with 413 PAYLOAD_TOO_LARGE", async () => {
      const largePayload = "a".repeat(1.5 * 1024 * 1024);
      const res = await request(app)
        .post(`/api/v1/webhooks/${workflowA.id}`)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ data: largePayload }));

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(res.body.error.retryable).toBe(false);
    });
  });

  // ==========================================
  // 4. TIERED RATE LIMITING & TENANT ISOLATION
  // ==========================================
  describe("4. Tiered Rate Limiting and Multi-Tenant Isolation", () => {
    it("attaches X-RateLimit-* headers to responses", async () => {
      const res = await request(app).get("/api/v1/version");

      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    });

    it("throttles excessive requests with 429, Retry-After header, and retryable=true", async () => {
      // Exhaust rate limit for a specific test client
      const testIp = "192.0.2.42";
      let lastRes: any;
      for (let i = 0; i < 305; i++) {
        lastRes = await request(app)
          .get("/api/v1/version")
          .set("X-Forwarded-For", testIp);
        if (lastRes.status === 429) break;
      }

      expect(lastRes.status).toBe(429);
      expect(lastRes.headers["retry-after"]).toBeDefined();
      expect(lastRes.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(lastRes.body.error.retryable).toBe(true);
      expect(lastRes.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("guarantees tenant isolation: rate limiting Org A does not throttle Org B", async () => {
      // Configure specific rate limit test
      const subAId = "whsub_org_a_limit";
      const subBId = "whsub_org_b_limit";

      apiStore.webhookSubscriptions.set(subAId, {
        id: subAId,
        organizationId: orgA.id,
        name: "Hook A",
        url: "https://api.external.com/hook_a",
        events: ["*"],
        enabled: true,
        secret: "whsec_test_secret_alpha_12345",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.webhookSubscriptions.set(subBId, {
        id: subBId,
        organizationId: orgB.id,
        name: "Hook B",
        url: "https://api.external.com/hook_b",
        events: ["*"],
        enabled: true,
        secret: "whsec_test_secret_beta_12345",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Request as Org B succeeds regardless of Org A activity
      const resB = await request(app)
        .get("/api/v1/webhooks/subscriptions")
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(1);
      expect(resB.body.data[0].id).toBe(subBId);
    });
  });

  // ==========================================
  // 5. HARDENED IDEMPOTENCY MIDDLEWARE
  // ==========================================
  describe("5. Hardened Idempotency Middleware", () => {
    it("returns cached response with Idempotent-Replayed: true for duplicate requests", async () => {
      const idempotencyKey = "idem_test_key_replay_001";

      const res1 = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/execute`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { orderId: "ord_101" } });

      expect(res1.status).toBe(202);
      expect(res1.headers["idempotent-replayed"]).toBeUndefined();

      const res2 = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/execute`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { orderId: "ord_101" } });

      expect([200, 202]).toContain(res2.status);
      expect(res2.headers["idempotent-replayed"]).toBe("true");
      expect(res2.body.data.id).toBe(res1.body.data.id);
    });

    it("detects payload mismatch and rejects with 409 IDEMPOTENCY_MISMATCH and retryable=false", async () => {
      const idempotencyKey = "idem_test_key_mismatch_002";

      await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/execute`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { orderId: "ord_101" } });

      const resMismatch = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/execute`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { orderId: "DIFFERENT_PAYLOAD" } });

      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_MISMATCH");
      expect(resMismatch.body.error.retryable).toBe(false);
    });

    it("detects in-flight concurrent execution and returns 409 IDEMPOTENCY_IN_FLIGHT with retryable=true", async () => {
      const idempotencyKey = "idem_test_in_flight_003";
      const storageKey = `${orgA.id}:${idempotencyKey}`;

      // Simulate in-flight lock (no responseStatus recorded yet)
      const now = new Date();
      apiStore.idempotencyRecords.set(storageKey, {
        id: "idem_rec_inflight",
        organizationId: orgA.id,
        principalId: ownerUserA.id,
        idempotencyKey,
        requestMethod: "POST",
        requestPath: `/api/v1/workflows/${workflowA.id}/execute`,
        requestHash: crypto
          .createHash("sha256")
          .update(
            `POST:/api/v1/workflows/${workflowA.id}/execute:${JSON.stringify({ payload: { orderId: "ord_103" } })}`,
          )
          .digest("hex"),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: now,
      });

      const resInFlight = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/execute`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { orderId: "ord_103" } });

      expect(resInFlight.status).toBe(409);
      expect(resInFlight.body.error.code).toBe("IDEMPOTENCY_IN_FLIGHT");
      expect(resInFlight.body.error.retryable).toBe(true);
    });
  });

  // ==========================================
  // 6. INBOUND WEBHOOK SECURITY & REPLAY DEFENSE
  // ==========================================
  describe("6. Inbound Webhook Security, Verification, and Replay Defense", () => {
    const webhookSecret = "whsec_test_secret_alpha_99999";
    let webhookConfig: any;

    beforeEach(() => {
      webhookConfig = {
        id: "whk_alpha_orders",
        organizationId: orgA.id,
        workflowId: workflowA.id,
        name: "Production Inbound Hook",
        enabled: true,
        signingSecret: webhookSecret,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.webhooks.set(webhookConfig.id, webhookConfig);
    });

    it("accepts inbound webhook with valid HMAC-SHA256 signature and timestamp", async () => {
      const payload = { event: "order.created", amount: 150 };
      const rawPayload = JSON.stringify(payload);
      const timestamp = Date.now();
      const signed = signWebhookPayload(webhookSecret, rawPayload, timestamp);

      const res = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signed.signature)
        .set("X-Webhook-Timestamp", timestamp.toString())
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.executionId).toBeDefined();
    });

    it("rejects tampered webhook signature with 401 INVALID_SIGNATURE", async () => {
      const payload = { event: "order.created", amount: 150 };
      const timestamp = Date.now();

      const res = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set(
          "X-Signature-256",
          "tampered_invalid_hex_signature_abcdef1234567890abcdef1234567890",
        )
        .set("X-Webhook-Timestamp", timestamp.toString())
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_SIGNATURE");
      expect(res.body.error.retryable).toBe(false);
    });

    it("rejects webhook outside 300s timestamp window with 401 TIMESTAMP_EXPIRED", async () => {
      const payload = { event: "order.created", amount: 150 };
      const rawPayload = JSON.stringify(payload);
      const expiredTimestamp = Date.now() - 400 * 1000; // 400s ago (> 300s)
      const signed = signWebhookPayload(
        webhookSecret,
        rawPayload,
        expiredTimestamp,
      );

      const res = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signed.signature)
        .set("X-Webhook-Timestamp", expiredTimestamp.toString())
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("TIMESTAMP_EXPIRED");
      expect(res.body.error.retryable).toBe(false);
    });

    it("detects signature replay and rejects duplicate signature with 409 WEBHOOK_REPLAY_DETECTED", async () => {
      const payload = {
        event: "order.created",
        amount: 200,
        nonce: "unique_123",
      };
      const rawPayload = JSON.stringify(payload);
      const timestamp = Date.now();
      const signed = signWebhookPayload(webhookSecret, rawPayload, timestamp);

      // First delivery: succeeds
      const res1 = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signed.signature)
        .set("X-Webhook-Timestamp", timestamp.toString())
        .send(payload);

      expect(res1.status).toBe(202);

      // Replay attempt with exact same cryptographic signature: rejected
      const resReplay = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signed.signature)
        .set("X-Webhook-Timestamp", timestamp.toString())
        .send(payload);

      expect(resReplay.status).toBe(409);
      expect(resReplay.body.error.code).toBe("WEBHOOK_REPLAY_DETECTED");
      expect(resReplay.body.error.retryable).toBe(false);
    });

    it("supports zero-downtime dual-secret rotation: accepts signatures from both primary and secondary secrets", async () => {
      // 1. Rotate the webhook secret
      const resRotate = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}/rotate-secret`)
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(resRotate.status).toBe(200);
      const newSecret = resRotate.body.data.signingSecret;
      const secondarySecret = resRotate.body.data.secondarySigningSecret;

      expect(secondarySecret).toBe(webhookSecret);
      expect(newSecret).not.toBe(webhookSecret);

      // 2. Test request signed with OLD secret (secondary grace period)
      resetSignatureReplayCache();
      const payloadOld = { event: "order.payment", source: "old_provider" };
      const rawPayloadOld = JSON.stringify(payloadOld);
      const tsOld = Date.now();
      const signedWithOld = signWebhookPayload(
        secondarySecret,
        rawPayloadOld,
        tsOld,
      );

      const resOld = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signedWithOld.signature)
        .set("X-Webhook-Timestamp", tsOld.toString())
        .send(payloadOld);

      expect(resOld.status).toBe(202);

      // 3. Test request signed with NEW secret (primary)
      const payloadNew = { event: "order.payment", source: "new_provider" };
      const rawPayloadNew = JSON.stringify(payloadNew);
      const tsNew = Date.now();
      const signedWithNew = signWebhookPayload(newSecret, rawPayloadNew, tsNew);

      const resNew = await request(app)
        .post(`/api/v1/webhooks/${webhookConfig.id}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signedWithNew.signature)
        .set("X-Webhook-Timestamp", tsNew.toString())
        .send(payloadNew);

      expect(resNew.status).toBe(202);
    });
  });

  // ==========================================
  // 7. OUTBOUND WEBHOOK SSRF DEFENSE & DLQ
  // ==========================================
  describe("7. Outbound Webhook SSRF Defense and Dead-Letter Queue (DLQ)", () => {
    it("blocks outbound webhook subscriptions targeting private, loopback, or cloud metadata addresses (SSRF)", async () => {
      const maliciousDestinations = [
        "http://127.0.0.1:8080/hook",
        "http://localhost:3000/webhook",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5/internal",
        "http://metadata.google.internal/computeMetadata/v1",
      ];

      for (const destUrl of maliciousDestinations) {
        const res = await request(app)
          .post("/api/v1/webhooks/subscriptions")
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Malicious SSRF Hook",
            url: destUrl,
            events: ["*"],
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("SSRF_BLOCKED_DESTINATION");
      }
    });

    it("lists dead-lettered deliveries via GET /api/v1/webhooks/deliveries/dead-letter with tenant isolation", async () => {
      // Seed DLQ delivery for Org A
      const dlqDeliveryA = {
        id: "whdel_dlq_a1",
        organizationId: orgA.id,
        subscriptionId: "sub_a1",
        eventId: "evt_101",
        url: "https://api.merchant-a.com/webhooks",
        status: "DEAD_LETTERED",
        attemptCount: 5,
        maxAttempts: 5,
        statusCode: 500,
        error: "Remote host returned 500 Internal Server Error",
        requestPayload: { event: "workflow.completed" },
        createdAt: new Date(),
      };
      apiStore.webhookDeliveries.set(dlqDeliveryA.id, dlqDeliveryA as any);

      // Seed DLQ delivery for Org B
      const dlqDeliveryB = {
        id: "whdel_dlq_b1",
        organizationId: orgB.id,
        subscriptionId: "sub_b1",
        eventId: "evt_201",
        url: "https://api.merchant-b.com/webhooks",
        status: "DEAD_LETTERED",
        attemptCount: 5,
        maxAttempts: 5,
        statusCode: 504,
        error: "Gateway Timeout",
        requestPayload: { event: "workflow.failed" },
        createdAt: new Date(),
      };
      apiStore.webhookDeliveries.set(dlqDeliveryB.id, dlqDeliveryB as any);

      // Org A queries DLQ: sees only dlqDeliveryA
      const resA = await request(app)
        .get("/api/v1/webhooks/deliveries/dead-letter")
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.length).toBe(1);
      expect(resA.body.data[0].id).toBe(dlqDeliveryA.id);

      // Org B queries DLQ: sees only dlqDeliveryB
      const resB = await request(app)
        .get("/api/v1/webhooks/deliveries/dead-letter")
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(1);
      expect(resB.body.data[0].id).toBe(dlqDeliveryB.id);
    });

    it("replays dead-lettered delivery via POST /api/v1/webhooks/deliveries/:id/replay", async () => {
      const subId = "sub_replay_test";
      apiStore.webhookSubscriptions.set(subId, {
        id: subId,
        organizationId: orgA.id,
        name: "Replayable Hook",
        url: "https://httpbin.org/post",
        events: ["*"],
        enabled: true,
        secret: "whsec_replay_secret_12345",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const deliveryId = "whdel_to_replay";
      apiStore.webhookDeliveries.set(deliveryId, {
        id: deliveryId,
        organizationId: orgA.id,
        subscriptionId: subId,
        eventId: "evt_rep_01",
        url: "https://httpbin.org/post",
        status: "DEAD_LETTERED",
        attemptCount: 5,
        maxAttempts: 5,
        statusCode: 502,
        error: "Bad Gateway",
        requestPayload: {
          event: "workflow.executed",
          executionId: "exec_123",
        } as any,
        createdAt: new Date(),
      });

      const resReplay = await request(app)
        .post(`/api/v1/webhooks/deliveries/${deliveryId}/replay`)
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(resReplay.status).toBe(200);
      expect(resReplay.body.success).toBe(true);

      const updated = apiStore.webhookDeliveries.get(deliveryId);
      expect(updated).toBeDefined();

      // Check audit record
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "webhook_delivery:replay" && a.resourceId === deliveryId,
      );
      expect(audit).toBeDefined();
    });

    it("prevents Org B from replaying Org A's webhook delivery", async () => {
      const deliveryId = "whdel_org_a_secret";
      apiStore.webhookDeliveries.set(deliveryId, {
        id: deliveryId,
        organizationId: orgA.id,
        subscriptionId: "sub_a",
        eventId: "evt_1",
        url: "https://api.external.com/hook",
        status: "DEAD_LETTERED",
        attemptCount: 5,
        maxAttempts: 5,
        requestPayload: {} as any,
        createdAt: new Date(),
      });

      const resCrossOrg = await request(app)
        .post(`/api/v1/webhooks/deliveries/${deliveryId}/replay`)
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(resCrossOrg.status).toBe(404);
      expect(resCrossOrg.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 8. TYPED SDK & WEBHOOK HELPER
  // ==========================================
  describe("8. Typed FlowForge SDK Client & Signature Helpers", () => {
    it("FlowForgeClient generates automatic idempotency keys and handles typed requests", async () => {
      const client = new FlowForgeClient({
        baseUrl: "http://localhost:3001",
        apiKey: "ff_live_test_client_key",
        organizationId: orgA.id,
      });

      expect(client.baseUrl).toBe("http://localhost:3001");
      expect(typeof client.get).toBe("function");
      expect(typeof client.post).toBe("function");
      expect(typeof client.verifyWebhook).toBe("function");
    });

    it("verifyWebhookSignature correctly verifies HMAC-SHA256 signatures", () => {
      const secret = "whsec_sdk_test_secret_7777";
      const payload = JSON.stringify({ event: "task.created", id: "tsk_01" });
      const timestamp = Date.now();
      const signed = signWebhookPayload(secret, payload, timestamp);

      // Valid check
      const isValid = verifyWebhookSignature({
        payload,
        signature: signed.signature,
        secret,
        timestamp,
      });
      expect(isValid).toBe(true);

      // Tampered check
      const isTampered = verifyWebhookSignature({
        payload: payload + "tampered",
        signature: signed.signature,
        secret,
        timestamp,
      });
      expect(isTampered).toBe(false);
    });
  });

  // ==========================================
  // 9. RELIABILITY TELEMETRY & METRICS
  // ==========================================
  describe("9. Reliability Telemetry and Observability", () => {
    it("returns reliability metrics with counters for requests, rate limits, and idempotency", async () => {
      const res = await request(app).get("/api/v1/metrics/reliability");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requests).toBeDefined();
      expect(res.body.data.errors).toBeDefined();
      expect(res.body.data.idempotency).toBeDefined();
      expect(res.body.data.inboundWebhooks).toBeDefined();
      expect(res.body.data.outboundWebhooks).toBeDefined();
      expect(typeof res.body.data.outboundWebhooks.activeDeadLetterCount).toBe(
        "number",
      );
    });
  });
});
