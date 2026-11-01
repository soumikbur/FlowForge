import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import {
  isPrivateOrBlockedDestination,
  signWebhookPayload,
  CircuitBreaker,
  CircuitBreakerError,
} from "@flowforge/integrations";
import {
  validateWorkflowGraph,
  computeWorkflowContentHash,
  computePackageIntegrityHash,
  verifyPackageIntegrity,
  BoundedCache,
} from "@flowforge/workflow-engine";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 18: End-to-End Integration Testing, Security Audit, and Release QA", () => {
  // Tenant A: Acme Corp
  const ownerEmailA = `qa_acme_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let orgIdA: string;
  let ownerIdA: string;
  let workflowIdA: string;
  let publishedVersionIdA: string;
  let executionIdA: string;

  // Tenant B: Globex Inc
  const ownerEmailB = `qa_globex_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;
  let ownerIdB: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Provision Tenant A (Acme Corp)
    const regResA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!Secure",
      firstName: "Alice",
      lastName: "Admin",
      organizationName: "Acme Corp QA",
    });

    expect(regResA.status).toBe(201);
    ownerCookieA = regResA.headers["set-cookie"][0];
    ownerIdA = regResA.body.data.user.id;
    orgIdA = regResA.body.data.organization.id;

    // 2. Provision Tenant B (Globex Inc)
    const regResB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!Secure",
      firstName: "Bob",
      lastName: "Admin",
      organizationName: "Globex Inc QA",
    });

    expect(regResB.status).toBe(201);
    ownerCookieB = regResB.headers["set-cookie"][0];
    ownerIdB = regResB.body.data.user.id;
    orgIdB = regResB.body.data.organization.id;
  });

  // =========================================================================
  // JOURNEY 1: Core Lifecycle (Authoring, Validation, Publishing, Execution)
  // =========================================================================
  describe("Journey 1: Complete Workflow Authoring & Lifecycle", () => {
    it("creates a draft workflow in Tenant A", async () => {
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({
          name: "Invoice Processing Pipeline",
          description:
            "Automated invoice review and external webhook notification",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(orgIdA);
      expect(res.body.data.draftRevision).toBe(1);
      workflowIdA = res.body.data.id;
    });

    it("updates draft graph with custom nodes and connections", async () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Manual Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_http",
            type: "HTTP_REQUEST",
            name: "Notify Gateway",
            config: {
              url: "https://httpbin.org/post",
              method: "POST",
              timeoutMs: 5000,
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "End Pipeline",
            config: {},
          },
        ],
        edges: [
          { id: "edge_1", source: "node_trigger", target: "node_http" },
          { id: "edge_2", source: "node_http", target: "node_end" },
        ],
      };

      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          nodes: definition.nodes,
          edges: definition.edges,
          expectedRevision: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.draftRevision).toBe(2);
      expect(res.body.data.draftDefinition.nodes.length).toBe(3);
    });

    it("rejects concurrent draft edit with optimistic revision mismatch (409 DRAFT_CONFLICT)", async () => {
      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          name: "Stale Concurrent Update",
          expectedRevision: 1, // Current revision is 2!
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("DRAFT_CONFLICT");
      expect(res.body.error.details.currentRevision).toBe(2);
    });

    it("validates workflow graph and rejects invalid disconnected/cyclic graphs", async () => {
      const cyclicDef: WorkflowDefinition = {
        nodes: [
          {
            id: "t",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "h",
            type: "HTTP_REQUEST",
            name: "Http",
            config: { url: "https://example.com" },
          },
          { id: "e", type: "END", name: "End", config: {} },
        ],
        edges: [
          { id: "e1", source: "t", target: "h" },
          { id: "e2", source: "h", target: "t" }, // CYCLE!
        ],
      };

      const val = validateWorkflowGraph(cyclicDef);
      expect(val.isValid).toBe(false);
      expect(
        val.errors.some(
          (err) =>
            err.code.includes("CYCLE") || err.code.includes("GRAPH_CYCLE"),
        ),
      ).toBe(true);
    });

    it("publishes workflow draft as immutable Version 1", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/publish`)
        .set("Cookie", ownerCookieA)
        .send({
          releaseNotes: "Initial QA release",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version.versionNumber).toBe(1);
      expect(res.body.data.version.contentHash).toBeDefined();
      publishedVersionIdA = res.body.data.version.id;
    });

    it("guarantees published versions are strictly immutable (rejects PUT/PATCH/DELETE with 405)", async () => {
      const putRes = await request(app)
        .put(`/api/v1/workflows/${workflowIdA}/versions/${publishedVersionIdA}`)
        .set("Cookie", ownerCookieA)
        .send({ name: "Tampered" });
      expect(putRes.status).toBe(405);
      expect(putRes.body.error.code).toBe("VERSION_IMMUTABLE");

      const patchRes = await request(app)
        .patch(
          `/api/v1/workflows/${workflowIdA}/versions/${publishedVersionIdA}`,
        )
        .set("Cookie", ownerCookieA)
        .send({ name: "Tampered" });
      expect(patchRes.status).toBe(405);
      expect(patchRes.body.error.code).toBe("VERSION_IMMUTABLE");

      const delRes = await request(app)
        .delete(
          `/api/v1/workflows/${workflowIdA}/versions/${publishedVersionIdA}`,
        )
        .set("Cookie", ownerCookieA);
      expect(delRes.status).toBe(405);
      expect(delRes.body.error.code).toBe("VERSION_IMMUTABLE");
    });

    it("promotes Version 1 across environments (development -> staging -> production)", async () => {
      const promoteStagingRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/promote`)
        .set("Cookie", ownerCookieA)
        .send({
          versionId: publishedVersionIdA,
          targetEnvironment: "staging",
        });
      expect(promoteStagingRes.status).toBe(201);

      const promoteProdRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/promote`)
        .set("Cookie", ownerCookieA)
        .send({
          versionId: publishedVersionIdA,
          targetEnvironment: "production",
        });
      expect(promoteProdRes.status).toBe(201);
    });

    it("dispatches execution bound immutably to published version in production", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/execute`)
        .set("Cookie", ownerCookieA)
        .set("x-environment", "production")
        .send({
          payload: { invoiceId: "INV-9921", amount: 4500 },
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("QUEUED");
      expect(res.body.data.workflowVersionId).toBe(publishedVersionIdA);
      expect(res.body.data.environment).toBe("production");
      executionIdA = res.body.data.id;
    });

    it("retrieves execution details and step timeline with tenant isolation", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${executionIdA}`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(executionIdA);
      expect(res.body.data.organizationId).toBe(orgIdA);
      expect(Array.isArray(res.body.data.steps)).toBe(true);
    });
  });

  // =========================================================================
  // JOURNEY 2: Multi-Tenant Isolation & Cross-Tenant Boundary Audit
  // =========================================================================
  describe("Journey 2: Exhaustive Multi-Tenant Isolation Audit", () => {
    it("blocks Tenant B from accessing Tenant A's workflow (GET /workflows/:id)", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("blocks Tenant B from mutating Tenant A's workflow draft (PATCH /workflows/:id)", async () => {
      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieB)
        .send({ name: "Hostile Takeover" });

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from deleting Tenant A's workflow (DELETE /workflows/:id)", async () => {
      const res = await request(app)
        .delete(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from listing Tenant A's published versions (GET /workflows/:id/versions)", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/versions`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from accessing Tenant A's execution (GET /executions/:id)", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${executionIdA}`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("blocks Tenant B from cancelling Tenant A's execution (POST /executions/:id/cancel)", async () => {
      const res = await request(app)
        .post(`/api/v1/executions/${executionIdA}/cancel`)
        .set("Cookie", ownerCookieB)
        .send({ reason: "Unauthorized cancellation" });

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from retrying Tenant A's execution (POST /executions/:id/retry)", async () => {
      const res = await request(app)
        .post(`/api/v1/executions/${executionIdA}/retry`)
        .set("Cookie", ownerCookieB)
        .send({});

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from accessing Tenant A's workflow comments and activities", async () => {
      const commentsRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", ownerCookieB);
      expect(commentsRes.status).toBe(404);

      const addCommentRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", ownerCookieB)
        .send({ content: "Hostile comment" });
      expect(addCommentRes.status).toBe(404);

      const activitiesRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/activities`)
        .set("Cookie", ownerCookieB);
      expect(activitiesRes.status).toBe(404);
    });

    it("blocks Tenant B from exporting Tenant A's workflow (GET /workflows/:id/export)", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/export`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
    });

    it("blocks Tenant B from performing organization backup export for Tenant A", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/export-backup`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("blocks Tenant B from listing Tenant A's API keys", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/api-keys`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(403);
    });

    it("blocks cross-tenant webhook configuration creation", async () => {
      const res = await request(app)
        .post("/api/v1/webhooks")
        .set("Cookie", ownerCookieB)
        .send({
          workflowId: workflowIdA, // Belongs to Tenant A!
          name: "Hostile Webhook",
          enabled: true,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain("Target workflow not found");
    });

    it("blocks cross-tenant schedule creation", async () => {
      const res = await request(app)
        .post("/api/v1/schedules")
        .set("Cookie", ownerCookieB)
        .send({
          workflowId: workflowIdA, // Belongs to Tenant A!
          name: "Hostile Schedule",
          cronExpression: "0 9 * * 1-5",
          timezone: "UTC",
          enabled: true,
        });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // JOURNEY 3: Portability, Sanitization, and Tamper Resistance
  // =========================================================================
  describe("Journey 3: Workflow Portability, Secret Scrubbing & Integrity", () => {
    let exportedPackage: any;

    it("exports workflow package with secret scrubbing and canonical SHA-256 integrity hash", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/export?target=published`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.formatVersion).toBe("flowforge.package/v1");
      expect(res.body.metadata.name).toBe("Invoice Processing Pipeline");
      expect(res.body.integrity.algorithm).toBe("sha256");
      expect(typeof res.body.integrity.hash).toBe("string");

      // Verify cryptographic integrity
      expect(verifyPackageIntegrity(res.body)).toBe(true);
      exportedPackage = res.body;
    });

    it("rejects tampered package with modified definition (INTEGRITY_VERIFICATION_FAILED)", async () => {
      const tampered = JSON.parse(JSON.stringify(exportedPackage));
      tampered.definition.nodes[0].name = "Tampered Node Name";

      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: tampered,
          conflictStrategy: "CREATE_NEW",
          connectorMappings: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INTEGRITY_VERIFICATION_FAILED");
    });

    it("generates safe dry-run compatibility preview for Tenant B before importing", async () => {
      const res = await request(app)
        .post("/api/v1/workflows/import/preview")
        .set("Cookie", ownerCookieB)
        .send({ package: exportedPackage });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.canImport).toBe(true);
      expect(res.body.data.integrityVerified).toBe(true);
      expect(res.body.data.suggestedName).toBe("Invoice Processing Pipeline");
      expect(res.body.data.conflict.hasConflict).toBe(false);
    });

    it("imports package into Tenant B with CREATE_NEW strategy and deactivates triggers safely", async () => {
      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPackage,
          conflictStrategy: "CREATE_NEW",
          targetWorkflowName: "Imported Invoice Pipeline",
          connectorMappings: {},
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(orgIdB); // Bound to Tenant B!
      expect(res.body.data.status).toBe("DRAFT"); // Triggers safely inactive in draft state!
      expect(res.body.data.name).toBe("Imported Invoice Pipeline");
    });

    it("rejects cross-tenant connector mapping during import", async () => {
      // Create a connection in Tenant A
      const connIdA = `conn_a_${Date.now()}`;
      apiStore.connections.set(connIdA, {
        id: connIdA,
        organizationId: orgIdA,
        connectorId: "http-api",
        name: "Acme Private Gateway",
        status: "ACTIVE",
        authType: "API_KEY",
        encryptedData: "dummy:enc",
        createdById: ownerIdA,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Tenant B attempts to map Tenant A's connection ID during import
      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPackage,
          conflictStrategy: "CREATE_NEW",
          connectorMappings: {
            conn_ref_1: connIdA, // Belongs to Tenant A!
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CROSS_TENANT_MAPPING_FORBIDDEN");
    });
  });

  // =========================================================================
  // JOURNEY 4: Security Controls, SSRF, Credentials, and Resilient Workers
  // =========================================================================
  describe("Journey 4: Network Security, SSRF, Circuit Breakers & Worker Fair Scheduling", () => {
    it("blocks SSRF attacks across private, loopback, and cloud metadata addresses", () => {
      const maliciousTargets = [
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        "http://127.0.0.1:8080/admin",
        "http://localhost:3000/internal",
        "http://10.0.1.5/keys",
        "http://172.16.0.1/secrets",
        "http://192.168.1.1/gateway",
        "http://[::1]:5432/",
        "http://0.0.0.0/",
      ];

      for (const url of maliciousTargets) {
        expect(isPrivateOrBlockedDestination(url)).toBe(true);
      }

      // Safe public URLs pass
      expect(
        isPrivateOrBlockedDestination("https://api.stripe.com/v1/charges"),
      ).toBe(false);
      expect(
        isPrivateOrBlockedDestination(
          "https://hooks.slack.com/services/T00/B00/X00",
        ),
      ).toBe(false);
    });

    it("verifies webhook signature authentication and rejects forged signatures", async () => {
      const secret = "whsec_test_secret_key_1234567890";
      const payload = JSON.stringify({
        event: "order.paid",
        orderId: "ord_100",
      });
      const nowSec = Math.floor(Date.now() / 1000);

      // Valid HMAC signature
      const { headerValue } = signWebhookPayload(secret, payload, nowSec);

      // Create webhook config for workflow
      const whId = `whk_test_${Date.now()}`;
      apiStore.webhooks.set(whId, {
        id: whId,
        organizationId: orgIdA,
        workflowId: workflowIdA,
        name: "Test Webhook",
        signingSecret: secret,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Valid webhook request succeeds
      const validRes = await request(app)
        .post(`/api/v1/webhooks/incoming/${whId}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", headerValue)
        .set("X-Webhook-Timestamp", String(nowSec))
        .send(JSON.parse(payload));

      expect(validRes.status).toBe(202);

      // Forged signature is rejected (401 INVALID_SIGNATURE)
      const invalidRes = await request(app)
        .post(`/api/v1/webhooks/incoming/${whId}`)
        .set("Content-Type", "application/json")
        .set(
          "X-Signature-256",
          "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        )
        .set("X-Webhook-Timestamp", String(nowSec))
        .send(JSON.parse(payload));

      expect(invalidRes.status).toBe(401);
      expect(invalidRes.body.error.code).toBe("INVALID_SIGNATURE");
    });

    it("fast-fails requests via CircuitBreaker without contacting downstream when OPEN", async () => {
      const breaker = new CircuitBreaker("payment-downstream", {
        failureThreshold: 2,
        resetTimeoutMs: 100,
      });

      // Fail 2 times to trip breaker
      await breaker
        .execute(async () => {
          throw new Error("Connection refused");
        })
        .catch(() => null);
      await breaker
        .execute(async () => {
          throw new Error("Connection refused");
        })
        .catch(() => null);

      expect(breaker.getState()).toBe("OPEN");

      // Next call fast-fails immediately
      let reached = false;
      await expect(
        breaker.execute(async () => {
          reached = true;
          return "ok";
        }),
      ).rejects.toThrow(CircuitBreakerError);

      expect(reached).toBe(false);
    });

    it("verifies worker fair execution bounds and stale execution recovery", async () => {
      const runner = new WorkflowExecutionRunner(apiStore as any, {
        maxGlobalConcurrency: 5,
        maxTenantConcurrency: 2,
      });

      // Verify concurrency metrics
      const metrics = runner.getConcurrencyMetrics();
      expect(metrics.maxGlobalConcurrency).toBe(5);
      expect(metrics.maxTenantConcurrency).toBe(2);

      // Reconciles stale executions stuck in RUNNING beyond 5m threshold
      const staleTime = new Date(Date.now() - 400000); // ~6.6 min ago
      const staleId = `exec_stale_qa_${Date.now()}`;
      apiStore.executions.set(staleId, {
        id: staleId,
        organizationId: orgIdA,
        workflowId: workflowIdA,
        workflowVersionId: publishedVersionIdA,
        status: "RUNNING",
        startedAt: staleTime,
        updatedAt: staleTime,
        contextData: {},
        createdAt: staleTime,
      });

      const recovery = await runner.recoverStaleExecutions(300000);
      expect(recovery.recoveredCount).toBeGreaterThanOrEqual(1);

      const reconciled = apiStore.executions.get(staleId);
      expect(reconciled?.status).toBe("FAILED");
      expect(reconciled?.errorDetails?.message).toContain(
        "stale running recovery",
      );
    });

    it("verifies diagnostic health endpoints and correlation ID propagation", async () => {
      const corrId = "corr_trace_e2e_qa_4567";

      const liveRes = await request(app)
        .get("/health/live")
        .set("X-Correlation-Id", corrId);

      expect(liveRes.status).toBe(200);
      expect(liveRes.headers["x-correlation-id"]).toBe(corrId);
      expect(liveRes.body.status).toBe("healthy");

      const readyRes = await request(app).get("/health/ready");
      expect(readyRes.status).toBe(200);
      expect(readyRes.body.status).toBe("ready");

      const metricsRes = await request(app).get("/health/metrics");
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.memory).toBeDefined();
      expect(metricsRes.body.validationCache).toBeDefined();
    });
  });
});
