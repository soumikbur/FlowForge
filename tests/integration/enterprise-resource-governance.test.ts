import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { resourceGovernanceService } from "../../apps/api/src/services/resource-governance.service.js";
import {
  WorkflowDefinition,
  ResourceQuotaInput,
  WorkflowExecutionRecord,
} from "@flowforge/shared";

describe("Prompt 35 — Enterprise Resource Governance, Execution Quotas, Fair Scheduling, and Cost Controls", () => {
  const validBcryptHash =
    "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY5k7rhKhGfdW.q";

  const orgA = {
    id: "org_res_alpha",
    name: "Resource Alpha Corp",
    slug: "resource-alpha",
    billingEmail: "admin@resalpha.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgB = {
    id: "org_res_beta",
    name: "Resource Beta Corp",
    slug: "resource-beta",
    billingEmail: "admin@resbeta.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const wsA1 = {
    id: "ws_res_alpha_1",
    organizationId: orgA.id,
    name: "Alpha Workspace 1",
    slug: "alpha-ws-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerUserB: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;
  let ownerTokenB: string;

  let runner: WorkflowExecutionRunner;

  const standardDefinition: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger",
        type: "TRIGGER",
        name: "Manual Start",
        config: { triggerType: "MANUAL" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node_end",
        type: "END",
        name: "Finish",
        config: {},
        position: { x: 50, y: 200 },
      },
    ],
    edges: [{ id: "e1", source: "node_trigger", target: "node_end" }],
  };

  beforeEach(() => {
    apiStore.clear();

    apiStore.organizations.set(orgA.id, orgA);
    apiStore.organizations.set(orgB.id, orgB);
    apiStore.workspaces.set(wsA1.id, wsA1);

    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@resalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@resalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@resalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@resalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@resbeta.io",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
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

    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    memberTokenA = `tok_member_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
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
    apiStore.sessions.set(memberTokenA, {
      id: "sess_member_a",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });
    apiStore.sessions.set(viewerTokenA, {
      id: "sess_viewer_a",
      userId: viewerUserA.id,
      token: viewerTokenA,
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

    runner = new WorkflowExecutionRunner(apiStore as any);
  });

  // =========================================================================
  // 1. Effective Quota Resolution & Multi-Tier Hierarchy
  // =========================================================================
  describe("1. Multi-Tier Hierarchical Quota Resolution", () => {
    it("resolves default plan entitlements when no custom quota override is set", async () => {
      const res = await request(app)
        .get("/api/v1/governance/quotas/effective")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scopeType).toBe("PLAN_DEFAULT");
      expect(res.body.data.maxConcurrentExecutions).toBe(50);
      expect(res.body.data.maxMonthlyExecutions).toBe(10000);
      expect(res.body.data.maxQueueDepth).toBe(50);
    });

    it("upserts organization-level quota and respects hierarchical overrides", async () => {
      // 1. Set Organization-level quota
      const orgQuotaInput: ResourceQuotaInput = {
        scopeType: "ORGANIZATION",
        maxConcurrentExecutions: 20,
        maxQueueDepth: 100,
        maxMonthlyExecutions: 25000,
        maxExecutionDurationMs: 400000,
        maxStepCount: 300,
        maxConnectorCallsPerRun: 75,
        fairShareWeight: 15,
        monthlyBudgetDollars: 1200,
        enforcementAction: "REJECT",
      };

      const orgRes = await request(app)
        .post("/api/v1/governance/quotas")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send(orgQuotaInput);

      expect(orgRes.status).toBe(201);
      expect(orgRes.body.data.maxConcurrentExecutions).toBe(20);

      // Verify effective quota at Org level
      const effOrg = await request(app)
        .get("/api/v1/governance/quotas/effective")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(effOrg.status).toBe(200);
      expect(effOrg.body.data.scopeType).toBe("ORGANIZATION");
      expect(effOrg.body.data.maxConcurrentExecutions).toBe(20);

      // 2. Set Workspace-level override
      await request(app)
        .post("/api/v1/governance/quotas")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({
          scopeType: "WORKSPACE",
          workspaceId: wsA1.id,
          maxConcurrentExecutions: 12,
          maxQueueDepth: 40,
          maxMonthlyExecutions: 8000,
          fairShareWeight: 20,
        });

      // Verify effective quota for Workspace 1
      const effWs = await request(app)
        .get(`/api/v1/governance/quotas/effective?workspaceId=${wsA1.id}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(effWs.status).toBe(200);
      expect(effWs.body.data.scopeType).toBe("WORKSPACE");
      expect(effWs.body.data.maxConcurrentExecutions).toBe(12);

      // 3. Set Workflow-level override (highest precedence)
      const wfId = "wf_alpha_critical_sync";
      await request(app)
        .post("/api/v1/governance/quotas")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({
          scopeType: "WORKFLOW",
          workflowId: wfId,
          workspaceId: wsA1.id,
          maxConcurrentExecutions: 4,
          maxQueueDepth: 15,
          maxMonthlyExecutions: 2000,
          fairShareWeight: 30,
        });

      // Verify Workflow override wins over Workspace and Org
      const effWf = await request(app)
        .get(
          `/api/v1/governance/quotas/effective?workspaceId=${wsA1.id}&workflowId=${wfId}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(effWf.status).toBe(200);
      expect(effWf.body.data.scopeType).toBe("WORKFLOW");
      expect(effWf.body.data.maxConcurrentExecutions).toBe(4);
      expect(effWf.body.data.fairShareWeight).toBe(30);
    });
  });

  // =========================================================================
  // 2. Admission Control & Backpressure Enforcement
  // =========================================================================
  describe("2. Admission Control & Backpressure Enforcement", () => {
    let testWorkflow: any;
    let testVersion: any;

    beforeEach(() => {
      testWorkflow = {
        id: "wf_admission_test",
        organizationId: orgA.id,
        workspaceId: wsA1.id,
        name: "Admission Test Workflow",
        status: "ACTIVE",
        publishedVersionId: "ver_admission_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      testVersion = {
        id: "ver_admission_test",
        workflowId: testWorkflow.id,
        version: 1,
        definition: standardDefinition,
        createdAt: new Date(),
      };

      apiStore.workflows.set(testWorkflow.id, testWorkflow);
      apiStore.versions.set(testVersion.id, testVersion);
    });

    it("enforces concurrency limits and returns HTTP 429 with Retry-After", async () => {
      // Set concurrency limit to 2
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxConcurrentExecutions: 2,
        enforcementAction: "REJECT",
      });

      // Populate 2 active RUNNING executions
      apiStore.executions.set("exec_running_1", {
        id: "exec_running_1",
        organizationId: orgA.id,
        workflowId: testWorkflow.id,
        workflowVersionId: testVersion.id,
        status: "RUNNING",
        triggerType: "MANUAL",
        environment: "production",
        startedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.executions.set("exec_running_2", {
        id: "exec_running_2",
        organizationId: orgA.id,
        workflowId: testWorkflow.id,
        workflowVersionId: testVersion.id,
        status: "RUNNING",
        triggerType: "MANUAL",
        environment: "production",
        startedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Attempt 3rd execution via API
      const res = await request(app)
        .post(`/api/v1/workflows/${testWorkflow.id}/execute`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({});

      expect(res.status).toBe(429);
      expect(res.headers["retry-after"]).toBe("15");
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("CONCURRENT_EXECUTION_LIMIT_EXCEEDED");
    });

    it("enforces queue depth backpressure and returns HTTP 429 with Retry-After: 30", async () => {
      // Set maxQueueDepth to 3
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxConcurrentExecutions: 10,
        maxQueueDepth: 3,
        enforcementAction: "REJECT",
      });

      // Populate 3 QUEUED executions
      for (let i = 1; i <= 3; i++) {
        apiStore.executions.set(`exec_queued_${i}`, {
          id: `exec_queued_${i}`,
          organizationId: orgA.id,
          workflowId: testWorkflow.id,
          workflowVersionId: testVersion.id,
          status: "QUEUED",
          triggerType: "WEBHOOK",
          environment: "production",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Inbound webhook trigger
      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${testWorkflow.id}`)
        .send({ event: "order_created", amount: 150 });

      expect(res.status).toBe(429);
      expect(res.headers["retry-after"]).toBe("30");
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("REJECTED_QUEUE_CAPACITY");
    });

    it("rejects executions with HTTP 402 when monthly quota is exhausted", async () => {
      // Set monthly execution limit to 5
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxMonthlyExecutions: 5,
        enforcementAction: "REJECT",
      });

      // Pre-fill 5 executions in the current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      for (let i = 1; i <= 5; i++) {
        apiStore.executions.set(`exec_month_${i}`, {
          id: `exec_month_${i}`,
          organizationId: orgA.id,
          workflowId: testWorkflow.id,
          workflowVersionId: testVersion.id,
          status: "SUCCEEDED",
          triggerType: "MANUAL",
          environment: "production",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const res = await request(app)
        .post(`/api/v1/workflows/${testWorkflow.id}/execute`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({});

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
    });

    it("rejects executions with HTTP 402 when cost budget ceiling is exceeded", async () => {
      // Set cost budget ceiling to $100 with high monthly execution limit
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxMonthlyExecutions: 100000,
        monthlyBudgetDollars: 100,
        enforcementAction: "REJECT",
      });

      // Add usage records totaling $105 spend (10500 quantity * $0.01 = $105)
      apiStore.usageRecords.set("usage_1", {
        id: "usage_1",
        organizationId: orgA.id,
        metric: "WORKFLOW_EXECUTION",
        quantity: 10500,
        periodStart: new Date(Date.now() - 86400000),
        periodEnd: new Date(Date.now() + 86400000),
        recordedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/workflows/${testWorkflow.id}/execute`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({});

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("REJECTED_BUDGET");
    });

    it("ensures atomic admission idempotency without double reservation", () => {
      const idempotencyKey = "idem_key_unique_admission_123";

      const decision1 = resourceGovernanceService.admitExecution({
        organizationId: orgA.id,
        workflowId: testWorkflow.id,
        workflowVersionId: testVersion.id,
        triggerType: "MANUAL",
        idempotencyKey,
      });

      expect(decision1.allowed).toBe(true);
      expect(decision1.statusCode).toBe(202);
      const executionId = decision1.execution?.id;
      expect(executionId).toBeDefined();

      // Check reservation was created
      const reservations = Array.from(apiStore.resourceReservations.values());
      expect(reservations.length).toBe(1);
      expect(reservations[0].executionId).toBe(executionId);

      // Repeat with same idempotency key
      const decision2 = resourceGovernanceService.admitExecution({
        organizationId: orgA.id,
        workflowId: testWorkflow.id,
        workflowVersionId: testVersion.id,
        triggerType: "MANUAL",
        idempotencyKey,
      });

      expect(decision2.allowed).toBe(true);
      expect(decision2.statusCode).toBe(200);
      expect(decision2.execution?.id).toBe(executionId);

      // Verify no extra reservation was created
      const reservationsAfter = Array.from(
        apiStore.resourceReservations.values(),
      );
      expect(reservationsAfter.length).toBe(1);
    });
  });

  // =========================================================================
  // 3. Fair Scheduling & Anti-Starvation Dispatching
  // =========================================================================
  describe("3. Tenant-Aware Fair Scheduling (Deficit Round Robin)", () => {
    it("interleaves executions across tenants to prevent noisy-neighbor starvation", () => {
      // Create queued executions: 6 for Tenant A, 2 for Tenant B
      for (let i = 1; i <= 6; i++) {
        apiStore.executions.set(`exec_fair_a_${i}`, {
          id: `exec_fair_a_${i}`,
          organizationId: orgA.id,
          workflowId: "wf_a",
          workflowVersionId: "ver_a",
          status: "QUEUED",
          triggerType: "MANUAL",
          environment: "production",
          createdAt: new Date(Date.now() + i * 10),
          updatedAt: new Date(),
        });
      }

      for (let i = 1; i <= 2; i++) {
        apiStore.executions.set(`exec_fair_b_${i}`, {
          id: `exec_fair_b_${i}`,
          organizationId: orgB.id,
          workflowId: "wf_b",
          workflowVersionId: "ver_b",
          status: "QUEUED",
          triggerType: "MANUAL",
          environment: "production",
          createdAt: new Date(Date.now() + i * 10),
          updatedAt: new Date(),
        });
      }

      // Dispatch a batch of 4 items
      const batch = runner.scheduleFairBatch(4);

      expect(batch.length).toBe(4);
      const orgOfFirst = apiStore.executions.get(batch[0])?.organizationId;
      const orgOfSecond = apiStore.executions.get(batch[1])?.organizationId;
      const orgOfThird = apiStore.executions.get(batch[2])?.organizationId;
      const orgOfFourth = apiStore.executions.get(batch[3])?.organizationId;

      expect(orgOfFirst).not.toBe(orgOfSecond);
      expect(orgOfThird).toBe(orgOfFirst);
      expect(orgOfFourth).toBe(orgOfSecond);
    });
  });

  // =========================================================================
  // 4. Runtime Execution Budget Enforcement
  // =========================================================================
  describe("4. Worker Runtime Budget Enforcement", () => {
    it("fails execution with RESOURCE_BUDGET_EXCEEDED: STEPS when maxStepCount is reached", async () => {
      const stepWorkflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_step_1",
            type: "HTTP_REQUEST",
            name: "Step 1",
            config: { url: "https://example.com/s1", method: "GET" },
            position: { x: 0, y: 100 },
          },
          {
            id: "node_step_2",
            type: "HTTP_REQUEST",
            name: "Step 2",
            config: { url: "https://example.com/s2", method: "GET" },
            position: { x: 0, y: 200 },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
            position: { x: 0, y: 300 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_step_1" },
          { id: "e2", source: "node_step_1", target: "node_step_2" },
          { id: "e3", source: "node_step_2", target: "node_end" },
        ],
      };

      const wfId = "wf_budget_steps";
      const verId = "ver_budget_steps";
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Step Budget Workflow",
        status: "ACTIVE",
        publishedVersionId: verId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      apiStore.versions.set(verId, {
        id: verId,
        workflowId: wfId,
        version: 1,
        definition: stepWorkflowDef,
        createdAt: new Date(),
      });

      // Set maxStepCount = 1 and maxConnectorCallsPerRun = 50 so step limit triggers first
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxStepCount: 1,
        maxConnectorCallsPerRun: 50,
      });

      const execRecord: WorkflowExecutionRecord = {
        id: "exec_budget_steps_1",
        organizationId: orgA.id,
        workflowId: wfId,
        workflowVersionId: verId,
        status: "QUEUED",
        triggerType: "MANUAL",
        environment: "production",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.executions.set(execRecord.id, execRecord);

      const processed = await runner.processExecution(execRecord.id);

      expect(processed.status).toBe("FAILED");
      expect(processed.errorDetails?.code).toBe("RESOURCE_BUDGET_EXCEEDED");
      expect(processed.errorDetails?.dimension).toBe("STEPS");
    });

    it("fails execution with RESOURCE_BUDGET_EXCEEDED: CONNECTOR_CALLS when maxConnectorCallsPerRun is reached", async () => {
      const httpWorkflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_http_1",
            type: "HTTP_REQUEST",
            name: "Call API 1",
            config: { url: "https://example.com/api1", method: "GET" },
            position: { x: 0, y: 100 },
          },
          {
            id: "node_http_2",
            type: "HTTP_REQUEST",
            name: "Call API 2",
            config: { url: "https://example.com/api2", method: "GET" },
            position: { x: 0, y: 200 },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
            position: { x: 0, y: 300 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_http_1" },
          { id: "e2", source: "node_http_1", target: "node_http_2" },
          { id: "e3", source: "node_http_2", target: "node_end" },
        ],
      };

      const wfId = "wf_budget_connectors";
      const verId = "ver_budget_connectors";
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Connector Budget Workflow",
        status: "ACTIVE",
        publishedVersionId: verId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      apiStore.versions.set(verId, {
        id: verId,
        workflowId: wfId,
        version: 1,
        definition: httpWorkflowDef,
        createdAt: new Date(),
      });

      // Set maxConnectorCallsPerRun = 1
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxStepCount: 100,
        maxConnectorCallsPerRun: 1,
      });

      const execRecord: WorkflowExecutionRecord = {
        id: "exec_budget_conn_1",
        organizationId: orgA.id,
        workflowId: wfId,
        workflowVersionId: verId,
        status: "QUEUED",
        triggerType: "MANUAL",
        environment: "production",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.executions.set(execRecord.id, execRecord);

      const processed = await runner.processExecution(execRecord.id);

      expect(processed.status).toBe("FAILED");
      expect(processed.errorDetails?.code).toBe("RESOURCE_BUDGET_EXCEEDED");
      expect(processed.errorDetails?.dimension).toBe("CONNECTOR_CALLS");
    });
  });

  // =========================================================================
  // 5. Resource State Reconciliation & Leak Protection
  // =========================================================================
  describe("5. Resource State Reconciliation", () => {
    it("prunes expired reservations and recovers stale running executions", async () => {
      // 1. Expired reservation (> 10 minutes old)
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      apiStore.resourceReservations.set("res_stale_1", {
        id: "res_stale_1",
        organizationId: orgA.id,
        executionId: "exec_stale_res_1",
        status: "ACTIVE",
        reservedAt: elevenMinutesAgo,
        expiresAt: new Date(elevenMinutesAgo.getTime() + 10 * 60 * 1000),
      });

      // 2. Active fresh reservation
      apiStore.resourceReservations.set("res_fresh_1", {
        id: "res_fresh_1",
        organizationId: orgA.id,
        executionId: "exec_fresh_res_1",
        status: "ACTIVE",
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 3. Stale RUNNING execution (> 30 minutes old)
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      apiStore.executions.set("exec_stale_run_1", {
        id: "exec_stale_run_1",
        organizationId: orgA.id,
        workflowId: "wf_stale",
        workflowVersionId: "ver_stale",
        status: "RUNNING",
        triggerType: "MANUAL",
        environment: "production",
        startedAt: thirtyFiveMinutesAgo,
        createdAt: thirtyFiveMinutesAgo,
        updatedAt: thirtyFiveMinutesAgo,
      });

      const res = await request(app)
        .post("/api/v1/governance/quotas/reconcile")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expiredReservationsCleared).toBe(1);
      expect(res.body.data.staleExecutionsRecovered).toBe(1);

      // Verify expired reservation was cleared
      expect(apiStore.resourceReservations.get("res_stale_1")?.status).toBe(
        "EXPIRED",
      );
      // Verify fresh reservation remains ACTIVE
      expect(apiStore.resourceReservations.get("res_fresh_1")?.status).toBe(
        "ACTIVE",
      );
      // Verify stale execution was marked FAILED
      expect(apiStore.executions.get("exec_stale_run_1")?.status).toBe(
        "FAILED",
      );
    });
  });

  // =========================================================================
  // 6. Tenant Isolation & RBAC Governance
  // =========================================================================
  describe("6. Multi-Tenant Isolation & Role-Based Access Control", () => {
    it("strictly isolates quotas and utilization across organizations", async () => {
      // Set quota for Org A
      resourceGovernanceService.upsertQuotaPolicy(orgA.id, {
        scopeType: "ORGANIZATION",
        maxConcurrentExecutions: 88,
      });

      // Set quota for Org B
      resourceGovernanceService.upsertQuotaPolicy(orgB.id, {
        scopeType: "ORGANIZATION",
        maxConcurrentExecutions: 33,
      });

      // User B queries effective quota
      const resB = await request(app)
        .get("/api/v1/governance/quotas/effective")
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .set("x-organization-id", orgB.id);

      expect(resB.status).toBe(200);
      expect(resB.body.data.maxConcurrentExecutions).toBe(33);

      // User A queries utilization
      const resA = await request(app)
        .get("/api/v1/governance/quotas/utilization")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(resA.status).toBe(200);
      expect(resA.body.data.concurrentExecutions.limit).toBe(88);
    });

    it("enforces RBAC permissions: VIEWER can read but cannot write or reconcile", async () => {
      // VIEWER can read
      const readRes = await request(app)
        .get("/api/v1/governance/quotas")
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(readRes.status).toBe(200);

      // VIEWER cannot write (requires quotas:write)
      const writeRes = await request(app)
        .post("/api/v1/governance/quotas")
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({
          scopeType: "ORGANIZATION",
          maxConcurrentExecutions: 99,
        });

      expect(writeRes.status).toBe(403);

      // VIEWER cannot reconcile (requires quotas:admin)
      const reconcileRes = await request(app)
        .post("/api/v1/governance/quotas/reconcile")
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({});

      expect(reconcileRes.status).toBe(403);
    });
  });
});
