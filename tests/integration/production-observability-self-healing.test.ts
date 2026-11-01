import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import {
  createStructuredLogger,
  sanitizeLogValue,
  isRetryableError,
} from "@flowforge/shared";
import { classifyFailure } from "@flowforge/workflow-engine";
import { reprocessPendingOutboxEvents } from "@flowforge/integrations";

describe("Prompt 20: Production Observability, Incident Response & Self-Healing Operations", () => {
  // Tenant A: Acme Corp
  const ownerEmailA = `observability_owner_a_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let orgIdA: string;
  let userIdA: string;

  // Tenant B: Isolated Enterprise
  const ownerEmailB = `observability_owner_b_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;

  beforeAll(async () => {
    // Register Tenant A
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Alice",
      lastName: "Observer",
      organizationName: "Acme Observability Corp",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    userIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // Register Tenant B
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Bob",
      lastName: "Observer",
      organizationName: "Isolated Enterprise",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerCookieB = resB.headers["set-cookie"][0];
  });

  // ---------------------------------------------------------------------------
  // 1. Structured Logging & Redaction
  // ---------------------------------------------------------------------------
  describe("1. Structured Logging & Sensitive Data Redaction", () => {
    it("formats log entries with consistent schema and metadata", () => {
      const logger = createStructuredLogger("flowforge-api", {
        organizationId: orgIdA,
      });

      const entry = logger.info("Workflow execution started", {
        correlationId: "corr_test_123",
        workflowId: "wf_1",
        executionId: "exec_1",
        eventType: "EXECUTION_STARTED",
      });

      expect(entry.service).toBe("flowforge-api");
      expect(entry.level).toBe("info");
      expect(entry.timestamp).toBeDefined();
      expect(entry.correlationId).toBe("corr_test_123");
      expect(entry.workflowId).toBe("wf_1");
      expect(entry.executionId).toBe("exec_1");
      expect(entry.eventType).toBe("EXECUTION_STARTED");
    });

    it("redacts sensitive passwords, tokens, and authorization headers from log metadata", () => {
      const rawMetadata = {
        endpoint: "https://api.external.com/pay",
        authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretToken",
        apiKey: "sk_live_1234567890abcdef",
        databasePassword: "P@ssw0rdSuperSecret!",
        nestedConfig: {
          clientSecret: "client_secret_98765",
          safeSetting: "enabled",
        },
      };

      const sanitized = sanitizeLogValue(rawMetadata) as typeof rawMetadata;

      expect(sanitized.endpoint).toBe("https://api.external.com/pay");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.databasePassword).toBe("[REDACTED]");
      expect(sanitized.nestedConfig.clientSecret).toBe("[REDACTED]");
      expect(sanitized.nestedConfig.safeSetting).toBe("enabled");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Workflow Execution Lifecycle Event Stream
  // ---------------------------------------------------------------------------
  describe("2. Workflow Execution Lifecycle Event Stream", () => {
    let executionIdA: string;
    let workflowIdA: string;

    beforeAll(() => {
      workflowIdA = `wf_obs_${Date.now()}`;
      apiStore.workflows.set(workflowIdA, {
        id: workflowIdA,
        organizationId: orgIdA,
        name: "Order Processing Observability Flow",
        status: "ACTIVE",
        draftDefinition: { nodes: [], edges: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      executionIdA = `exec_obs_${Date.now()}`;
      const now = Date.now();
      const startedAt = new Date(now - 5000);
      const completedAt = new Date(now - 1000);

      apiStore.executions.set(executionIdA, {
        id: executionIdA,
        organizationId: orgIdA,
        workflowId: workflowIdA,
        workflowVersionId: "v1",
        triggerType: "MANUAL",
        triggerPayload: { orderId: 999 },
        status: "SUCCEEDED",
        contextData: {},
        startedAt,
        completedAt,
        retryCount: 1,
        createdAt: new Date(now - 6000),
        updatedAt: completedAt,
      });

      // Steps
      apiStore.steps.set(`step_1_${executionIdA}`, {
        id: `step_1_${executionIdA}`,
        executionId: executionIdA,
        nodeId: "node_trigger",
        nodeType: "TRIGGER",
        nodeName: "Manual Start",
        status: "COMPLETED",
        attempt: 1,
        startedAt: new Date(now - 4800),
        completedAt: new Date(now - 4500),
      });

      apiStore.steps.set(`step_2_${executionIdA}`, {
        id: `step_2_${executionIdA}`,
        executionId: executionIdA,
        nodeId: "node_http",
        nodeType: "HTTP_REQUEST",
        nodeName: "Call Payment Gateway",
        status: "COMPLETED",
        attempt: 1,
        startedAt: new Date(now - 4400),
        completedAt: new Date(now - 2000),
      });

      apiStore.steps.set(`step_3_${executionIdA}`, {
        id: `step_3_${executionIdA}`,
        executionId: executionIdA,
        nodeId: "node_cond",
        nodeType: "CONDITION",
        nodeName: "Verify Payment",
        status: "COMPLETED",
        attempt: 1,
        startedAt: new Date(now - 1900),
        completedAt: new Date(now - 1800),
        outputPayload: { conditionResult: true },
      });

      // Approval
      apiStore.approvals.set(`apprv_${executionIdA}`, {
        id: `apprv_${executionIdA}`,
        organizationId: orgIdA,
        executionId: executionIdA,
        stepId: `step_apprv_${executionIdA}`,
        title: "Manager Approval",
        requiredRole: "ADMIN",
        status: "APPROVED",
        decidedAt: new Date(now - 1200),
        decisionComment: "Approved payment",
        createdAt: new Date(now - 1500),
      });
    });

    it("GET /api/v1/executions/:id/events returns complete chronological lifecycle events", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${executionIdA}/events`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const events = res.body.data;
      expect(events.length).toBeGreaterThanOrEqual(6);

      const eventTypes = events.map((e: any) => e.eventType);
      expect(eventTypes).toContain("EXECUTION_ACCEPTED");
      expect(eventTypes).toContain("EXECUTION_STARTED");
      expect(eventTypes).toContain("NODE_STARTED");
      expect(eventTypes).toContain("NODE_COMPLETED");
      expect(eventTypes).toContain("CONDITION_EVALUATED");
      expect(eventTypes).toContain("APPROVAL_REQUESTED");
      expect(eventTypes).toContain("APPROVAL_RESOLVED");
      expect(eventTypes).toContain("EXECUTION_COMPLETED");

      // Verify node duration is calculated
      const httpCompleted = events.find(
        (e: any) =>
          e.eventType === "NODE_COMPLETED" && e.nodeId === "node_http",
      );
      expect(httpCompleted).toBeDefined();
      expect(httpCompleted.durationMs).toBeGreaterThan(0);
    });

    it("enforces tenant isolation on execution lifecycle events (Org B receives 404)", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${executionIdA}/events`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Error Classification & Taxonomy
  // ---------------------------------------------------------------------------
  describe("3. Error Taxonomy & Failure Classification", () => {
    it("correctly classifies timeout errors and identifies them as retryable", () => {
      const category = classifyFailure(
        { code: "ETIMEDOUT" },
        "Request timed out after 10000ms",
        "HTTP_REQUEST",
      );
      expect(category).toBe("HTTP_TIMEOUT");
      expect(isRetryableError(category)).toBe(true);
    });

    it("correctly classifies authentication and validation errors as non-retryable", () => {
      const authCategory = classifyFailure(
        { status: 401 },
        "Invalid signature or unauthorized credentials",
        "HTTP_REQUEST",
      );
      expect(authCategory).toBe("AUTH_ERROR");
      expect(isRetryableError(authCategory)).toBe(false);

      const valCategory = classifyFailure(
        { errors: ["Cycle detected in graph"] },
        "Invalid workflow graph definition",
      );
      expect(valCategory).toBe("VALIDATION_ERROR");
      expect(isRetryableError(valCategory)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Incident Management & Failure Grouping
  // ---------------------------------------------------------------------------
  describe("4. Incident Management, Grouping & Lifecycle", () => {
    let incidentIdA: string;
    const fingerprint = "fp_gateway_timeout_stripe";

    it("POST /api/v1/incidents creates a new incident for Tenant A", async () => {
      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Cookie", ownerCookieA)
        .send({
          title: "Payment Gateway Latency Surge",
          description: "Stripe API timeouts exceeding 5000ms threshold",
          severity: "HIGH",
          affectedService: "connector",
          fingerprint,
          correlationId: "corr_inc_1",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("Payment Gateway Latency Surge");
      expect(res.body.data.occurrenceCount).toBe(1);
      expect(res.body.data.correlationIds).toContain("corr_inc_1");

      incidentIdA = res.body.data.id;
    });

    it("deduplicates repeated occurrences by fingerprint without creating duplicate records", async () => {
      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Cookie", ownerCookieA)
        .send({
          title: "Payment Gateway Latency Surge (Repeat)",
          description: "Another Stripe API timeout observed",
          severity: "HIGH",
          affectedService: "connector",
          fingerprint,
          correlationId: "corr_inc_2",
        });

      expect(res.status).toBe(200);
      expect(res.body.meta.deduplicated).toBe(true);
      expect(res.body.data.id).toBe(incidentIdA);
      expect(res.body.data.occurrenceCount).toBe(2);
      expect(res.body.data.correlationIds).toContain("corr_inc_2");
    });

    it("GET /api/v1/incidents/summary returns incident counts and breakdowns", async () => {
      const res = await request(app)
        .get("/api/v1/incidents/summary")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.openCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.byService.connector).toBeGreaterThanOrEqual(1);
      expect(res.body.data.bySeverity.HIGH).toBeGreaterThanOrEqual(1);
    });

    it("PATCH /api/v1/incidents/:id resolves the incident with resolution summary", async () => {
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          status: "RESOLVED",
          resolutionSummary:
            "Stripe service restored downstream; circuit breaker closed.",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("RESOLVED");
      expect(res.body.data.resolutionSummary).toContain(
        "Stripe service restored",
      );
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it("enforces tenant isolation on incidents (Org B cannot view or update Org A incident)", async () => {
      const getRes = await request(app)
        .get(`/api/v1/incidents/${incidentIdA}`)
        .set("Cookie", ownerCookieB);

      expect(getRes.status).toBe(404);

      const patchRes = await request(app)
        .patch(`/api/v1/incidents/${incidentIdA}`)
        .set("Cookie", ownerCookieB)
        .send({ status: "INVESTIGATING" });

      expect(patchRes.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Operations Dashboard API
  // ---------------------------------------------------------------------------
  describe("5. Operations Dashboard API", () => {
    it("GET /api/v1/dashboard/operations returns health, metrics, and recent operational items", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/operations")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.serviceStatus.api).toBe("healthy");
      expect(res.body.data.serviceStatus.database).toBe("connected");
      expect(res.body.data.operationalMetrics).toBeDefined();
      expect(Array.isArray(res.body.data.recentIncidents)).toBe(true);
      expect(Array.isArray(res.body.data.recentAlerts)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Safe Automated Recovery & Side-Effect Safety
  // ---------------------------------------------------------------------------
  describe("6. Safe Automated Recovery & Side-Effect Safety", () => {
    it("POST /api/v1/executions/:id/recover safely reconciles stranded execution into FAILED", async () => {
      const stuckExecId = `stuck_exec_${Date.now()}`;
      apiStore.executions.set(stuckExecId, {
        id: stuckExecId,
        organizationId: orgIdA,
        workflowId: "wf_stuck",
        workflowVersionId: "v1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "RUNNING",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(Date.now() - 600000), // 10 minutes ago
      });

      apiStore.steps.set(`step_stuck_${stuckExecId}`, {
        id: `step_stuck_${stuckExecId}`,
        executionId: stuckExecId,
        nodeId: "node_calc",
        nodeType: "CALCULATION",
        nodeName: "Calculate Taxes",
        status: "RUNNING",
        attempt: 1,
        startedAt: new Date(Date.now() - 600000),
      });

      const res = await request(app)
        .post(`/api/v1/executions/${stuckExecId}/recover`)
        .set("Cookie", ownerCookieA)
        .send({
          action: "RECONCILE_FAILED",
          reason: "Worker process died unexpectedly during execution",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("FAILED");
      expect(res.body.data.errorDetails.recovered).toBe(true);

      const step = apiStore.steps.get(`step_stuck_${stuckExecId}`);
      expect(step?.status).toBe("FAILED");
    });

    it("rejects automated retry of ambiguous external HTTP step without idempotency key", async () => {
      const ambiguousExecId = `ambiguous_exec_${Date.now()}`;
      apiStore.executions.set(ambiguousExecId, {
        id: ambiguousExecId,
        organizationId: orgIdA,
        workflowId: "wf_ambiguous",
        workflowVersionId: "v1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "FAILED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(`step_ambiguous_${ambiguousExecId}`, {
        id: `step_ambiguous_${ambiguousExecId}`,
        executionId: ambiguousExecId,
        nodeId: "node_http_post",
        nodeType: "HTTP_REQUEST",
        nodeName: "Charge Credit Card",
        status: "FAILED",
        attempt: 1,
        inputPayload: {
          url: "https://api.payment.com/v1/charges",
          // No idempotency key provided
        },
        errorMessage: "Request timed out after socket connection opened",
      });

      // Attempt recovery with RETRY_SAFE without confirmAmbiguousSideEffect
      const res = await request(app)
        .post(`/api/v1/executions/${ambiguousExecId}/recover`)
        .set("Cookie", ownerCookieA)
        .send({
          action: "RETRY_SAFE",
          confirmAmbiguousSideEffect: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(
        "AMBIGUOUS_SIDE_EFFECT_CONFIRMATION_REQUIRED",
      );
      expect(res.body.error.message).toContain(
        "may have been processed by the external service",
      );

      // Verify execution remained in FAILED state (safe, un-retried)
      const exec = apiStore.executions.get(ambiguousExecId);
      expect(exec?.status).toBe("FAILED");
    });

    it("allows retry of ambiguous external HTTP step when explicitly confirmed by operator", async () => {
      const ambiguousExecId = `ambiguous_exec_confirmed_${Date.now()}`;
      apiStore.executions.set(ambiguousExecId, {
        id: ambiguousExecId,
        organizationId: orgIdA,
        workflowId: "wf_ambiguous",
        workflowVersionId: "v1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "FAILED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(`step_ambiguous_${ambiguousExecId}`, {
        id: `step_ambiguous_${ambiguousExecId}`,
        executionId: ambiguousExecId,
        nodeId: "node_http_post",
        nodeType: "HTTP_REQUEST",
        nodeName: "Charge Credit Card",
        status: "FAILED",
        attempt: 1,
        errorMessage: "Request timed out",
      });

      // Operator explicitly confirms side effect was verified as not processed
      const res = await request(app)
        .post(`/api/v1/executions/${ambiguousExecId}/recover`)
        .set("Cookie", ownerCookieA)
        .send({
          action: "RETRY_SAFE",
          confirmAmbiguousSideEffect: true,
          reason: "Verified with gateway logs that charge did not execute",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("QUEUED");

      const step = apiStore.steps.get(`step_ambiguous_${ambiguousExecId}`);
      expect(step?.status).toBe("PENDING");
      expect(step?.attempt).toBe(2);
    });

    it("self-heals stranded outbox events by re-dispatching pending and marking exhausted as dead-letter", async () => {
      const outbox1Id = `outbox_pending_${Date.now()}`;
      apiStore.outboxEvents.set(outbox1Id, {
        id: outbox1Id,
        organizationId: orgIdA,
        status: "PENDING",
        attemptCount: 1,
        payload: {
          id: `evt_test_${Date.now()}`,
          type: "workflow.execution.completed",
          organizationId: orgIdA,
          resourceType: "execution",
          resourceId: "exec_123",
          createdAt: new Date().toISOString(),
          correlationId: "corr_outbox",
          data: {},
        },
        createdAt: new Date(),
      });

      const outbox2Id = `outbox_exhausted_${Date.now()}`;
      apiStore.outboxEvents.set(outbox2Id, {
        id: outbox2Id,
        organizationId: orgIdA,
        status: "FAILED",
        attemptCount: 5, // Exhausted
        payload: {
          id: "evt_dead",
          type: "system",
          organizationId: orgIdA,
          resourceType: "system",
          resourceId: "sys",
          createdAt: new Date().toISOString(),
          correlationId: "c",
          data: {},
        },
        createdAt: new Date(),
      });

      const result = await reprocessPendingOutboxEvents(apiStore, 5);

      expect(result.reprocessedCount).toBeGreaterThanOrEqual(1);
      expect(result.deadLetterCount).toBeGreaterThanOrEqual(1);

      const exhaustedRecord = apiStore.outboxEvents.get(outbox2Id);
      expect(exhaustedRecord?.status).toBe("DEAD_LETTER");
    });
  });
});
