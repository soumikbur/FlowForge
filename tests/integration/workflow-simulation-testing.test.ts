import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { simulationService } from "../../apps/api/src/services/simulation.service.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 36 — Workflow Simulation, Test Automation, Debugging, and Safe Execution Validation", () => {
  const validBcryptHash =
    "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY5k7rhKhGfdW.q";

  const orgA = {
    id: "org_sim_alpha",
    name: "Simulation Alpha Corp",
    slug: "sim-alpha",
    billingEmail: "admin@simalpha.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgB = {
    id: "org_sim_beta",
    name: "Simulation Beta Corp",
    slug: "sim-beta",
    billingEmail: "admin@simbeta.io",
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

  // Workflow definition with branching, an HTTP request, and an End node
  const branchingWorkflowDef: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger",
        type: "TRIGGER",
        name: "Order Webhook",
        config: { triggerType: "WEBHOOK" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node_condition",
        type: "CONDITION",
        name: "Check Amount Threshold",
        config: {
          expression: "amount > 100",
        },
        position: { x: 50, y: 150 },
      },
      {
        id: "node_http_high_value",
        type: "HTTP_REQUEST",
        name: "Notify Premium Order API",
        config: {
          url: "https://api.external-vendor.com/v1/orders/premium",
          method: "POST",
          apiKey: "secret_live_api_key_12345",
        },
        position: { x: 150, y: 250 },
      },
      {
        id: "node_end_low_value",
        type: "END",
        name: "Standard Order End",
        config: {},
        position: { x: -50, y: 250 },
      },
      {
        id: "node_end_high_value",
        type: "END",
        name: "Premium Order End",
        config: {},
        position: { x: 150, y: 350 },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger", target: "node_condition" },
      {
        id: "e2",
        source: "node_condition",
        target: "node_http_high_value",
        sourceHandle: "true",
      },
      {
        id: "e3",
        source: "node_condition",
        target: "node_end_low_value",
        sourceHandle: "false",
      },
      {
        id: "e4",
        source: "node_http_high_value",
        target: "node_end_high_value",
      },
    ],
  };

  let workflowA: any;

  beforeEach(() => {
    apiStore.clear();

    apiStore.organizations.set(orgA.id, orgA);
    apiStore.organizations.set(orgB.id, orgB);

    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@simalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@simalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@simalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@simalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@simbeta.io",
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

    // Seed workflow for orgA
    workflowA = {
      id: "wf_sim_test_001",
      organizationId: orgA.id,
      name: "High Value Order Processor",
      description: "Workflow with branching and mocked HTTP calls",
      draftDefinition: JSON.parse(JSON.stringify(branchingWorkflowDef)),
      draftRevision: 1,
      status: "DRAFT",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.workflows.set(workflowA.id, workflowA);
  });

  // ==========================================
  // 1. STATIC VALIDATION MODE
  // ==========================================
  describe("1. Static Validation Mode", () => {
    it("validates workflow graph structure and halts prior to any execution", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "STATIC_VALIDATION",
          inputData: { amount: 200 },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe("STATIC_VALIDATION");
      expect(res.body.data.status).toBe("COMPLETED");
      expect(res.body.data.executedNodes).toBe(0);
      expect(res.body.data.sideEffectsPrevented).toBe(true);
      expect(res.body.data.executionPath).toHaveLength(0);
    });
  });

  // ==========================================
  // 2. SIMULATION MODE & DETERMINISTIC BRANCHING
  // ==========================================
  describe("2. Simulation Mode & Branching", () => {
    it("evaluates true condition path and skips false branch deterministically without external side effects", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: { amount: 250, orderId: "ORD-999" },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.status).toBe("COMPLETED");
      expect(data.sideEffectsPrevented).toBe(true);
      expect(data.realIntegrationExecuted).toBe(false);

      // True branch should execute node_http_high_value and node_end_high_value
      expect(data.executionPath).toContain("node_trigger");
      expect(data.executionPath).toContain("node_condition");
      expect(data.executionPath).toContain("node_http_high_value");
      expect(data.executionPath).toContain("node_end_high_value");
      expect(data.executionPath).not.toContain("node_end_low_value");

      // False branch should be unreachable / skipped
      expect(data.unreachableNodes).toContain("node_end_low_value");
      expect(data.nodeResults["node_end_low_value"].status).toBe("NOT_REACHED");

      // HTTP request node should be mocked
      expect(data.nodeResults["node_http_high_value"].mocked).toBe(true);
      expect(data.nodeResults["node_http_high_value"].status).toBe("MOCKED");
    });

    it("evaluates false condition path when amount is <= 100", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: { amount: 50 },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.executionPath).toContain("node_end_low_value");
      expect(data.executionPath).not.toContain("node_http_high_value");
      expect(data.executionPath).not.toContain("node_end_high_value");
      expect(data.unreachableNodes).toContain("node_http_high_value");
    });
  });

  // ==========================================
  // 3. MOCKED INTEGRATION & FIXTURES
  // ==========================================
  describe("3. Mocked Integration Mode & Fixtures", () => {
    it("intercepts external HTTP connector calls and returns configured fixture payload", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "MOCKED_INTEGRATION",
          inputData: { amount: 500 },
          mockFixtures: {
            node_http_high_value: {
              statusCode: 201,
              responsePayload: {
                id: "ext_order_777",
                status: "APPROVED_BY_VENDOR",
              },
            },
          },
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.mode).toBe("MOCKED_INTEGRATION");
      expect(data.mockedNodes).toBeGreaterThan(0);

      const httpResult = data.nodeResults["node_http_high_value"];
      expect(httpResult.status).toBe("MOCKED");
      expect(httpResult.mocked).toBe(true);
      expect(httpResult.outputPayload).toEqual({
        id: "ext_order_777",
        status: "APPROVED_BY_VENDOR",
        statusCode: 201,
      });
    });

    it("allows creating and managing reusable test fixtures via /api/v1/testing/fixtures", async () => {
      const createRes = await request(app)
        .post("/api/v1/testing/fixtures")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          name: "Stripe Charge Succeeded Fixture",
          connectorType: "stripe",
          operation: "charges.create",
          statusCode: 200,
          responsePayload: { chargeId: "ch_test_123", paid: true },
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const fixtureId = createRes.body.data.id;

      const listRes = await request(app)
        .get("/api/v1/testing/fixtures")
        .set("Authorization", `Bearer ${memberTokenA}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((f: any) => f.id === fixtureId)).toBe(true);

      const delRes = await request(app)
        .delete(`/api/v1/testing/fixtures/${fixtureId}`)
        .set("Authorization", `Bearer ${adminTokenA}`);
      expect(delRes.status).toBe(200);
    });
  });

  // ==========================================
  // 4. ISOLATED REAL INTEGRATION ESCALATION GUARD
  // ==========================================
  describe("4. Isolated Real Integration Escalation Guard", () => {
    it("rejects unauthorized real integration attempts without owner/admin authorization", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "ISOLATED_REAL_INTEGRATION",
          authorizedForRealIntegration: true,
          inputData: { amount: 150 },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("REAL_INTEGRATION_NOT_AUTHORIZED");
    });

    it("permits real integration mode only when explicitly authorized by an admin/owner", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          mode: "ISOLATED_REAL_INTEGRATION",
          authorizedForRealIntegration: true,
          inputData: { amount: 150 },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe("ISOLATED_REAL_INTEGRATION");
      expect(res.body.data.realIntegrationExecuted).toBe(true);
    });
  });

  // ==========================================
  // 5. TEST CASES & ASSERTION EVALUATION
  // ==========================================
  describe("5. Test Cases and Assertions", () => {
    it("creates a test case and evaluates assertions successfully", async () => {
      const createRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          name: "High Value Order Passes Through Webhook",
          description: "Verifies high value order branch execution",
          mode: "SIMULATION",
          inputData: { amount: 500, customerId: "cust_123" },
          assertionRules: [
            {
              type: "NODE_EXECUTED",
              target: "node_http_high_value",
            },
            {
              type: "BRANCH_TAKEN",
              target: "node_condition",
              expected: "true",
            },
            {
              type: "NODE_SKIPPED",
              target: "node_end_low_value",
            },
          ],
        });

      expect(createRes.status).toBe(201);
      const testCaseId = createRes.body.data.id;

      // Run the test case
      const runRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests/${testCaseId}/run`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({});

      expect(runRes.status).toBe(200);
      expect(runRes.body.success).toBe(true);
      const run = runRes.body.data;
      expect(run.status).toBe("PASSED");
      expect(run.assertionResults).toHaveLength(3);
      expect(run.assertionResults.every((a: any) => a.passed)).toBe(true);
    });

    it("correctly flags assertion failure when expected condition is not met", async () => {
      const createRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          name: "Failing Assertion Test",
          mode: "SIMULATION",
          inputData: { amount: 50 }, // triggers false branch
          assertionRules: [
            {
              type: "NODE_EXECUTED",
              target: "node_http_high_value", // Expect high value node to execute, but it won't!
            },
          ],
        });

      const testCaseId = createRes.body.data.id;

      const runRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests/${testCaseId}/run`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({});

      expect(runRes.status).toBe(200);
      const run = runRes.body.data;
      expect(run.status).toBe("FAILED");
      expect(run.assertionResults[0].passed).toBe(false);
      expect(run.assertionResults[0].actual).toBe(false);
    });

    it("runs entire test suite with run-all endpoint", async () => {
      await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          name: "Suite Test Case 1",
          mode: "SIMULATION",
          inputData: { amount: 200 },
          assertionRules: [
            {
              type: "NODE_EXECUTED",
              target: "node_http_high_value",
            },
          ],
        });

      const runAllRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests/run-all`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(runAllRes.status).toBe(200);
      expect(runAllRes.body.data.totalTests).toBeGreaterThan(0);
      expect(runAllRes.body.data.results).toBeInstanceOf(Array);
    });
  });

  // ==========================================
  // 6. REGRESSION TESTING & VERSION COMPARISON
  // ==========================================
  describe("6. Regression Testing & Version Comparison", () => {
    it("detects branch divergence and execution regressions across workflow versions", async () => {
      // 1. Create a published version of workflowA
      const ver1Id = "ver_sim_1";
      apiStore.versions.set(ver1Id, {
        id: ver1Id,
        workflowId: workflowA.id,
        versionNumber: 1,
        definition: JSON.parse(JSON.stringify(branchingWorkflowDef)),
        publishedAt: new Date(),
        contentHash: "hash_ver1",
      });

      // 2. Modify draft definition to invert condition operator
      const modifiedDef = JSON.parse(JSON.stringify(branchingWorkflowDef));
      modifiedDef.nodes[1].config.expression = "amount < 100"; // Inverted logic!
      workflowA.draftDefinition = modifiedDef;
      apiStore.workflows.set(workflowA.id, workflowA);

      // 3. Compare draft with version 1 using amount: 200
      const compRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/compare`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          targetVersionId: ver1Id,
          testInput: { amount: 200 },
        });

      expect(compRes.status).toBe(200);
      const diff = compRes.body.data;
      expect(diff.pathIdentical).toBe(false);
      expect(diff.hasRegressions).toBe(true);
      expect(diff.basePath).not.toEqual(diff.targetPath);
    });
  });

  // ==========================================
  // 7. STEPWISE DEBUGGING & BREAKPOINTS
  // ==========================================
  describe("7. Stepwise Debugging & Breakpoints", () => {
    it("pauses execution at breakpoint and allows stepwise inspection and resumption", async () => {
      // Start debug session with breakpoint on node_condition
      const startRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/debug/session`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: { amount: 300 },
          breakpoints: ["node_condition"],
        });

      expect(startRes.status).toBe(201);
      const session = startRes.body.data;
      expect(session.id).toBeDefined();
      expect(session.status).toBe("PAUSED");
      expect(session.activeBreakpointNodeId).toBe("node_condition");

      // Step forward by one node
      const stepRes = await request(app)
        .post(
          `/api/v1/workflows/${workflowA.id}/debug/session/${session.id}/step`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(stepRes.status).toBe(200);
      expect(stepRes.body.data.currentStepIndex).toBe(2);

      // Resume to completion
      const resumeRes = await request(app)
        .post(
          `/api/v1/workflows/${workflowA.id}/debug/session/${session.id}/resume`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.status).toBe("COMPLETED");

      // Cancel session
      const cancelRes = await request(app)
        .delete(`/api/v1/workflows/${workflowA.id}/debug/session/${session.id}`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.cancelled).toBe(true);
    });
  });

  // ==========================================
  // 8. FAILURE INJECTION & RESILIENCE
  // ==========================================
  describe("8. Failure Injection & Resilience", () => {
    it("injects timeout and rate limit failures on specific nodes during simulation", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: { amount: 500 },
          failureInjections: [
            {
              nodeId: "node_http_high_value",
              type: "RATE_LIMIT_429",
              message: "Simulated Rate Limit Exhaustion",
            },
          ],
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      const httpResult = data.nodeResults["node_http_high_value"];
      expect(httpResult.status).toBe("FAILED");
      expect(httpResult.error?.code).toBe("RATE_LIMIT_429");
      expect(httpResult.error?.message).toContain(
        "Simulated Rate Limit Exhaustion",
      );
    });
  });

  // ==========================================
  // 9. CONNECTOR CONTRACT VALIDATION
  // ==========================================
  describe("9. Connector Contract Validation", () => {
    it("validates connector operation payloads and auth contracts without external calls", async () => {
      const validRes = await request(app)
        .post("/api/v1/testing/contracts/validate")
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          connectorType: "http",
          operation: "request",
          payload: {
            url: "https://api.example.com/webhook",
            method: "POST",
          },
        });

      expect(validRes.status).toBe(200);
      expect(validRes.body.data.valid).toBe(true);

      const invalidRes = await request(app)
        .post("/api/v1/testing/contracts/validate")
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          connectorType: "http",
          operation: "request",
          payload: {
            method: "POST", // missing url!
          },
        });

      expect(invalidRes.status).toBe(200);
      expect(invalidRes.body.data.valid).toBe(false);
      expect(invalidRes.body.data.errors).toHaveLength(1);
    });
  });

  // ==========================================
  // 10. PUBLISHING GATES & RELEASE ENFORCEMENT
  // ==========================================
  describe("10. Publishing Gates Enforcement", () => {
    it("evaluates publishing gates status via /gate-status and updates config", async () => {
      const statusRes = await request(app)
        .get(`/api/v1/workflows/${workflowA.id}/gate-status`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.checks).toBeDefined();

      const configRes = await request(app)
        .put(`/api/v1/workflows/${workflowA.id}/gate-config`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          requireTestSuitePass: true,
          minTestPassRate: 1.0,
          requireStaticValidation: true,
        });

      expect(configRes.status).toBe(200);
      expect(configRes.body.data.requireTestSuitePass).toBe(true);
    });

    it("blocks workflow publication with 422 PUBLISHING_GATE_BLOCKED if tests fail", async () => {
      // 1. Configure strict gate
      await request(app)
        .put(`/api/v1/workflows/${workflowA.id}/gate-config`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          requireTestSuitePass: true,
          minTestPassRate: 1.0,
        });

      // 2. Add failing test case
      await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          name: "Intentionally Failing Test",
          mode: "SIMULATION",
          inputData: { amount: 10 },
          assertionRules: [
            {
              type: "NODE_EXECUTED",
              nodeId: "node_http_high_value",
            },
          ],
        });

      // 3. Attempt to publish workflow
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/publish`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({});

      expect(pubRes.status).toBe(422);
      expect(pubRes.body.error.code).toBe("PUBLISHING_GATE_BLOCKED");
      expect(
        pubRes.body.error.details.some((r: string) =>
          r.includes("Test suite pass requirement not met"),
        ),
      ).toBe(true);

      // 4. Force publish bypasses the gate
      const forcePubRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/publish`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ force: true });

      expect(forcePubRes.status).toBe(201);
      expect(forcePubRes.body.success).toBe(true);
    });
  });

  // ==========================================
  // 11. SENSITIVE CREDENTIAL REDACTION
  // ==========================================
  describe("11. Sensitive Credential Redaction", () => {
    it("redacts secret tokens and passwords in simulated node outputs and traces", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: {
            amount: 500,
            userSecretToken: "super_secret_token_value",
          },
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      const httpNodeResult = data.nodeResults["node_http_high_value"];

      // Verify input payload has redacted token
      const inputStr = JSON.stringify(httpNodeResult.inputPayload);
      expect(inputStr).not.toContain("secret_live_api_key_12345");
      expect(inputStr).toContain("[REDACTED]");
      expect(httpNodeResult.redactedFields).toContain("apiKey");
    });
  });

  // ==========================================
  // 12. MULTI-TENANT ISOLATION
  // ==========================================
  describe("12. Multi-Tenant Isolation", () => {
    it("prevents Organization B from reading, simulating, or running Org A's tests", async () => {
      // 1. Org B tries to simulate Org A's workflow
      const simRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({
          mode: "SIMULATION",
          inputData: { amount: 100 },
        });

      expect(simRes.status).toBe(404);

      // 2. Org B tries to list Org A's test cases
      const testRes = await request(app)
        .get(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(testRes.status).toBe(200);
      expect(testRes.body.data).toEqual([]);
    });
  });

  // ==========================================
  // 13. RBAC ENFORCEMENT
  // ==========================================
  describe("13. RBAC Enforcement", () => {
    it("allows VIEWER to inspect test cases but denies test creation and simulation", async () => {
      // Viewer reading tests is allowed
      const readRes = await request(app)
        .get(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${viewerTokenA}`);

      expect(readRes.status).toBe(200);

      // Viewer cannot create test cases (requires workflow:test or workflow:write)
      const createRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/tests`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          name: "Viewer Test",
          mode: "SIMULATION",
          assertionRules: [],
        });

      // Role permission check: VIEWER only has workflow:read
      expect(createRes.status).toBe(403);

      // Viewer cannot run simulation (requires workflow:simulate)
      const simRes = await request(app)
        .post(`/api/v1/workflows/${workflowA.id}/simulate`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          mode: "SIMULATION",
          inputData: {},
        });

      expect(simRes.status).toBe(403);
    });
  });
});
