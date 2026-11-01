import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";

describe("Prompt 28: Business Process Intelligence, Workflow Optimization, and Predictive Analytics", () => {
  // Tenant A: Apex Manufacturing Corp
  let orgA: any;
  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;

  // Tenant B: Beta Logistics (for tenant isolation verification)
  let orgB: any;
  let ownerUserB: any;
  let ownerTokenB: string;

  let workflowA: any;
  let workflowB: any;

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  beforeEach(() => {
    resetRateLimits();
    apiStore.clear();

    // 1. Setup Tenant A
    orgA = {
      id: `org_apex_${Date.now()}`,
      name: "Apex Manufacturing Corp",
      slug: `apex-${Date.now()}`,
      billingEmail: "bi@apex.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Setup Tenant B
    orgB = {
      id: `org_beta_${Date.now()}`,
      name: "Beta Logistics Ltd",
      slug: `beta-${Date.now()}`,
      billingEmail: "bi@beta.io",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Setup Users
    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@apex.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@apex.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@apex.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@apex.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@beta.io",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Setup Memberships
    apiStore.memberships.set("mem_a1", {
      id: "mem_a1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_a2", {
      id: "mem_a2",
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_a3", {
      id: "mem_a3",
      organizationId: orgA.id,
      userId: memberUserA.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_a4", {
      id: "mem_a4",
      organizationId: orgA.id,
      userId: viewerUserA.id,
      role: "VIEWER",
    });
    apiStore.memberships.set("mem_b1", {
      id: "mem_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    // 5. Setup Sessions
    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    memberTokenA = `tok_member_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

    const exp = new Date(Date.now() + 86400000);
    apiStore.sessions.set(ownerTokenA, {
      id: "s1",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(adminTokenA, {
      id: "s2",
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(memberTokenA, {
      id: "s3",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(viewerTokenA, {
      id: "s4",
      userId: viewerUserA.id,
      token: viewerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: "s5",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: exp,
      createdAt: new Date(),
    });

    // 6. Setup Sample Workflows
    workflowA = {
      id: `wf_order_${Date.now()}`,
      organizationId: orgA.id,
      name: "Order Processing Pipeline",
      slug: "order-processing-pipeline",
      status: "PUBLISHED",
      publishedVersionId: "v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.workflows.set(workflowA.id, workflowA);

    workflowB = {
      id: `wf_invoice_${Date.now()}`,
      organizationId: orgA.id,
      name: "Invoice Routing Automation",
      slug: "invoice-routing-automation",
      status: "PUBLISHED",
      publishedVersionId: "v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.workflows.set(workflowB.id, workflowB);
  });

  // =========================================================================
  // 1. CORE PROCESS INTELLIGENCE METRICS & KPI CALCULATIONS
  // =========================================================================
  describe("1. Core Process Intelligence Metrics & KPIs", () => {
    it("should compute execution reliability, latency percentiles, queue wait, and approval metrics", async () => {
      const now = Date.now();

      // Seed 5 sample executions for Workflow A
      for (let i = 1; i <= 5; i++) {
        const execId = `exec_a_${i}`;
        const createdTime = new Date(now - (6 - i) * 10000);
        const startedTime = new Date(createdTime.getTime() + 500); // 500ms queue wait
        const completedTime = new Date(startedTime.getTime() + i * 1000); // 1000ms, 2000ms, ... duration

        apiStore.executions.set(execId, {
          id: execId,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: i === 5 ? "FAILED" : "SUCCEEDED",
          contextData: {},
          retryCount: i === 5 ? 2 : 0,
          startedAt: startedTime,
          completedAt: completedTime,
          createdAt: createdTime,
          updatedAt: completedTime,
        });

        // Seed steps
        apiStore.steps.set(`step_a_${i}`, {
          id: `step_a_${i}`,
          executionId: execId,
          nodeId: "node_http_call",
          nodeType: "HTTP_REQUEST",
          nodeName: "Call External ERP",
          status: i === 5 ? "FAILED" : "COMPLETED",
          startedAt: startedTime,
          completedAt: completedTime,
          attempt: i === 5 ? 3 : 1,
        });
      }

      // Seed an approval record
      apiStore.approvals.set("app_1", {
        id: "app_1",
        organizationId: orgA.id,
        executionId: "exec_a_1",
        stepId: "step_app_1",
        title: "Order Approval",
        requiredRole: "ADMIN",
        status: "APPROVED",
        createdAt: new Date(now - 30000),
        decidedAt: new Date(now - 10000), // 20s wait
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/intelligence/metrics?range=1h`)
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.sampleSize).toBe(5);
      expect(data.reliability.total).toBe(5);
      expect(data.reliability.successful).toBe(4);
      expect(data.reliability.failed).toBe(1);
      expect(data.reliability.successRate).toBe(80);
      expect(data.reliability.failureRate).toBe(20);

      // Latency percentiles
      expect(data.performance.medianMs).toBeGreaterThan(0);
      expect(data.performance.p95Ms).toBeGreaterThan(0);
      expect(data.performance.avgQueueWaitMs).toBe(500);

      // Approval wait
      expect(data.humanInTheLoop.totalApprovals).toBe(1);
      expect(data.humanInTheLoop.avgApprovalWaitMs).toBe(20000);

      // External integration breakdown
      expect(data.externalIntegrations.length).toBeGreaterThan(0);
      expect(data.externalIntegrations[0].connectorId).toBe(
        "Call External ERP",
      );
    });
  });

  // =========================================================================
  // 2. PROCESS BOTTLENECK DETECTION
  // =========================================================================
  describe("2. Process Bottleneck Detection", () => {
    it("should detect disproportionate node duration and high failure rate bottlenecks", async () => {
      const now = Date.now();

      // Seed 4 executions where a specific node takes 80% of runtime and fails frequently
      for (let i = 1; i <= 4; i++) {
        const execId = `exec_b_${i}`;
        const createdTime = new Date(now - i * 60000);
        const startedTime = createdTime;
        const completedTime = new Date(startedTime.getTime() + 10000); // 10s total

        apiStore.executions.set(execId, {
          id: execId,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: i >= 3 ? "FAILED" : "SUCCEEDED",
          contextData: {},
          retryCount: i >= 3 ? 2 : 0,
          startedAt: startedTime,
          completedAt: completedTime,
          createdAt: createdTime,
          updatedAt: completedTime,
        });

        // Fast node: 1s
        apiStore.steps.set(`step_fast_${i}`, {
          id: `step_fast_${i}`,
          executionId: execId,
          nodeId: "node_fast",
          nodeType: "TRIGGER",
          nodeName: "Webhook Trigger",
          status: "COMPLETED",
          startedAt: startedTime,
          completedAt: new Date(startedTime.getTime() + 1000),
          attempt: 1,
        });

        // Slow bottleneck node: 9s (90% of duration) & fails on i=3,4 (50% failure rate)
        apiStore.steps.set(`step_slow_${i}`, {
          id: `step_slow_${i}`,
          executionId: execId,
          nodeId: "node_slow_db",
          nodeType: "HTTP_REQUEST",
          nodeName: "Query Slow Database",
          status: i >= 3 ? "FAILED" : "COMPLETED",
          startedAt: new Date(startedTime.getTime() + 1000),
          completedAt: completedTime,
          attempt: i >= 3 ? 3 : 1,
        });
      }

      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/intelligence/bottlenecks`)
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const findings = res.body.data;
      expect(findings.length).toBeGreaterThan(0);

      const durBottleneck = findings.find(
        (f: any) => f.category === "NODE_DURATION",
      );
      expect(durBottleneck).toBeDefined();
      expect(durBottleneck.nodeId).toBe("node_slow_db");
      expect(
        durBottleneck.evidence.some((e: string) =>
          e.includes("total workflow execution time"),
        ),
      ).toBe(true);

      const failBottleneck = findings.find(
        (f: any) => f.category === "HIGH_FAILURE_RATE",
      );
      expect(failBottleneck).toBeDefined();
      expect(failBottleneck.nodeId).toBe("node_slow_db");
      expect(failBottleneck.measuredValue).toBe(50); // 50%
    });

    it("should ignore workflows with insufficient sample count (< 3 executions)", async () => {
      // Seed only 1 execution for Workflow B
      apiStore.executions.set("single_exec", {
        id: "single_exec",
        workflowId: workflowB.id,
        workflowVersionId: "v1",
        organizationId: orgA.id,
        status: "FAILED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/bottlenecks?workflowId=${workflowB.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]); // No false positives on tiny samples
    });
  });

  // =========================================================================
  // 3. STATISTICAL ANOMALY DETECTION & GATING
  // =========================================================================
  describe("3. Statistical Anomaly Detection & Gating", () => {
    it("should detect statistical duration and failure rate spikes when sample size is sufficient", async () => {
      const now = Date.now();

      // Seed 10 baseline executions (2 days ago to 1 day ago) with tight ~1000ms duration and 0% failure
      for (let i = 1; i <= 10; i++) {
        const t = new Date(now - (48 - i) * 3600 * 1000);
        apiStore.executions.set(`base_exec_${i}`, {
          id: `base_exec_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: "SUCCEEDED",
          contextData: {},
          retryCount: 0,
          startedAt: t,
          completedAt: new Date(t.getTime() + 1000 + (i % 2) * 50), // 1000-1050ms
          createdAt: t,
          updatedAt: new Date(t.getTime() + 1050),
        });
      }

      // Seed 3 recent executions (last 2 hours) with massive duration spike: 8,000ms and failure
      for (let i = 1; i <= 3; i++) {
        const t = new Date(now - i * 600 * 1000);
        apiStore.executions.set(`recent_exec_${i}`, {
          id: `recent_exec_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: "FAILED",
          contextData: {},
          retryCount: 1,
          startedAt: t,
          completedAt: new Date(t.getTime() + 8000), // 8000ms (huge spike)
          createdAt: t,
          updatedAt: new Date(t.getTime() + 8000),
        });
      }

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/anomalies?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const anomalies = res.body.data;
      expect(anomalies.length).toBeGreaterThan(0);

      const durAnomaly = anomalies.find(
        (a: any) => a.metricName === "EXECUTION_DURATION",
      );
      expect(durAnomaly).toBeDefined();
      expect(durAnomaly.deviationSigma).toBeGreaterThanOrEqual(2.5);
      expect(durAnomaly.confidenceScore).toBeGreaterThanOrEqual(0.8);
      expect(durAnomaly.evidence).toContain("baseline mean");
    });

    it("should conservatively gate and not flag anomalies when sample size is below threshold (< 10)", async () => {
      // Seed only 4 executions total
      for (let i = 1; i <= 4; i++) {
        const t = new Date(Date.now() - i * 10000);
        apiStore.executions.set(`few_exec_${i}`, {
          id: `few_exec_${i}`,
          workflowId: workflowB.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: "FAILED",
          contextData: {},
          retryCount: 0,
          startedAt: t,
          completedAt: new Date(t.getTime() + 5000),
          createdAt: t,
          updatedAt: new Date(t.getTime() + 5000),
        });
      }

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/anomalies?workflowId=${workflowB.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]); // Safe: no false alarms on small samples
    });
  });

  // =========================================================================
  // 4. WORKFLOW VERSION & REGRESSION COMPARISON
  // =========================================================================
  describe("4. Workflow Version & Regression Comparison", () => {
    it("should compare version A and version B, detecting performance and reliability regression", async () => {
      const now = Date.now();

      // Seed Version 1 (Fast & Reliable: 100% success, 1200ms avg duration)
      for (let i = 1; i <= 5; i++) {
        const t = new Date(now - (20 - i) * 60000);
        apiStore.executions.set(`exec_v1_${i}`, {
          id: `exec_v1_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: "SUCCEEDED",
          contextData: {},
          retryCount: 0,
          startedAt: t,
          completedAt: new Date(t.getTime() + 1200),
          createdAt: t,
          updatedAt: new Date(t.getTime() + 1200),
        });
      }

      // Seed Version 2 (Slow & Unreliable: 40% success, 4500ms avg duration)
      for (let i = 1; i <= 5; i++) {
        const t = new Date(now - (10 - i) * 60000);
        apiStore.executions.set(`exec_v2_${i}`, {
          id: `exec_v2_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v2",
          organizationId: orgA.id,
          status: i <= 2 ? "SUCCEEDED" : "FAILED",
          contextData: {},
          retryCount: i > 2 ? 2 : 0,
          startedAt: t,
          completedAt: new Date(t.getTime() + 4500),
          createdAt: t,
          updatedAt: new Date(t.getTime() + 4500),
        });
      }

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/compare`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          workflowId: workflowA.id,
          versionA: "v1",
          versionB: "v2",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const report = res.body.data;
      expect(report.versionA.sampleSize).toBe(5);
      expect(report.versionA.successRate).toBe(100);
      expect(report.versionB.sampleSize).toBe(5);
      expect(report.versionB.successRate).toBe(40);

      // Deltas
      expect(report.differences.successRateDelta).toBe(-60);
      expect(report.differences.isRegressed).toBe(true);
      expect(report.differences.regressionNotes.length).toBeGreaterThan(0);
      expect(report.differences.regressionNotes[0]).toContain(
        "Success rate regressed by 60%",
      );
    });
  });

  // =========================================================================
  // 5. BUSINESS OUTCOME TRACKING & SLA ATTAINMENT
  // =========================================================================
  describe("5. Business Outcome Tracking & SLA Attainment", () => {
    it("should record business outcomes and evaluate SLA attainment", async () => {
      // 1. Record completed outcome within SLA (target: 5000ms, actual: 3200ms)
      const res1 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/outcomes`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          workflowId: workflowA.id,
          executionId: "exec_order_101",
          outcomeType: "ORDERS_PROCESSED",
          status: "COMPLETED",
          targetTimeMs: 5000,
          actualTimeMs: 3200,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.metSla).toBe(true);

      // 2. Record breached outcome (target: 5000ms, actual: 7500ms)
      const res2 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/outcomes`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          workflowId: workflowA.id,
          executionId: "exec_order_102",
          outcomeType: "ORDERS_PROCESSED",
          status: "SLA_BREACHED",
          targetTimeMs: 5000,
          actualTimeMs: 7500,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.metSla).toBe(false);

      // 3. Query aggregated outcomes
      const res3 = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/outcomes?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res3.status).toBe(200);
      expect(res3.body.data.totalOutcomesRecorded).toBe(2);

      const summary = res3.body.data.summaries.find(
        (s: any) => s.outcomeType === "ORDERS_PROCESSED",
      );
      expect(summary).toBeDefined();
      expect(summary.total).toBe(2);
      expect(summary.completed).toBe(1);
      expect(summary.slaAttainmentPercent).toBe(50); // 1 out of 2 met SLA
    });
  });

  // =========================================================================
  // 6. SERVICE-LEVEL OBJECTIVES (SLO) LIFECYCLE & ERROR BUDGETS
  // =========================================================================
  describe("6. Service-Level Objectives (SLO) Lifecycle & Error Budgets", () => {
    it("should create, evaluate, and track error budgets for an SLO", async () => {
      // Create SLO: 90% success rate target
      const resCreate = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/slos`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          workflowId: workflowA.id,
          name: "Core Order Processing 90% Reliability",
          targetType: "SUCCESS_RATE",
          targetValue: 90.0,
          windowHours: 24,
        });

      expect(resCreate.status).toBe(201);
      const sloId = resCreate.body.data.id;
      expect(sloId).toBeDefined();

      // Seed 10 executions: 9 succeed, 1 fails (90% success rate = compliant)
      for (let i = 1; i <= 10; i++) {
        apiStore.executions.set(`exec_slo_${i}`, {
          id: `exec_slo_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: i === 10 ? "FAILED" : "SUCCEEDED",
          contextData: {},
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Query SLO compliance
      const resGet = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/slos?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(resGet.status).toBe(200);
      const evaluated = resGet.body.data.find((s: any) => s.id === sloId);
      expect(evaluated).toBeDefined();
      expect(evaluated.currentValue).toBe(90.0);
      expect(evaluated.isCompliant).toBe(true);
      expect(evaluated.sampleCount).toBe(10);

      // Update SLO
      const resPut = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/intelligence/slos/${sloId}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ targetValue: 95.0 });

      expect(resPut.status).toBe(200);
      expect(resPut.body.data.targetValue).toBe(95.0);

      // Delete SLO
      const resDel = await request(app)
        .delete(`/api/v1/organizations/${orgA.id}/intelligence/slos/${sloId}`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(resDel.status).toBe(200);
      expect(resDel.body.data.deleted).toBe(true);
    });

    it("should evaluate SLO non-compliance when target is breached and exhaust error budget", async () => {
      // Create SLO: 95% success rate
      const resCreate = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/slos`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          workflowId: workflowA.id,
          name: "Strict 95% Reliability Target",
          targetType: "SUCCESS_RATE",
          targetValue: 95.0,
          windowHours: 24,
        });

      expect(resCreate.status).toBe(201);
      const sloId = resCreate.body.data.id;

      // Seed 10 executions: 7 succeed, 3 fail (70% success rate < 95% target)
      for (let i = 1; i <= 10; i++) {
        apiStore.executions.set(`exec_breach_${i}`, {
          id: `exec_breach_${i}`,
          workflowId: workflowA.id,
          workflowVersionId: "v1",
          organizationId: orgA.id,
          status: i <= 7 ? "SUCCEEDED" : "FAILED",
          contextData: {},
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const resGet = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/slos?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(resGet.status).toBe(200);
      const slo = resGet.body.data.find((s: any) => s.id === sloId);
      expect(slo).toBeDefined();
      expect(slo.currentValue).toBe(70.0);
      expect(slo.isCompliant).toBe(false);
      expect(slo.errorBudgetRemainingPercent).toBe(0);
    });

    it("should evaluate DURATION_P95 SLO compliance", async () => {
      const resCreate = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/slos`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          workflowId: workflowA.id,
          name: "Duration Under 3000ms",
          targetType: "DURATION_P95",
          targetValue: 3000.0,
          windowHours: 24,
        });

      expect(resCreate.status).toBe(201);
      const sloId = resCreate.body.data.id;

      // Seed executions with fast 1000-1500ms durations
      for (let i = 1; i <= 5; i++) {
        const t = new Date();
        apiStore.executions.set(`exec_fast_${i}`, {
          id: `exec_fast_${i}`,
          workflowId: workflowA.id,
          organizationId: orgA.id,
          status: "SUCCEEDED",
          contextData: {},
          retryCount: 0,
          startedAt: t,
          completedAt: new Date(t.getTime() + 1200),
          createdAt: t,
          updatedAt: new Date(t.getTime() + 1200),
        });
      }

      const resGet = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/slos?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(resGet.status).toBe(200);
      const slo = resGet.body.data.find((s: any) => s.id === sloId);
      expect(slo).toBeDefined();
      expect(slo.isCompliant).toBe(true);
      expect(slo.currentValue).toBeLessThanOrEqual(3000.0);
    });
  });

  // =========================================================================
  // 7. WORKFLOW OPTIMIZATION RECOMMENDATIONS
  // =========================================================================
  describe("7. Workflow Optimization Recommendations", () => {
    it("should generate actionable recommendations for detected bottlenecks", async () => {
      // Seed slow node bottleneck
      for (let i = 1; i <= 4; i++) {
        const execId = `exec_opt_${i}`;
        const t = new Date();
        apiStore.executions.set(execId, {
          id: execId,
          workflowId: workflowA.id,
          organizationId: orgA.id,
          status: "SUCCEEDED",
          contextData: {},
          retryCount: 0,
          createdAt: t,
          updatedAt: t,
        });
        apiStore.steps.set(`step_opt_${i}`, {
          id: `step_opt_${i}`,
          executionId: execId,
          nodeId: "node_heavy_erp",
          nodeType: "CONNECTOR_ACTION",
          nodeName: "Query SAP ERP",
          status: "COMPLETED",
          startedAt: t,
          completedAt: new Date(t.getTime() + 6000), // 6000ms
          attempt: 1,
        });
      }

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/intelligence/recommendations?workflowId=${workflowA.id}`,
        )
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const recs = res.body.data;
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].problem).toContain("Query SAP ERP");
      expect(recs[0].proposedChange).toBeDefined();
      expect(recs[0].expectedBenefit).toBeDefined();
      expect(recs[0].tradeoffs).toBeDefined();
      expect(recs[0].requiresApproval).toBe(true);
    });
  });

  // =========================================================================
  // 8. AI-ASSISTED OPERATIONAL INSIGHTS
  // =========================================================================
  describe("8. AI-Assisted Operational Insights", () => {
    it("should generate grounded operational insight with advisory attribution", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/insights/ai`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          topic: "BOTTLENECK",
          workflowId: workflowA.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const insight = res.body.data;
      expect(insight.topic).toBe("BOTTLENECK");
      expect(insight.summary).toBeDefined();
      expect(insight.detailedAnalysis).toBeDefined();
      expect(insight.supportingEvidence.length).toBeGreaterThan(0);
      expect(insight.candidateExperiments.length).toBeGreaterThan(0);
      expect(insight.isAdvisory).toBe(true); // Must remain advisory
    });
  });

  // =========================================================================
  // 9. DATA PRIVACY, TENANT ISOLATION & CSV EXPORT PROTECTION
  // =========================================================================
  describe("9. Data Privacy, Tenant Isolation & CSV Export Protection", () => {
    it("should enforce tenant isolation so Tenant B cannot access Tenant A intelligence", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/intelligence/metrics`)
        .set("Authorization", `Bearer ${ownerTokenB}`); // Tenant B token

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject modifying operations from viewers lacking analytics:write", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/intelligence/slos`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          workflowId: workflowA.id,
          name: "Viewer Rogue SLO",
          targetType: "SUCCESS_RATE",
          targetValue: 99.0,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should sanitize formula injection characters in CSV exports", async () => {
      // Seed execution with formula injection attempt in organization or context
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/intelligence/export?format=csv`)
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain(".csv");

      const csvContent = res.text;
      expect(csvContent).toContain("Metric,Value,Notes");
      expect(csvContent).toContain("Total Executions");
      expect(csvContent).toContain("Success Rate");
      // Verify no cell begins directly with bare unescaped formula triggers '=cmd|' or '=SUM'
      const rows = csvContent.split("\n");
      for (const row of rows) {
        const cells = row.split(",");
        for (const cell of cells) {
          expect(cell.startsWith("=cmd")).toBe(false);
          expect(cell.startsWith("+cmd")).toBe(false);
          expect(cell.startsWith("@cmd")).toBe(false);
        }
      }
    });

    it("should export intelligence report in JSON format", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/intelligence/export?format=json`)
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.headers["content-disposition"]).toContain(".json");

      const parsed = JSON.parse(res.text);
      expect(parsed.organizationId).toBe(orgA.id);
      expect(parsed.metrics).toBeDefined();
      expect(parsed.performance).toBeDefined();
      expect(parsed.slos).toBeDefined();
    });
  });
});
