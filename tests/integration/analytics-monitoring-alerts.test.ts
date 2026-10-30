import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";

describe("Prompt 10: Analytics, Monitoring, and Operational Intelligence", () => {
  // Tenant A: Acme Corp
  const ownerEmailA = `acme_owner_${Date.now()}@flowforge.dev`;
  const memberEmailA = `acme_member_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let memberTokenA: string;
  let orgIdA: string;
  let memberIdA: string;
  let workflow1IdA: string;
  let workflow2IdA: string;

  // Tenant B: Isolated Enterprise
  const ownerEmailB = `isolated_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;
  let workflowIdB: string;

  const now = Date.now();

  beforeAll(async () => {
    // 1. Register Tenant A Owner
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Alice",
      lastName: "Owner",
      organizationName: "Acme Corp",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup Tenant A Member (MEMBER role: has analytics:read, lacks analytics:write)
    memberIdA = `user_member_${Date.now()}`;
    apiStore.users.set(memberIdA, {
      id: memberIdA,
      email: memberEmailA,
      passwordHash: "mock_hash",
      firstName: "Bob",
      lastName: "Member",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    apiStore.memberships.set(`mem_${memberIdA}_${orgIdA}`, {
      id: `mem_${memberIdA}_${orgIdA}`,
      userId: memberIdA,
      organizationId: orgIdA,
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    memberTokenA = `sess_tok_${Date.now()}_member`;
    apiStore.sessions.set(memberTokenA, {
      id: memberTokenA,
      userId: memberIdA,
      organizationId: orgIdA,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    // 3. Register Tenant B Owner
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Charlie",
      lastName: "Owner",
      organizationName: "Isolated Enterprise",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 4. Seed Workflows in Org A
    workflow1IdA = `wf_order_processing_${Date.now()}`;
    apiStore.workflows.set(workflow1IdA, {
      id: workflow1IdA,
      organizationId: orgIdA,
      name: "Order Processing Pipeline",
      slug: "order-processing-pipeline",
      description: "Handles orders and payments",
      status: "ACTIVE",
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    workflow2IdA = `wf_customer_welcome_${Date.now()}`;
    apiStore.workflows.set(workflow2IdA, {
      id: workflow2IdA,
      organizationId: orgIdA,
      name: "Customer Welcome Onboarding",
      slug: "customer-welcome-onboarding",
      description: "Welcomes new signups",
      status: "ACTIVE",
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    // Seed Workflow in Org B
    workflowIdB = `wf_isolated_${Date.now()}`;
    apiStore.workflows.set(workflowIdB, {
      id: workflowIdB,
      organizationId: orgIdB,
      name: "Tenant B Internal Ops",
      slug: "tenant-b-internal-ops",
      description: "Isolated from Tenant A",
      status: "ACTIVE",
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    // 5. Seed Executions and Steps for Tenant A
    // Execution 1: Completed, duration 200ms, SUCCESS (30m ago)
    const exec1Id = `exec_1_${Date.now()}`;
    const exec1Start = new Date(now - 30 * 60 * 1000);
    const exec1End = new Date(exec1Start.getTime() + 200);
    apiStore.executions.set(exec1Id, {
      id: exec1Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: exec1Start,
      completedAt: exec1End,
      retryCount: 0,
      createdAt: exec1Start,
      updatedAt: exec1End,
    });

    // Execution 2: Completed, duration 400ms, SUCCESS (20m ago)
    const exec2Id = `exec_2_${Date.now()}`;
    const exec2Start = new Date(now - 20 * 60 * 1000);
    const exec2End = new Date(exec2Start.getTime() + 400);
    apiStore.executions.set(exec2Id, {
      id: exec2Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "WEBHOOK",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: exec2Start,
      completedAt: exec2End,
      retryCount: 0,
      createdAt: exec2Start,
      updatedAt: exec2End,
    });

    // Execution 3: Completed, duration 1200ms, SUCCESS (15m ago)
    const exec3Id = `exec_3_${Date.now()}`;
    const exec3Start = new Date(now - 15 * 60 * 1000);
    const exec3End = new Date(exec3Start.getTime() + 1200);
    apiStore.executions.set(exec3Id, {
      id: exec3Id,
      organizationId: orgIdA,
      workflowId: workflow2IdA,
      workflowVersionId: "ver_1",
      triggerType: "SCHEDULE",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: exec3Start,
      completedAt: exec3End,
      retryCount: 0,
      createdAt: exec3Start,
      updatedAt: exec3End,
    });

    // Execution 4: Failed, duration 300ms, FAILED - Timeout (10m ago)
    const exec4Id = `exec_4_${Date.now()}`;
    const exec4Start = new Date(now - 10 * 60 * 1000);
    const exec4End = new Date(exec4Start.getTime() + 300);
    apiStore.executions.set(exec4Id, {
      id: exec4Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "WEBHOOK",
      triggerPayload: {},
      status: "FAILED",
      contextData: {},
      startedAt: exec4Start,
      completedAt: exec4End,
      retryCount: 0,
      errorDetails: {
        message: "Connect timeout at https://api.stripe.com/v1/charges with Authorization: Bearer sk_live_secret123456789",
        failedNodeId: "node_payment_charge",
      },
      createdAt: exec4Start,
      updatedAt: exec4End,
    });

    // Execution 5: Failed, duration 150ms, FAILED - Rate limit (5m ago)
    const exec5Id = `exec_5_${Date.now()}`;
    const exec5Start = new Date(now - 5 * 60 * 1000);
    const exec5End = new Date(exec5Start.getTime() + 150);
    apiStore.executions.set(exec5Id, {
      id: exec5Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "FAILED",
      contextData: {},
      startedAt: exec5Start,
      completedAt: exec5End,
      retryCount: 0,
      errorDetails: {
        message: "HTTP 429 Too Many Requests: Rate limit exceeded for token eyJhbGciOi...",
        failedNodeId: "node_payment_charge",
      },
      createdAt: exec5Start,
      updatedAt: exec5End,
    });

    // Execution 6: Failed, duration 250ms, FAILED - Network DNS (2m ago)
    const exec6Id = `exec_6_${Date.now()}`;
    const exec6Start = new Date(now - 2 * 60 * 1000);
    const exec6End = new Date(exec6Start.getTime() + 250);
    apiStore.executions.set(exec6Id, {
      id: exec6Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "FAILED",
      contextData: {},
      startedAt: exec6Start,
      completedAt: exec6End,
      retryCount: 0,
      errorDetails: {
        message: "ENOTFOUND dns lookup failed for hostname api.slack.internal",
      },
      createdAt: exec6Start,
      updatedAt: exec6End,
    });

    // Execution 7: Cancelled, duration 50ms, CANCELLED (1m ago)
    const exec7Id = `exec_7_${Date.now()}`;
    const exec7Start = new Date(now - 60 * 1000);
    const exec7End = new Date(exec7Start.getTime() + 50);
    apiStore.executions.set(exec7Id, {
      id: exec7Id,
      organizationId: orgIdA,
      workflowId: workflow2IdA,
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "CANCELLED",
      contextData: {},
      startedAt: exec7Start,
      completedAt: exec7End,
      retryCount: 0,
      createdAt: exec7Start,
      updatedAt: exec7End,
    });

    // Execution 8: Retry of Execution 4, duration 500ms, SUCCEEDED (30s ago)
    const exec8Id = `exec_8_${Date.now()}`;
    const exec8Start = new Date(now - 30 * 1000);
    const exec8End = new Date(exec8Start.getTime() + 500);
    apiStore.executions.set(exec8Id, {
      id: exec8Id,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "WEBHOOK",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: exec8Start,
      completedAt: exec8End,
      retryCount: 1, // retry execution
      createdAt: exec8Start,
      updatedAt: exec8End,
    });

    // Older Execution for Tenant A: 3 days ago, SUCCEEDED (outside 24h, inside 7d)
    const execOldId = `exec_old_${Date.now()}`;
    const execOldStart = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const execOldEnd = new Date(execOldStart.getTime() + 100);
    apiStore.executions.set(execOldId, {
      id: execOldId,
      organizationId: orgIdA,
      workflowId: workflow1IdA,
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: execOldStart,
      completedAt: execOldEnd,
      retryCount: 0,
      createdAt: execOldStart,
      updatedAt: execOldEnd,
    });

    // Execution for Tenant B
    const execBId = `exec_b_${Date.now()}`;
    const execBStart = new Date(now - 10 * 60 * 1000);
    const execBEnd = new Date(execBStart.getTime() + 350);
    apiStore.executions.set(execBId, {
      id: execBId,
      organizationId: orgIdB,
      workflowId: workflowIdB,
      workflowVersionId: "ver_b",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: execBStart,
      completedAt: execBEnd,
      retryCount: 0,
      createdAt: execBStart,
      updatedAt: execBEnd,
    });

    // 6. Seed Execution Steps for Workflow 1 (to test node performance and bottleneck analysis)
    // Step 1: TRIGGER
    apiStore.steps.set(`step_trig_${exec1Id}`, {
      id: `step_trig_${exec1Id}`,
      executionId: exec1Id,
      nodeId: "node_trigger_1",
      nodeType: "TRIGGER",
      nodeName: "Order Webhook",
      status: "COMPLETED",
      startedAt: exec1Start,
      completedAt: new Date(exec1Start.getTime() + 20),
      attempt: 1,
    });

    // Step 2: HTTP Payment (Heavy node, high latency, multiple failures -> Bottleneck)
    apiStore.steps.set(`step_pay_${exec1Id}`, {
      id: `step_pay_${exec1Id}`,
      executionId: exec1Id,
      nodeId: "node_payment_charge",
      nodeType: "HTTP_REQUEST",
      nodeName: "Stripe Charge",
      status: "COMPLETED",
      startedAt: new Date(exec1Start.getTime() + 20),
      completedAt: new Date(exec1Start.getTime() + 180),
      attempt: 1,
    });

    apiStore.steps.set(`step_pay_${exec4Id}`, {
      id: `step_pay_${exec4Id}`,
      executionId: exec4Id,
      nodeId: "node_payment_charge",
      nodeType: "HTTP_REQUEST",
      nodeName: "Stripe Charge",
      status: "FAILED",
      startedAt: exec4Start,
      completedAt: exec4End,
      errorMessage: "Connect timeout at https://api.stripe.com/v1/charges with Authorization: Bearer sk_live_secret123456789",
      attempt: 1,
    });

    apiStore.steps.set(`step_pay_${exec5Id}`, {
      id: `step_pay_${exec5Id}`,
      executionId: exec5Id,
      nodeId: "node_payment_charge",
      nodeType: "HTTP_REQUEST",
      nodeName: "Stripe Charge",
      status: "FAILED",
      startedAt: exec5Start,
      completedAt: exec5End,
      errorMessage: "HTTP 429 Too Many Requests: Rate limit exceeded for token eyJhbGciOi...",
      attempt: 1,
    });

    // Step 3: EMAIL Notification
    apiStore.steps.set(`step_mail_${exec1Id}`, {
      id: `step_mail_${exec1Id}`,
      executionId: exec1Id,
      nodeId: "node_notify_customer",
      nodeType: "EMAIL",
      nodeName: "Send Confirmation",
      status: "COMPLETED",
      startedAt: new Date(exec1Start.getTime() + 180),
      completedAt: exec1End,
      attempt: 1,
    });
  });

  // ==========================================
  // SUITE 1: EXECUTION OVERVIEW & PERCENTILES
  // ==========================================
  describe("1. Execution Analytics Overview & Percentiles", () => {
    it("returns KPI summary for default 24h window", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/overview")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const metrics = res.body.data.metrics;
      // In last 24h: exec1, exec2, exec3, exec4, exec5, exec6, exec7, exec8 = 8 executions
      expect(metrics.total).toBe(8);
      // 4 succeeded (exec1, exec2, exec3, exec8)
      expect(metrics.successful).toBe(4);
      // 3 failed (exec4, exec5, exec6)
      expect(metrics.failed).toBe(3);
      // 1 cancelled (exec7)
      expect(metrics.cancelled).toBe(1);

      // Success rate: 4 / (4 + 3) * 100 = 57.1%
      expect(metrics.successRate).toBeCloseTo(57.1, 0);

      // Duration percentiles (evaluated across terminal completed executions)
      expect(metrics.durations).toHaveProperty("medianMs");
      expect(metrics.durations).toHaveProperty("p95Ms");
      expect(metrics.durations).toHaveProperty("p99Ms");
      expect(metrics.durations.medianMs).toBeGreaterThan(0);
      expect(metrics.durations.p95Ms).toBeGreaterThanOrEqual(metrics.durations.medianMs);

      // Retry rate tracking
      expect(metrics.retryCount).toBe(1);
      expect(metrics.retryRate).toBeGreaterThan(0);

      // Comparison trends
      expect(res.body.data.trends).toBeDefined();
    });

    it("filters accurately across different time windows (1h, 7d, 30d)", async () => {
      // In 1h: all 8 recent executions are included
      const res1h = await request(app)
        .get("/api/v1/analytics/overview?range=1h")
        .set("Cookie", ownerCookieA);
      expect(res1h.status).toBe(200);
      expect(res1h.body.data.metrics.total).toBe(8);

      // In 7d: includes execOld (3 days ago) -> 9 executions
      const res7d = await request(app)
        .get("/api/v1/analytics/overview?range=7d")
        .set("Cookie", ownerCookieA);
      expect(res7d.status).toBe(200);
      expect(res7d.body.data.metrics.total).toBe(9);
    });

    it("supports custom half-open [from, to) intervals", async () => {
      // Window covering only from 35m ago to 18m ago (covers exec1 at 30m, exec2 at 20m)
      const from = new Date(now - 35 * 60 * 1000).toISOString();
      const to = new Date(now - 18 * 60 * 1000).toISOString();

      const resCustom = await request(app)
        .get(`/api/v1/analytics/overview?range=custom&from=${from}&to=${to}`)
        .set("Cookie", ownerCookieA);

      expect(resCustom.status).toBe(200);
      expect(resCustom.body.data.metrics.total).toBe(2);
      expect(resCustom.body.data.metrics.successful).toBe(2);
      expect(resCustom.body.data.metrics.failed).toBe(0);
    });

    it("safely handles inverted custom dates (from > to) with fallback bounds", async () => {
      const from = new Date(now).toISOString();
      const to = new Date(now - 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .get(`/api/v1/analytics/overview?range=custom&from=${from}&to=${to}`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // SUITE 2: TIME-SERIES TRENDS
  // ==========================================
  describe("2. Time-Series Trends", () => {
    it("returns grouped execution buckets across the selected range", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/trends?range=24h")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.buckets)).toBe(true);
      expect(res.body.data.buckets.length).toBeGreaterThan(0);

      // Verify bucket schema
      const sample = res.body.data.buckets[0];
      expect(sample).toHaveProperty("timestamp");
      expect(sample).toHaveProperty("total");
      expect(sample).toHaveProperty("successful");
      expect(sample).toHaveProperty("failed");
      expect(sample).toHaveProperty("avgDurationMs");
    });
  });

  // ==========================================
  // SUITE 3: WORKFLOW PERFORMANCE & BOTTLENECK ANALYSIS
  // ==========================================
  describe("3. Workflow & Node Performance Insights", () => {
    it("ranks workflows by execution volume and latency", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/workflows?range=24h&sortBy=executionCount&order=desc")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const workflows = res.body.data;
      expect(workflows.length).toBeGreaterThanOrEqual(2);

      // Workflow 1 had 6 executions in 24h, Workflow 2 had 2 executions
      expect(workflows[0].id).toBe(workflow1IdA);
      expect(workflows[0].executionCount).toBeGreaterThanOrEqual(6);
      expect(workflows[0]).toHaveProperty("successRate");
      expect(workflows[0]).toHaveProperty("avgDurationMs");
      expect(workflows[0]).toHaveProperty("failureRate");
    });

    it("evaluates step performance and detects bottlenecks in workflow graph", async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/workflows/${workflow1IdA}/nodes?range=24h`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const nodes = res.body.data.nodes;
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBeGreaterThanOrEqual(3);

      // Find Stripe Charge payment step
      const paymentNode = nodes.find((n: any) => n.nodeId === "node_payment_charge");
      expect(paymentNode).toBeDefined();
      expect(paymentNode.failureCount).toBe(2);
      expect(paymentNode.executionCount).toBe(3);
      // It has high latency & 2 failures, so isBottleneck is marked true
      expect(paymentNode.isBottleneck).toBe(true);

      // Find trigger step
      const triggerNode = nodes.find((n: any) => n.nodeId === "node_trigger_1");
      expect(triggerNode).toBeDefined();
      expect(triggerNode.failureCount).toBe(0);
      expect(triggerNode.isBottleneck).toBe(false);
    });

    it("returns 404 for unknown workflow id or workflow belonging to another tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/workflows/wf_unknown_123/nodes`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // SUITE 4: FAILURE ANALYSIS & SANITIZATION
  // ==========================================
  describe("4. Structured Failure Analysis & Credential Sanitization", () => {
    it("classifies failures into semantic categories and redacts sensitive tokens", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/failures?range=24h")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.totalFailures).toBe(3);

      // Categories
      expect(data.categories).toHaveProperty("HTTP_TIMEOUT");
      expect(data.categories).toHaveProperty("RATE_LIMITED");
      expect(data.categories).toHaveProperty("INTEGRATION_ERROR");
      expect(data.categories.HTTP_TIMEOUT).toBeGreaterThanOrEqual(1);
      expect(data.categories.RATE_LIMITED).toBeGreaterThanOrEqual(1);
      expect(data.categories.INTEGRATION_ERROR).toBeGreaterThanOrEqual(1);

      // Top failing nodes
      expect(data.topFailingNodes["node_payment_charge"]).toBe(2);

      // Verify sanitization of recent failures
      const recent = data.recentFailures;
      expect(recent.length).toBe(3);

      // Verify that Bearer token 'sk_live_secret123456789' is redacted
      const timeoutFailure = recent.find((f: any) => f.category === "HTTP_TIMEOUT");
      expect(timeoutFailure).toBeDefined();
      expect(timeoutFailure.sanitizedMessage).toContain("[REDACTED]");
      expect(timeoutFailure.sanitizedMessage).not.toContain("sk_live_secret123456789");

      // Verify that JWT token 'eyJhbGciOi...' is redacted
      const rateLimitFailure = recent.find((f: any) => f.category === "RATE_LIMITED");
      expect(rateLimitFailure).toBeDefined();
      expect(rateLimitFailure.sanitizedMessage).toContain("[REDACTED]");
      expect(rateLimitFailure.sanitizedMessage).not.toContain("eyJhbGciOi...");
    });
  });

  // ==========================================
  // SUITE 5: OPERATIONAL TELEMETRY & USAGE
  // ==========================================
  describe("5. Operational Telemetry & Tenant Resource Usage", () => {
    it("retrieves operational infrastructure telemetry", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/operational")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const op = res.body.data;
      expect(op).toHaveProperty("queue");
      expect(op.queue).toHaveProperty("queuedJobs");
      expect(op.queue).toHaveProperty("runningJobs");
      expect(op.queue).toHaveProperty("waitingApprovalJobs");
      expect(op.queue).toHaveProperty("totalInFlight");

      expect(op).toHaveProperty("worker");
      expect(op.worker.status).toBe("ONLINE");

      expect(op).toHaveProperty("scheduler");
      expect(op.scheduler.status).toBe("HEALTHY");

      expect(op).toHaveProperty("delays");
      expect(op.delays).toHaveProperty("pendingDelays");
    });

    it("retrieves tenant resource usage statistics", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/usage")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const usage = res.body.data;
      expect(usage.activeWorkflows).toBe(2);
      expect(usage.totalExecutions).toBeGreaterThanOrEqual(8);
      expect(usage.totalStepsExecuted).toBeGreaterThanOrEqual(4);
      expect(usage.triggerVolume).toHaveProperty("MANUAL");
      expect(usage).toHaveProperty("approvals");
    });
  });

  // ==========================================
  // SUITE 6: OPERATIONAL ALERTS & DEDUPLICATION
  // ==========================================
  describe("6. Operational Alerts, Cooldown Deduplication, and Resolution", () => {
    let triggeredAlertId: string;

    it("evaluates operational rules and triggers alert on elevated failure rate", async () => {
      // In Tenant A, failure rate is 3 / (4 + 3) = 42.8%
      const res = await request(app)
        .post("/api/v1/analytics/alerts/evaluate")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newAlertsTriggered).toBeGreaterThanOrEqual(1);

      // Should have triggered an alert for elevated failure rate
      const alerts = res.body.data.newAlerts;
      expect(alerts.length).toBeGreaterThanOrEqual(1);

      const failAlert = alerts.find((a: any) => a.ruleType === "HIGH_FAILURE_RATE");
      expect(failAlert).toBeDefined();
      expect(failAlert.status).toBe("ACTIVE");
      expect(failAlert.severity).toBe("CRITICAL");
      triggeredAlertId = failAlert.id;
    });

    it("deduplicates subsequent rule evaluations within the 15-minute cooldown window", async () => {
      // Immediate second evaluation
      const res = await request(app)
        .post("/api/v1/analytics/alerts/evaluate")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // No duplicate alert created
      expect(res.body.data.newAlertsTriggered).toBe(0);

      // The alert was not recreated as a duplicate in store
      const allActiveAlerts = Array.from(apiStore.alerts.values()).filter(
        (a) => a.organizationId === orgIdA && a.ruleType === "HIGH_FAILURE_RATE" && a.status === "ACTIVE"
      );
      expect(allActiveAlerts.length).toBe(1);
      expect(allActiveAlerts[0].id).toBe(triggeredAlertId);
    });

    it("lists active and historical operational alerts", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/alerts?status=ACTIVE")
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const alert = res.body.data.find((a: any) => a.id === triggeredAlertId);
      expect(alert).toBeDefined();
      expect(alert.status).toBe("ACTIVE");
    });

    it("resolves an active alert with resolution notes and audit logging", async () => {
      const res = await request(app)
        .post(`/api/v1/analytics/alerts/${triggeredAlertId}/resolve`)
        .set("Cookie", ownerCookieA)
        .send({
          resolutionNote: "Stripe API connectivity restored and upstream rate limits refreshed.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("RESOLVED");
      expect(res.body.data.resolvedAt).toBeDefined();
      expect(res.body.data.resolutionNote).toBe(
        "Stripe API connectivity restored and upstream rate limits refreshed."
      );

      // Verify audit log entry was written
      const auditLog = apiStore.auditLogs.find(
        (log) => log.action === "alert.resolved" && log.resourceId === triggeredAlertId
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.organizationId).toBe(orgIdA);
    });
  });

  // ==========================================
  // SUITE 7: MULTI-TENANT ISOLATION & RBAC AUTHORIZATION
  // ==========================================
  describe("7. Multi-Tenant Data Isolation and RBAC Permissions", () => {
    it("allows Org A Member with analytics:read to view overview", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/overview")
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.total).toBe(8);
    });

    it("forbids Org A Member lacking analytics:write from resolving alerts", async () => {
      // First create a new alert to test
      const testAlertId = `alert_test_rbac_${Date.now()}`;
      apiStore.alerts.set(testAlertId, {
        id: testAlertId,
        organizationId: orgIdA,
        ruleType: "HIGH_FAILURE_RATE",
        severity: "WARNING",
        status: "ACTIVE",
        title: "Test Alert",
        message: "Test message",
        triggeredAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/analytics/alerts/${testAlertId}/resolve`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ resolutionNote: "Attempting unauthorized resolve" });

      expect(res.status).toBe(403);
    });

    it("strictly isolates Tenant B from Tenant A analytics and alerts", async () => {
      // Tenant B queries overview
      const resOverviewB = await request(app)
        .get("/api/v1/analytics/overview")
        .set("Cookie", ownerCookieB);

      expect(resOverviewB.status).toBe(200);
      // Tenant B only has 1 execution (execB)
      expect(resOverviewB.body.data.metrics.total).toBe(1);
      expect(resOverviewB.body.data.metrics.successful).toBe(1);
      expect(resOverviewB.body.data.metrics.failed).toBe(0);

      // Tenant B queries failures -> 0 failures
      const resFailuresB = await request(app)
        .get("/api/v1/analytics/failures")
        .set("Cookie", ownerCookieB);

      expect(resFailuresB.status).toBe(200);
      expect(resFailuresB.body.data.totalFailures).toBe(0);
      expect(resFailuresB.body.data.recentFailures.length).toBe(0);

      // Tenant B queries alerts -> 0 alerts
      const resAlertsB = await request(app)
        .get("/api/v1/analytics/alerts")
        .set("Cookie", ownerCookieB);

      expect(resAlertsB.status).toBe(200);
      expect(resAlertsB.body.data.length).toBe(0);

      // Tenant B cannot inspect Tenant A's workflow nodes
      const resNodesB = await request(app)
        .get(`/api/v1/analytics/workflows/${workflow1IdA}/nodes`)
        .set("Cookie", ownerCookieB);

      expect(resNodesB.status).toBe(404);

      // Tenant B cannot resolve Tenant A's alert
      const anyAlertA = Array.from(apiStore.alerts.values()).find((a) => a.organizationId === orgIdA);
      if (anyAlertA) {
        const resResolveB = await request(app)
          .post(`/api/v1/analytics/alerts/${anyAlertA.id}/resolve`)
          .set("Cookie", ownerCookieB)
          .send({ resolutionNote: "Cross-tenant intrusion attempt" });

        expect(resResolveB.status).toBe(404);
      }
    });
  });
});
