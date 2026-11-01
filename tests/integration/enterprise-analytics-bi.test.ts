import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import {
  WorkflowExecutionRecord,
  ExecutionStepRecord,
  ApprovalRecord,
  IntegrationConnectionRecord,
  PolicyViolationRecord,
  Role,
} from "@flowforge/shared";

describe("Prompt 34 — Enterprise Data Governance, Semantic Analytics, and Business Intelligence", () => {
  const validBcryptHash =
    "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY5k7rhKhGfdW.q";

  const orgA = {
    id: "org_analytics_alpha",
    name: "Analytics Alpha Corp",
    slug: "analytics-alpha",
    billingEmail: "admin@analyticsalpha.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgB = {
    id: "org_analytics_beta",
    name: "Analytics Beta Corp",
    slug: "analytics-beta",
    billingEmail: "admin@analyticsbeta.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let ownerUserA: any;
  let adminUserA: any;
  let viewerUserA: any;
  let ownerUserB: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let viewerTokenA: string;
  let ownerTokenB: string;

  const now = new Date();

  beforeEach(() => {
    apiStore.clear();

    apiStore.organizations.set(orgA.id, orgA);
    apiStore.organizations.set(orgB.id, orgB);

    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@analyticsalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@analyticsalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@analyticsalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@analyticsbeta.io",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

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
      userId: viewerUserA.id,
      role: "VIEWER",
    });
    apiStore.memberships.set("mem_b1", {
      id: "mem_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

    apiStore.sessions.set(ownerTokenA, {
      id: "sess_owner_a",
      userId: ownerUserA.id,
      organizationId: orgA.id,
      role: "OWNER" as Role,
      token: ownerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    apiStore.sessions.set(adminTokenA, {
      id: "sess_admin_a",
      userId: adminUserA.id,
      organizationId: orgA.id,
      role: "ADMIN" as Role,
      token: adminTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    apiStore.sessions.set(viewerTokenA, {
      id: "sess_viewer_a",
      userId: viewerUserA.id,
      organizationId: orgA.id,
      role: "VIEWER" as Role,
      token: viewerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    apiStore.sessions.set(ownerTokenB, {
      id: "sess_owner_b",
      userId: ownerUserB.id,
      organizationId: orgB.id,
      role: "OWNER" as Role,
      token: ownerTokenB,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    // Seed workflows for Org A
    apiStore.workflows.set("wf_invoicing", {
      id: "wf_invoicing",
      organizationId: orgA.id,
      name: "Invoice Reconciliation",
      description: "Automated billing reconciliation",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    apiStore.workflows.set("wf_support_triage", {
      id: "wf_support_triage",
      organizationId: orgA.id,
      name: "Support Ticket Triage",
      description: "Smart ticket categorization",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    // Seed 10 executions for Org A (8 SUCCEEDED, 2 FAILED)
    for (let i = 1; i <= 6; i++) {
      apiStore.executions.set(`exec_inv_${i}`, {
        id: `exec_inv_${i}`,
        organizationId: orgA.id,
        workflowId: "wf_invoicing",
        workflowVersionId: "ver_inv_1",
        triggerType: "SCHEDULE",
        triggerPayload: {},
        status: "SUCCEEDED",
        contextData: {},
        startedAt: new Date(now.getTime() - 10000),
        completedAt: new Date(now.getTime() - 5000),
        retryCount: 0,
        createdAt: new Date(now.getTime() - 12000),
        updatedAt: now,
      });
    }

    for (let i = 1; i <= 2; i++) {
      apiStore.executions.set(`exec_sup_${i}`, {
        id: `exec_sup_${i}`,
        organizationId: orgA.id,
        workflowId: "wf_support_triage",
        workflowVersionId: "ver_sup_1",
        triggerType: "WEBHOOK",
        triggerPayload: {},
        status: "SUCCEEDED",
        contextData: {},
        startedAt: new Date(now.getTime() - 8000),
        completedAt: new Date(now.getTime() - 4000),
        retryCount: 0,
        createdAt: new Date(now.getTime() - 9000),
        updatedAt: now,
      });
    }

    for (let i = 3; i <= 4; i++) {
      apiStore.executions.set(`exec_sup_${i}`, {
        id: `exec_sup_${i}`,
        organizationId: orgA.id,
        workflowId: "wf_support_triage",
        workflowVersionId: "ver_sup_1",
        triggerType: "WEBHOOK",
        triggerPayload: {},
        status: "FAILED",
        contextData: {},
        startedAt: new Date(now.getTime() - 8000),
        completedAt: new Date(now.getTime() - 4000),
        retryCount: 1,
        errorDetails: { message: "CRM rate limit reached" },
        createdAt: new Date(now.getTime() - 9000),
        updatedAt: now,
      });
    }
  });

  // ==========================================
  // 1. BUSINESS VALUE & ROI TESTS
  // ==========================================

  it("calculates baseline automation ROI using default assumptions", async () => {
    const res = await request(app)
      .get("/api/v1/analytics/roi")
      .set("Authorization", `Bearer ${ownerTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    // 10 total, 8 successful
    expect(data.totalExecutions).toBe(10);
    expect(data.successfulExecutions).toBe(8);

    // Default: 15 min manual time, $45/hr wage
    // 8 * 15 / 60 = 2.0 hours saved
    expect(data.estimatedHoursSaved).toBe(2.0);
    // 2.0 * $45 = $90.00 avoided
    expect(data.estimatedLaborCostAvoided).toBe(90.0);
    expect(data.netSavings).toBe(90.0);
    expect(data.currency).toBe("USD");
    expect(data.breakdownByWorkflow).toHaveLength(2);

    const invWf = data.breakdownByWorkflow.find(
      (w: any) => w.workflowId === "wf_invoicing",
    );
    expect(invWf).toBeDefined();
    expect(invWf.executionCount).toBe(6);
    expect(invWf.successfulExecutions).toBe(6);
    // 6 * 15 / 60 = 1.5 hrs; 1.5 * $45 = $67.50
    expect(invWf.hoursSaved).toBe(1.5);
    expect(invWf.laborCostAvoided).toBe(67.5);
    expect(invWf.netSavings).toBe(67.5);
  });

  it("supports on-the-fly query parameter override simulation for ROI", async () => {
    const res = await request(app)
      .get("/api/v1/analytics/roi?manualMinutes=30&hourlyWage=60")
      .set("Authorization", `Bearer ${adminTokenA}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // 8 successful * 30 min / 60 = 4.0 hours saved
    expect(data.estimatedHoursSaved).toBe(4.0);
    // 4.0 * $60 = $240.00 labor cost avoided
    expect(data.estimatedLaborCostAvoided).toBe(240.0);
    expect(data.netSavings).toBe(240.0);
    expect(data.assumptionsUsed.isCustom).toBe(true);
    expect(data.assumptionsUsed.manualMinutesPerRun).toBe(30);
    expect(data.assumptionsUsed.hourlyWage).toBe(60);
  });

  it("persists custom organization ROI assumptions and applies them to future calculations", async () => {
    // 1. Post custom assumption
    const postRes = await request(app)
      .post("/api/v1/analytics/roi/assumptions")
      .set("Authorization", `Bearer ${adminTokenA}`)
      .send({
        manualMinutesPerRun: 20,
        hourlyWage: 55,
        licenseCostMonthly: 150,
        infrastructureCostPerRun: 0.1,
        currency: "USD",
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.success).toBe(true);
    expect(postRes.body.data.manualMinutesPerRun).toBe(20);
    expect(postRes.body.data.hourlyWage).toBe(55);

    // 2. Fetch assumptions
    const getAssumpRes = await request(app)
      .get("/api/v1/analytics/roi/assumptions")
      .set("Authorization", `Bearer ${ownerTokenA}`);

    expect(getAssumpRes.status).toBe(200);
    expect(getAssumpRes.body.data.hourlyWage).toBe(55);

    // 3. Calculation uses the persisted custom assumption
    const roiRes = await request(app)
      .get("/api/v1/analytics/roi")
      .set("Authorization", `Bearer ${ownerTokenA}`);

    expect(roiRes.status).toBe(200);
    const data = roiRes.body.data;
    // 8 * 20 / 60 = 2.67 hrs; 2.67 * 55 = 146.85
    expect(data.estimatedHoursSaved).toBe(2.67);
    expect(data.estimatedLaborCostAvoided).toBe(146.85);
    expect(data.infrastructureCostTotal).toBe(1.0); // 10 * 0.10
    expect(data.assumptionsUsed.isCustom).toBe(true);
  });

  // ==========================================
  // 2. DATA QUALITY AUDITOR TESTS
  // ==========================================

  it("audits clean operational data and returns a high quality health score", async () => {
    const res = await request(app)
      .get("/api/v1/analytics/data-quality")
      .set("Authorization", `Bearer ${ownerTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const report = res.body.data;

    expect(report.overallQualityScore).toBeGreaterThanOrEqual(95);
    expect(report.status).toBe("PASS");
    expect(report.corruptedRecordsCount).toBe(0);
    expect(report.checks).toHaveLength(5);
    expect(report.issues).toHaveLength(0);
  });

  it("detects corrupted timestamps (negative duration) and orphaned records", async () => {
    // Inject corrupt records
    // 1. Negative duration execution (completed before started)
    apiStore.executions.set("exec_corrupt_time", {
      id: "exec_corrupt_time",
      organizationId: orgA.id,
      workflowId: "wf_invoicing",
      workflowVersionId: "ver_1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      startedAt: new Date(now.getTime()),
      completedAt: new Date(now.getTime() - 10000), // COMPLETED BEFORE STARTED!
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Orphaned step referencing non-existent execution
    apiStore.steps.set("step_orphaned", {
      id: "step_orphaned",
      executionId: "exec_does_not_exist_9999",
      nodeId: "node_1",
      nodeType: "HTTP_REQUEST",
      nodeName: "Orphaned Step",
      status: "COMPLETED",
      attempt: 1,
      startedAt: now,
      completedAt: new Date(now.getTime() + 100),
    });

    const res = await request(app)
      .get("/api/v1/analytics/data-quality")
      .set("Authorization", `Bearer ${adminTokenA}`);

    expect(res.status).toBe(200);
    const report = res.body.data;

    expect(report.corruptedRecordsCount).toBeGreaterThanOrEqual(2);
    expect(
      report.issues.some((i: any) => i.issueType === "NEGATIVE_DURATION"),
    ).toBe(true);
    expect(
      report.issues.some((i: any) => i.issueType === "ORPHANED_RECORD"),
    ).toBe(true);
  });

  // ==========================================
  // 3. GOVERNANCE ANALYTICS TESTS
  // ==========================================

  it("aggregates policy violations and human approval wait times", async () => {
    // Seed violations
    apiStore.policyViolations.set("viol_1", {
      id: "viol_1",
      organizationId: orgA.id,
      policyId: "pol_1",
      policyVersion: 1,
      ruleId: "rule_no_http",
      resourceType: "WORKFLOW",
      resourceId: "wf_1",
      operation: "PUBLISH",
      severity: "CRITICAL",
      reasonCode: "UNENCRYPTED_ENDPOINT",
      message: "Unencrypted HTTP endpoint forbidden",
      status: "OPEN",
      detectedAt: now,
    });
    apiStore.policyViolations.set("viol_2", {
      id: "viol_2",
      organizationId: orgA.id,
      policyId: "pol_1",
      policyVersion: 1,
      ruleId: "rule_no_http",
      resourceType: "WORKFLOW",
      resourceId: "wf_2",
      operation: "PUBLISH",
      severity: "HIGH",
      reasonCode: "UNENCRYPTED_ENDPOINT",
      message: "Unencrypted HTTP endpoint forbidden",
      status: "OPEN",
      detectedAt: now,
    });

    // Seed approvals: 1 pending, 1 approved with 10 min wait time (600,000 ms)
    apiStore.approvals.set("appr_1", {
      id: "appr_1",
      organizationId: orgA.id,
      executionId: "exec_inv_1",
      stepId: "step_1",
      title: "Approve Payment",
      requiredRole: "ADMIN",
      status: "PENDING",
      createdAt: new Date(now.getTime() - 300000),
    });
    apiStore.approvals.set("appr_2", {
      id: "appr_2",
      organizationId: orgA.id,
      executionId: "exec_inv_2",
      stepId: "step_2",
      title: "Approve Invoice",
      requiredRole: "ADMIN",
      status: "APPROVED",
      decidedAt: new Date(now.getTime() - 200000),
      createdAt: new Date(now.getTime() - 800000), // 600,000 ms duration
    });

    const res = await request(app)
      .get("/api/v1/analytics/governance")
      .set("Authorization", `Bearer ${ownerTokenA}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.totalViolations).toBe(2);
    expect(data.violationsBySeverity.CRITICAL).toBe(1);
    expect(data.violationsBySeverity.HIGH).toBe(1);
    expect(data.approvals.total).toBe(2);
    expect(data.approvals.pending).toBe(1);
    expect(data.approvals.approved).toBe(1);
    expect(data.approvals.averageWaitTimeMs).toBe(600000);
  });

  // ==========================================
  // 4. INTEGRATION TELEMETRY TESTS
  // ==========================================

  it("calculates connector reliability, error rates, and p95 latencies", async () => {
    // Seed connections for Org A
    apiStore.connections.set("conn_slack", {
      id: "conn_slack",
      organizationId: orgA.id,
      connectorId: "slack",
      name: "Slack Ops Channel",
      status: "ACTIVE",
      authType: "OAUTH2",
      encryptedData: "enc",
      createdAt: now,
      updatedAt: now,
    });

    // Seed steps using connector slack
    apiStore.steps.set("step_slk_1", {
      id: "step_slk_1",
      executionId: "exec_inv_1",
      nodeId: "node_slack",
      nodeType: "connector_slack",
      nodeName: "Send Slack Notification",
      status: "COMPLETED",
      attempt: 1,
      startedAt: new Date(now.getTime() - 1000),
      completedAt: new Date(now.getTime() - 800), // 200 ms
    });
    apiStore.steps.set("step_slk_2", {
      id: "step_slk_2",
      executionId: "exec_inv_2",
      nodeId: "node_slack",
      nodeType: "connector_slack",
      nodeName: "Send Slack Notification",
      status: "FAILED",
      errorMessage: "HTTP 429 Rate limit exceeded",
      attempt: 1,
      startedAt: new Date(now.getTime() - 2000),
      completedAt: new Date(now.getTime() - 1500), // 500 ms
    });

    const res = await request(app)
      .get("/api/v1/analytics/integrations")
      .set("Authorization", `Bearer ${adminTokenA}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.totalConnections).toBe(1);
    expect(data.activeConnections).toBe(1);
    expect(data.totalInvocations).toBe(2);
    expect(data.rateLimitSpikes).toBe(1);

    const slk = data.connectors[0];
    expect(slk.provider).toBe("slack");
    expect(slk.totalCalls).toBe(2);
    expect(slk.successCount).toBe(1);
    expect(slk.errorCount).toBe(1);
    expect(slk.errorRatePercentage).toBe(50);
    expect(slk.rateLimitHits).toBe(1);
  });

  // ==========================================
  // 5. SAVED REPORTS & EXPORTS TESTS
  // ==========================================

  it("manages saved report definitions and downloads formatted exports", async () => {
    // 1. Create a saved report
    const createRes = await request(app)
      .post("/api/v1/analytics/reports")
      .set("Authorization", `Bearer ${adminTokenA}`)
      .send({
        name: "Monthly ROI Audit",
        description: "Standard executive automation report",
        reportType: "EXECUTIVE_ROI",
        format: "CSV",
        filters: { range: "30d" },
      });

    expect(createRes.status).toBe(201);
    const report = createRes.body.data;
    expect(report.id).toMatch(/^rep_/);
    expect(report.name).toBe("Monthly ROI Audit");

    // 2. List saved reports
    const listRes = await request(app)
      .get("/api/v1/analytics/reports")
      .set("Authorization", `Bearer ${viewerTokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(report.id);

    // 3. Export as CSV
    const exportCsvRes = await request(app)
      .get(`/api/v1/analytics/reports/${report.id}/export?format=CSV`)
      .set("Authorization", `Bearer ${viewerTokenA}`);

    expect(exportCsvRes.status).toBe(200);
    expect(exportCsvRes.headers["content-type"]).toContain("text/csv");
    expect(exportCsvRes.headers["content-disposition"]).toContain(".csv");
    expect(exportCsvRes.text).toContain("Workflow Name");
    expect(exportCsvRes.text).toContain("Invoice Reconciliation");
    expect(exportCsvRes.text).toContain("Net Savings");

    // 4. Export as JSON
    const exportJsonRes = await request(app)
      .get(`/api/v1/analytics/reports/${report.id}/export?format=JSON`)
      .set("Authorization", `Bearer ${viewerTokenA}`);

    expect(exportJsonRes.status).toBe(200);
    expect(exportJsonRes.headers["content-type"]).toContain("application/json");
    const jsonParsed = JSON.parse(exportJsonRes.text);
    expect(jsonParsed.report.id).toBe(report.id);
    expect(jsonParsed.data.totalExecutions).toBe(10);

    // 5. Delete saved report
    const delRes = await request(app)
      .delete(`/api/v1/analytics/reports/${report.id}`)
      .set("Authorization", `Bearer ${adminTokenA}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deleted).toBe(true);

    // Verify 404 after deletion
    const getRes = await request(app)
      .get(`/api/v1/analytics/reports/${report.id}`)
      .set("Authorization", `Bearer ${adminTokenA}`);

    expect(getRes.status).toBe(404);
  });

  // ==========================================
  // 6. MULTI-TENANCY & TENANT ISOLATION TESTS
  // ==========================================

  it("enforces strict tenant isolation across organizations", async () => {
    // Org A creates a report
    const createRes = await request(app)
      .post("/api/v1/analytics/reports")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({
        name: "Confidential Alpha Report",
        reportType: "EXECUTIVE_ROI",
        format: "JSON",
      });

    const reportId = createRes.body.data.id;

    // Org B attempts to read Org A's report
    const getResB = await request(app)
      .get(`/api/v1/analytics/reports/${reportId}`)
      .set("Authorization", `Bearer ${ownerTokenB}`);

    expect(getResB.status).toBe(404);

    // Org B attempts to export Org A's report
    const exportResB = await request(app)
      .get(`/api/v1/analytics/reports/${reportId}/export`)
      .set("Authorization", `Bearer ${ownerTokenB}`);

    expect(exportResB.status).toBe(404);

    // Org B checks ROI - should see 0 executions because all seeded executions belong to Org A
    const roiResB = await request(app)
      .get("/api/v1/analytics/roi")
      .set("Authorization", `Bearer ${ownerTokenB}`);

    expect(roiResB.status).toBe(200);
    expect(roiResB.body.data.totalExecutions).toBe(0);
    expect(roiResB.body.data.netSavings).toBe(0);
  });

  // ==========================================
  // 7. RBAC & PERMISSION CHECKS
  // ==========================================

  it("forbids VIEWER users from mutating ROI assumptions or deleting reports", async () => {
    // VIEWER cannot write ROI assumptions
    const mutateRoi = await request(app)
      .post("/api/v1/analytics/roi/assumptions")
      .set("Authorization", `Bearer ${viewerTokenA}`)
      .send({
        manualMinutesPerRun: 10,
        hourlyWage: 20,
      });

    expect(mutateRoi.status).toBe(403);

    // Create report as ADMIN
    const createRes = await request(app)
      .post("/api/v1/analytics/reports")
      .set("Authorization", `Bearer ${adminTokenA}`)
      .send({
        name: "Admin Protected Report",
        reportType: "DATA_QUALITY",
        format: "JSON",
      });
    const reportId = createRes.body.data.id;

    // VIEWER cannot delete saved report
    const deleteRes = await request(app)
      .delete(`/api/v1/analytics/reports/${reportId}`)
      .set("Authorization", `Bearer ${viewerTokenA}`);

    expect(deleteRes.status).toBe(403);
  });
});
