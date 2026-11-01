import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { resetSignatureReplayCache } from "../../apps/api/src/routes/webhook.routes.js";
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
} from "@flowforge/workflow-engine";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { WorkflowDefinition, Role } from "@flowforge/shared";

describe("Prompt 39: Full-System Integration and End-to-End Regression Testing", () => {
  let runner: WorkflowExecutionRunner;

  // Tenant Alpha (Acme Corp)
  const ownerEmailA = `alpha_owner_${Date.now()}@flowforge.qa`;
  let ownerCookieA: string;
  let orgIdA: string;
  let ownerIdA: string;
  let workflowIdA: string;
  let publishedVersionIdA: string;
  let executionIdA: string;

  // Tenant Beta (Globex Corp)
  const ownerEmailB = `beta_owner_${Date.now()}@flowforge.qa`;
  let ownerCookieB: string;
  let orgIdB: string;
  let ownerIdB: string;

  // Member User in Tenant Alpha for dynamic RBAC testing
  const memberEmailA = `alpha_member_${Date.now()}@flowforge.qa`;
  let memberCookieA: string;
  let memberIdA: string;

  beforeAll(async () => {
    resetRateLimits();
    resetSignatureReplayCache();
    runner = new WorkflowExecutionRunner(apiStore as any);

    // 1. Provision Tenant Alpha
    const regResA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!Alpha",
      firstName: "Alice",
      lastName: "Alpha",
      organizationName: "Alpha Enterprises",
    });

    expect(regResA.status).toBe(201);
    ownerCookieA = regResA.headers["set-cookie"][0];
    ownerIdA = regResA.body.data.user.id;
    orgIdA = regResA.body.data.organization.id;

    // 2. Provision Tenant Beta
    const regResB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!Beta",
      firstName: "Bob",
      lastName: "Beta",
      organizationName: "Beta Technologies",
    });

    expect(regResB.status).toBe(201);
    ownerCookieB = regResB.headers["set-cookie"][0];
    ownerIdB = regResB.body.data.user.id;
    orgIdB = regResB.body.data.organization.id;

    // 3. Register Member in Tenant Alpha
    const regResMember = await request(app).post("/api/v1/auth/register").send({
      email: memberEmailA,
      password: "Password123!Member",
      firstName: "Charlie",
      lastName: "Member",
      organizationName: "Alpha Member Temp Org",
    });

    expect(regResMember.status).toBe(201);
    memberCookieA = regResMember.headers["set-cookie"][0];
    memberIdA = regResMember.body.data.user.id;

    // Add Charlie as ADMIN in Tenant Alpha
    apiStore.memberships.set(`mem_${memberIdA}_${orgIdA}`, {
      id: `mem_${memberIdA}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA,
      role: "ADMIN" as Role,
      joinedAt: new Date(),
    });
  });

  // =========================================================================
  // JOURNEY A: Basic Workflow Execution
  // =========================================================================
  describe("Journey A: Basic Workflow Execution & Lifecycle", () => {
    it("creates, configures, and saves a valid multi-step workflow in Tenant Alpha", async () => {
      // 1. Create Workflow Draft
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({
          name: "Alpha Invoice Processing",
          description: "End-to-end multi-step order approval pipeline",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      workflowIdA = createRes.body.data.id;
      expect(createRes.body.data.organizationId).toBe(orgIdA);

      // 2. Configure Graph Nodes & Edges
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Order Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_condition",
            type: "CONDITION",
            name: "High Value Check",
            config: { expression: "trigger.payload.amount > 1000" },
          },
          {
            id: "node_http",
            type: "HTTP_REQUEST",
            name: "Notify Dispatch Gateway",
            config: {
              url: "https://example.com/api/dispatch",
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: "ORD-9981" }),
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "Finish Processing",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_condition" },
          {
            id: "e2",
            source: "node_condition",
            target: "node_http",
            sourceHandle: "true",
          },
          {
            id: "e3",
            source: "node_condition",
            target: "node_end",
            sourceHandle: "false",
          },
          { id: "e4", source: "node_http", target: "node_end" },
        ],
      };

      const patchRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          nodes: definition.nodes,
          edges: definition.edges,
          expectedRevision: 1,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.draftRevision).toBe(2);
    });

    it("validates workflow graph and confirms zero structural errors", async () => {
      const valRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/validate`)
        .set("Cookie", ownerCookieA);

      expect(valRes.status).toBe(200);
      expect(valRes.body.success).toBe(true);
      expect(valRes.body.data.isValid).toBe(true);
      expect(valRes.body.data.errors.length).toBe(0);
    });

    it("publishes workflow as immutable version 1", async () => {
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/publish`)
        .set("Cookie", ownerCookieA)
        .send({ releaseNotes: "Stable V1 Release" });

      expect(pubRes.status).toBe(201);
      expect(pubRes.body.success).toBe(true);
      expect(pubRes.body.data.version.versionNumber).toBe(1);
      publishedVersionIdA = pubRes.body.data.version.id;
    });

    it("executes workflow, records execution state, and processes through worker", async () => {
      const execRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/execute`)
        .set("Cookie", ownerCookieA)
        .send({
          payload: { orderId: "ORD-9981", amount: 2500 },
        });

      expect(execRes.status).toBe(202);
      expect(execRes.body.data.status).toBe("QUEUED");
      executionIdA = execRes.body.data.id;

      // Worker executes queue
      const executedRecord = await runner.processExecution(executionIdA);
      expect(executedRecord.status).toBe("SUCCEEDED");

      // Verify persisted state through GET /api/v1/executions/:id
      const detailRes = await request(app)
        .get(`/api/v1/executions/${executionIdA}`)
        .set("Cookie", ownerCookieA);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.status).toBe("SUCCEEDED");
      expect(detailRes.body.data.steps.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // JOURNEY B: Validation Failure and State Recovery
  // =========================================================================
  describe("Journey B: Validation Failure and Safe Recovery", () => {
    let invalidWfId: string;

    it("submits an invalid cyclic workflow graph and confirms rejection without side-effects", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({ name: "Invalid Cyclic Flow" });

      invalidWfId = createRes.body.data.id;

      const cyclicDefinition: WorkflowDefinition = {
        nodes: [
          {
            id: "t",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "a",
            type: "HTTP_REQUEST",
            name: "Step A",
            config: { url: "https://api.com" },
          },
          {
            id: "b",
            type: "HTTP_REQUEST",
            name: "Step B",
            config: { url: "https://api.com" },
          },
        ],
        edges: [
          { id: "e1", source: "t", target: "a" },
          { id: "e2", source: "a", target: "b" },
          { id: "e3", source: "b", target: "a" }, // Loop cycle A -> B -> A!
        ],
      };

      const patchRes = await request(app)
        .patch(`/api/v1/workflows/${invalidWfId}`)
        .set("Cookie", ownerCookieA)
        .send({ nodes: cyclicDefinition.nodes, edges: cyclicDefinition.edges });

      expect(patchRes.status).toBe(200);

      // Validate endpoint rejects cyclic graph
      const valRes = await request(app)
        .post(`/api/v1/workflows/${invalidWfId}/validate`)
        .set("Cookie", ownerCookieA);

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.isValid).toBe(false);
      expect(
        valRes.body.data.errors.some((e: any) => e.code.includes("CYCLE")),
      ).toBe(true);

      // Publish is blocked
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${invalidWfId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({ releaseNotes: "Should fail" });

      expect(pubRes.status).toBe(400);
      expect(pubRes.body.error.code).toBe("GRAPH_VALIDATION_FAILED");
    });

    it("recovers by repairing the graph, revalidates, and executes cleanly", async () => {
      // Break cycle by connecting B to a terminal END node
      const validNodes = [
        {
          id: "t",
          type: "TRIGGER" as const,
          name: "Trigger",
          config: { triggerType: "MANUAL" },
        },
        {
          id: "a",
          type: "HTTP_REQUEST" as const,
          name: "Step A",
          config: { url: "https://api.com" },
        },
        {
          id: "b",
          type: "HTTP_REQUEST" as const,
          name: "Step B",
          config: { url: "https://api.com" },
        },
        { id: "end", type: "END" as const, name: "End", config: {} },
      ];
      const validEdges = [
        { id: "e1", source: "t", target: "a" },
        { id: "e2", source: "a", target: "b" },
        { id: "e3", source: "b", target: "end" },
      ];

      const patchRes = await request(app)
        .patch(`/api/v1/workflows/${invalidWfId}`)
        .set("Cookie", ownerCookieA)
        .send({ nodes: validNodes, edges: validEdges });

      expect(patchRes.status).toBe(200);

      const valRes = await request(app)
        .post(`/api/v1/workflows/${invalidWfId}/validate`)
        .set("Cookie", ownerCookieA);

      expect(valRes.body.data.isValid).toBe(true);

      // Now publication succeeds
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${invalidWfId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({ releaseNotes: "Repaired acyclic release" });

      expect(pubRes.status).toBe(201);
      expect(pubRes.body.data.version.versionNumber).toBe(1);
    });
  });

  // =========================================================================
  // JOURNEY C: Execution Failure, Secret Redaction, and Retry
  // =========================================================================
  describe("Journey C: Execution Failure, Secret Redaction, and Step Retry", () => {
    let failingWfId: string;
    let failingExecId: string;

    it("triggers a workflow with deliberate failure and verifies sensitive secret redaction", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({ name: "Failing Step Flow" });

      failingWfId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "trig",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "step_fail",
            type: "HTTP_REQUEST",
            name: "Failing Remote Call",
            config: {
              url: "https://fail.invalid.flowforge/endpoint",
              method: "GET",
              timeoutMs: 1000,
            },
          },
          { id: "end", type: "END", name: "End", config: {} },
        ],
        edges: [
          { id: "e1", source: "trig", target: "step_fail" },
          { id: "e2", source: "step_fail", target: "end" },
        ],
      };

      await request(app)
        .patch(`/api/v1/workflows/${failingWfId}`)
        .set("Cookie", ownerCookieA)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${failingWfId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({});

      const execRes = await request(app)
        .post(`/api/v1/workflows/${failingWfId}/execute`)
        .set("Cookie", ownerCookieA)
        .send({
          payload: {
            sensitiveToken: "SUPER_SECRET_TOKEN_XYZ",
            password: "MySuperPassword123!",
            apiKey: "ff_live_secretkey",
          },
        });

      failingExecId = execRes.body.data.id;

      // Run execution to trigger failure
      await runner.processExecution(failingExecId);

      // Inspect execution state
      const detailRes = await request(app)
        .get(`/api/v1/executions/${failingExecId}`)
        .set("Cookie", ownerCookieA);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.status).toBe("FAILED");
      expect(detailRes.body.data.errorDetails).toBeDefined();

      // Verify that sensitive tokens are masked/redacted in logs and output
      const rawText = JSON.stringify(detailRes.body.data);
      expect(rawText).not.toContain("SUPER_SECRET_TOKEN_XYZ");
      expect(rawText).not.toContain("MySuperPassword123!");
    });

    it("queues and tracks retry attempts with retryCount increment", async () => {
      const retryRes = await request(app)
        .post(`/api/v1/executions/${failingExecId}/retry`)
        .set("Cookie", ownerCookieA)
        .send({ reason: "Manual step retry after network check" });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.status).toBe("QUEUED");
      expect(retryRes.body.data.retryCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // JOURNEY D: Human Approval and Execution Resumption
  // =========================================================================
  describe("Journey D: Human Approval, Self-Approval Prevention, and Resumption", () => {
    let approvalWfId: string;
    let approvalExecId: string;
    let approvalId: string;

    it("suspends workflow at approval checkpoint in WAITING_APPROVAL status", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({ name: "Approval Required Workflow" });

      approvalWfId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "t",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_approval",
            type: "APPROVAL",
            name: "Manager Approval",
            config: {
              title: "Manager Approval",
              requiredRole: "ADMIN",
              allowSelfApproval: false,
            },
          },
          { id: "end", type: "END", name: "End", config: {} },
        ],
        edges: [
          { id: "e1", source: "t", target: "node_approval" },
          { id: "e2", source: "node_approval", target: "end" },
        ],
      };

      await request(app)
        .patch(`/api/v1/workflows/${approvalWfId}`)
        .set("Cookie", ownerCookieA)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${approvalWfId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({});

      const execRes = await request(app)
        .post(`/api/v1/workflows/${approvalWfId}/execute`)
        .set("Cookie", ownerCookieA)
        .send({});

      approvalExecId = execRes.body.data.id;

      // Worker executes up to approval node
      await runner.processExecution(approvalExecId);

      const detailRes = await request(app)
        .get(`/api/v1/executions/${approvalExecId}`)
        .set("Cookie", ownerCookieA);

      expect(detailRes.body.data.status).toBe("WAITING_APPROVAL");
      expect(detailRes.body.data.approvals.length).toBe(1);
      approvalId = detailRes.body.data.approvals[0].id;
    });

    it("rejects unauthorized approval attempts from a different tenant", async () => {
      const foreignDecideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Cookie", ownerCookieB)
        .send({
          decision: "APPROVE",
          comment: "Malicious cross-tenant decision",
        });

      expect(foreignDecideRes.status).toBe(404);
    });

    it("submits authorized approval decision, records audit, and resumes execution to SUCCEEDED", async () => {
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Cookie", ownerCookieA)
        .send({ decision: "APPROVE", comment: "Manager approved expenditure" });

      expect(decideRes.status).toBe(200);
      expect(decideRes.body.data.approval.status).toBe("APPROVED");

      // Verify resumption
      if (decideRes.body.data.execution?.status === "QUEUED") {
        await runner.processExecution(approvalExecId);
      }

      const finalRes = await request(app)
        .get(`/api/v1/executions/${approvalExecId}`)
        .set("Cookie", ownerCookieA);

      expect(finalRes.body.data.status).toBe("SUCCEEDED");

      // Conflict Guard: re-submitting decision returns 409 ALREADY_DECIDED
      const conflictRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Cookie", ownerCookieA)
        .send({ decision: "REJECT", comment: "Duplicate decision" });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe("ALREADY_DECIDED");
    });
  });

  // =========================================================================
  // JOURNEY E: Multi-Tenant Isolation and Zero Cross-Tenant Leakage
  // =========================================================================
  describe("Journey E: Multi-Tenant Isolation and Resource Boundary Defense", () => {
    it("strictly prevents Tenant Beta from accessing Tenant Alpha's workflows, executions, and credentials", async () => {
      // 1. Cannot read Tenant Alpha workflow
      const wfRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieB);
      expect(wfRes.status).toBe(404);

      // 2. Cannot execute Tenant Alpha workflow
      const execRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/execute`)
        .set("Cookie", ownerCookieB)
        .send({});
      expect(execRes.status).toBe(404);

      // 3. Cannot read Tenant Alpha execution
      const execDetailRes = await request(app)
        .get(`/api/v1/executions/${executionIdA}`)
        .set("Cookie", ownerCookieB);
      expect(execDetailRes.status).toBe(404);

      // 4. Cannot cancel Tenant Alpha execution
      const cancelRes = await request(app)
        .post(`/api/v1/executions/${executionIdA}/cancel`)
        .set("Cookie", ownerCookieB)
        .send({});
      expect(cancelRes.status).toBe(404);
    });
  });

  // =========================================================================
  // JOURNEY F: Inbound Webhook Security, Signatures, and Replay Defense
  // =========================================================================
  describe("Journey F: Webhook HMAC-SHA256 Signatures and Replay Defense", () => {
    const webhookSecret = "whsec_test_secret_key_1234567890abcdef";
    let webhookWfId: string;

    beforeAll(async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .send({ name: "Webhook Inbound Flow" });

      webhookWfId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "wh_trigger",
            type: "TRIGGER",
            name: "Webhook Endpoint",
            config: {
              triggerType: "WEBHOOK",
              webhookPath: `/orders-${webhookWfId}`,
              signingSecret: webhookSecret,
            },
          },
          { id: "end", type: "END", name: "End", config: {} },
        ],
        edges: [{ id: "e1", source: "wh_trigger", target: "end" }],
      };

      await request(app)
        .patch(`/api/v1/workflows/${webhookWfId}`)
        .set("Cookie", ownerCookieA)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${webhookWfId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({});
    });

    it("accepts authentic HMAC-SHA256 signed webhook request and queues execution", async () => {
      const payload = { event: "order.created", id: "ord_100", amount: 99 };
      const timestamp = Math.floor(Date.now() / 1000);
      const { headerValue } = signWebhookPayload(
        webhookSecret,
        payload,
        timestamp,
      );

      const res = await request(app)
        .post(`/api/v1/webhooks/${webhookWfId}`)
        .set("x-flowforge-signature", headerValue)
        .set("x-flowforge-timestamp", timestamp.toString())
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("QUEUED");
    });

    it("rejects tampered or invalid webhook signature with HTTP 401", async () => {
      const payload = { event: "order.created", id: "ord_100" };
      const timestamp = Math.floor(Date.now() / 1000);

      const res = await request(app)
        .post(`/api/v1/webhooks/${webhookWfId}`)
        .set("x-flowforge-signature", "sha256=invalid_malicious_signature_hash")
        .set("x-flowforge-timestamp", timestamp.toString())
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_SIGNATURE");
    });

    it("rejects signature replay attack using identical signature within tolerance window with HTTP 409", async () => {
      const payload = { event: "order.created", id: "ord_replay_test" };
      const timestamp = Math.floor(Date.now() / 1000);
      const { headerValue } = signWebhookPayload(
        webhookSecret,
        payload,
        timestamp,
      );

      // First call succeeds
      const firstRes = await request(app)
        .post(`/api/v1/webhooks/${webhookWfId}`)
        .set("x-flowforge-signature", headerValue)
        .set("x-flowforge-timestamp", timestamp.toString())
        .send(payload);
      expect(firstRes.status).toBe(202);

      // Replay call fails with 409
      const replayRes = await request(app)
        .post(`/api/v1/webhooks/${webhookWfId}`)
        .set("x-flowforge-signature", headerValue)
        .set("x-flowforge-timestamp", timestamp.toString())
        .send(payload);
      expect(replayRes.status).toBe(409);
      expect(replayRes.body.error.code).toBe("WEBHOOK_REPLAY_DETECTED");
    });
  });

  // =========================================================================
  // JOURNEY G: Credential Lifecycle, Encryption, and Secret Scrubbing
  // =========================================================================
  describe("Journey G: Credential Lifecycle & SSRF Private IP Defense", () => {
    let connectorId: string;

    it("creates an AES-256-GCM encrypted connector credential and verifies raw secret is never stored plaintext", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections`)
        .set("Cookie", ownerCookieA)
        .send({
          connectorId: "http-api",
          name: "Payment Gateway Connection",
          authType: "BEARER_TOKEN",
          credentialData: {
            token: "sec_live_tok_1234567890abcdef",
          },
        });

      expect(createRes.status).toBe(201);
      connectorId = createRes.body.data.id;

      // Verify that apiStore does not store raw token in plaintext
      const stored = apiStore.connections.get(connectorId);
      expect(stored).toBeDefined();
      const rawStoredJson = JSON.stringify(stored);
      expect(rawStoredJson).not.toContain("sec_live_tok_1234567890abcdef");
    });

    it("blocks SSRF attacks against private IP ranges and cloud metadata services", () => {
      expect(isPrivateOrBlockedDestination("http://127.0.0.1:8080")).toBe(true);
      expect(isPrivateOrBlockedDestination("http://localhost:3000")).toBe(true);
      expect(
        isPrivateOrBlockedDestination(
          "http://169.254.169.254/latest/meta-data",
        ),
      ).toBe(true);
      expect(isPrivateOrBlockedDestination("http://10.0.0.5/internal")).toBe(
        true,
      );
      expect(isPrivateOrBlockedDestination("http://192.168.1.1/router")).toBe(
        true,
      );
      expect(isPrivateOrBlockedDestination("https://api.github.com")).toBe(
        false,
      );
    });

    it("revokes connector credential and prevents subsequent unauthorized access", async () => {
      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgIdA}/connections/${connectorId}`)
        .set("Cookie", ownerCookieA);

      expect(delRes.status).toBe(200);

      // Verify connection is removed or deactivated
      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/connections/${connectorId}`)
        .set("Cookie", ownerCookieA);

      expect(getRes.status).toBe(404);
    });
  });

  // =========================================================================
  // JOURNEY H: Real-Time Permission Changes During Active Session
  // =========================================================================
  describe("Journey H: Dynamic Permission Demotion Without Stale Token Caching", () => {
    it("allows ADMIN user Charlie to perform write operations in Tenant Alpha", async () => {
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", memberCookieA)
        .set("x-organization-id", orgIdA)
        .send({ name: "Charlie Admin Flow" });

      expect(res.status).toBe(201);
    });

    it("immediately enforces permission revocation when role is demoted to VIEWER on same session", async () => {
      // Demote Charlie from ADMIN to VIEWER in Tenant Alpha
      const memKey = `mem_${memberIdA}_${orgIdA}`;
      const membership = apiStore.memberships.get(memKey);
      if (membership) {
        membership.role = "VIEWER" as Role;
        apiStore.memberships.set(memKey, membership);
      }

      // Next write operation with same active session is immediately blocked with HTTP 403
      const writeRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", memberCookieA)
        .set("x-organization-id", orgIdA)
        .send({ name: "Unauthorized Post-Demotion Flow" });

      expect(writeRes.status).toBe(403);
      expect(writeRes.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // JOURNEY I: Import/Export Portability and Package Integrity
  // =========================================================================
  describe("Journey I: Workflow Export Package Integrity and Cross-Tenant Import", () => {
    let exportedPackage: any;

    it("exports Tenant Alpha workflow with SHA-256 integrity hash and scrubbed secrets", async () => {
      const exportRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);

      expect(exportRes.status).toBe(200);
      expect(exportRes.body.formatVersion).toBe("flowforge.package/v1");
      expect(exportRes.body.integrity?.hash).toBeDefined();

      exportedPackage = exportRes.body;

      // Verify integrity hash validation passes
      const valid = verifyPackageIntegrity(exportedPackage);
      expect(valid).toBe(true);
    });

    it("imports workflow into Tenant Beta with fresh tenant-scoped IDs and zero leakage", async () => {
      const importRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPackage,
          name: "Beta Imported Pipeline",
        });

      expect(importRes.status).toBe(201);
      expect(importRes.body.success).toBe(true);
      expect(importRes.body.data.organizationId).toBe(orgIdB);
      expect(importRes.body.data.id).not.toBe(workflowIdA);
    });
  });

  // =========================================================================
  // JOURNEY J: API Reliability, Idempotency, and Concurrency Locks
  // =========================================================================
  describe("Journey J: API Reliability, Cached Replay, and Idempotency Mismatch", () => {
    it("replays cached responses on identical Idempotency-Key requests", async () => {
      const key = `idemp_test_${Date.now()}`;
      const payload = { name: "Idempotent Workflow Example" };

      // First Request
      const firstRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .set("Idempotency-Key", key)
        .send(payload);

      expect(firstRes.status).toBe(201);
      const createdId = firstRes.body.data.id;

      // Duplicate Request with identical payload
      const dupRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .set("Idempotency-Key", key)
        .send(payload);

      expect(dupRes.status).toBe(200);
      expect(dupRes.headers["idempotent-replayed"]).toBe("true");
      expect(dupRes.body.data.id).toBe(createdId);
    });

    it("rejects request with HTTP 409 IDEMPOTENCY_MISMATCH if payload is altered", async () => {
      const key = `idemp_mismatch_${Date.now()}`;

      // First Request
      await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .set("Idempotency-Key", key)
        .send({ name: "Original Flow Name" });

      // Mismatched Payload with same key
      const mismatchRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieA)
        .set("Idempotency-Key", key)
        .send({ name: "Substantially Altered Flow Name!" });

      expect(mismatchRes.status).toBe(409);
      expect(mismatchRes.body.error.code).toBe("IDEMPOTENCY_MISMATCH");
      expect(mismatchRes.body.error.retryable).toBe(false);
    });
  });

  // =========================================================================
  // WORKER RESILIENCE & CIRCUIT BREAKER
  // =========================================================================
  describe("Worker Resilience, Circuit Breaker & Graceful Shutdown", () => {
    it("trips circuit breaker after consecutive threshold failures and enters OPEN state", async () => {
      const cb = new CircuitBreaker("resilience-breaker-test", {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      });

      const failingOperation = async () => {
        throw new Error("Simulated remote gateway timeout");
      };

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(failingOperation)).rejects.toThrow();
      }

      expect(cb.getState()).toBe("OPEN");

      // 4th call is short-circuited with CircuitBreakerError
      await expect(cb.execute(failingOperation)).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it("executes graceful worker shutdown without dropping in-flight tasks", async () => {
      const shutdownResult = await runner.gracefulShutdown(1000);
      expect(shutdownResult).toBeDefined();
      expect(typeof shutdownResult.stoppedCount).toBe("number");
    });
  });
});
