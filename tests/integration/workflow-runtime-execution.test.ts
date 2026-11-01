import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { NodeHandlerRegistry } from "@flowforge/workflow-engine";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Phase 5: Workflow Execution Runtime, Scheduling, Retries, and Recovery", () => {
  let orgAAdminCookie: string;
  let orgBAdminCookie: string;
  let orgAId: string;
  let orgBId: string;
  let runner: WorkflowExecutionRunner;

  beforeEach(async () => {
    runner = new WorkflowExecutionRunner(apiStore);
  });

  it("sets up two distinct tenant organizations with admin credentials", async () => {
    // Org A
    const resA = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `alice_${Date.now()}@tenant-a.com`,
        password: "Password123!",
        firstName: "Alice",
        lastName: "Admin",
        organizationName: "Tenant Alpha Corp",
      });
    expect(resA.status).toBe(201);
    orgAAdminCookie = resA.headers["set-cookie"][0];
    orgAId = resA.body.data.organization.id;

    // Org B
    const resB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `bob_${Date.now()}@tenant-b.com`,
        password: "Password123!",
        firstName: "Bob",
        lastName: "Admin",
        organizationName: "Tenant Beta Ltd",
      });
    expect(resB.status).toBe(201);
    orgBAdminCookie = resB.headers["set-cookie"][0];
    orgBId = resB.body.data.organization.id;

    expect(orgAId).not.toBe(orgBId);
  });

  describe("Linear Workflow Execution & Persistence", () => {
    let workflowId: string;
    let executionId: string;

    it("creates, validates, and publishes a linear 3-node workflow", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({
          name: "Linear Order Confirmation",
          description: "Trigger -> Email -> End",
        });
      expect(createRes.status).toBe(201);
      workflowId = createRes.body.data.id;

      const linearDefinition: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trig",
            type: "TRIGGER",
            name: "Order Event",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_mail",
            type: "EMAIL",
            name: "Send Confirmation",
            config: {
              to: "customer@example.com",
              subject: "Order Received",
              template: "Thank you for your order!",
            },
            position: { x: 100, y: 100 },
          },
          {
            id: "node_finish",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 200, y: 200 },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "node_trig",
            target: "node_mail",
          },
          {
            id: "e2",
            source: "node_mail",
            target: "node_finish",
          },
        ],
      };

      const patchRes = await request(app)
        .patch(`/api/v1/workflows/${workflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({
          nodes: linearDefinition.nodes,
          edges: linearDefinition.edges,
        });
      expect(patchRes.status).toBe(200);

      const pubRes = await request(app)
        .post(`/api/v1/workflows/${workflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
      expect(pubRes.status).toBe(201);
    });

    it("dispatches execution via POST /execute and processes to SUCCEEDED", async () => {
      const execRes = await request(app)
        .post(`/api/v1/workflows/${workflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({
          payload: { orderNumber: "ORD-9901", total: 49.99 },
        });
      expect(execRes.status).toBe(202);
      expect(execRes.body.data.status).toBe("QUEUED");
      executionId = execRes.body.data.id;

      // Worker executes
      const executed = await runner.processExecution(executionId);
      expect(executed.status).toBe("SUCCEEDED");
      expect(executed.completedAt).toBeDefined();
      expect(executed.currentNodeId).toBe("node_finish");
    });

    it("verifies step persistence and retrieves steps via GET /executions/:id/steps", async () => {
      const stepsRes = await request(app)
        .get(`/api/v1/executions/${executionId}/steps`)
        .set("Cookie", orgAAdminCookie);

      expect(stepsRes.status).toBe(200);
      expect(stepsRes.body.data).toHaveLength(3);

      const [step1, step2, step3] = stepsRes.body.data;
      expect(step1.nodeId).toBe("node_trig");
      expect(step1.status).toBe("COMPLETED");
      expect(step1.attempt).toBe(1);

      expect(step2.nodeId).toBe("node_mail");
      expect(step2.status).toBe("COMPLETED");
      expect(step2.outputPayload?.delivered).toBe(true);

      expect(step3.nodeId).toBe("node_finish");
      expect(step3.status).toBe("COMPLETED");
    });
  });

  describe("Conditional Branching & Mutual Exclusion", () => {
    let branchingWorkflowId: string;

    const branchingDefinition: WorkflowDefinition = {
      nodes: [
        {
          id: "branch_trig",
          type: "TRIGGER",
          name: "Score Input",
          config: { triggerType: "MANUAL" },
          position: { x: 0, y: 0 },
        },
        {
          id: "branch_cond",
          type: "CONDITION",
          name: "Check Score >= 80",
          config: { expression: "trigger.payload.score >= 80" },
          position: { x: 100, y: 100 },
        },
        {
          id: "branch_honor_mail",
          type: "EMAIL",
          name: "Send Honor Roll Mail",
          config: {
            to: "student@school.edu",
            subject: "Congratulations!",
            template: "You passed with honors!",
          },
          position: { x: 200, y: 0 },
        },
        {
          id: "branch_standard_mail",
          type: "EMAIL",
          name: "Send Standard Notice",
          config: {
            to: "student@school.edu",
            subject: "Exam Result",
            template: "Keep studying!",
          },
          position: { x: 200, y: 200 },
        },
        {
          id: "branch_end_pass",
          type: "END",
          name: "End Honors",
          config: {},
          position: { x: 300, y: 0 },
        },
        {
          id: "branch_end_standard",
          type: "END",
          name: "End Standard",
          config: {},
          position: { x: 300, y: 200 },
        },
      ],
      edges: [
        {
          id: "eb1",
          source: "branch_trig",
          target: "branch_cond",
        },
        {
          id: "eb2",
          source: "branch_cond",
          target: "branch_honor_mail",
          sourceHandle: "true",
        },
        {
          id: "eb3",
          source: "branch_cond",
          target: "branch_standard_mail",
          sourceHandle: "false",
        },
        {
          id: "eb4",
          source: "branch_honor_mail",
          target: "branch_end_pass",
        },
        {
          id: "eb5",
          source: "branch_standard_mail",
          target: "branch_end_standard",
        },
      ],
    };

    it("publishes conditional branching workflow", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({
          name: "Exam Routing Workflow",
          description: "Branches depending on student score",
        });
      branchingWorkflowId = createRes.body.data.id;

      await request(app)
        .patch(`/api/v1/workflows/${branchingWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({
          nodes: branchingDefinition.nodes,
          edges: branchingDefinition.edges,
        });

      await request(app)
        .post(`/api/v1/workflows/${branchingWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
    });

    it("executes TRUE branch for score >= 80, omitting FALSE branch entirely", async () => {
      const trigRes = await request(app)
        .post(`/api/v1/workflows/${branchingWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({
          payload: { score: 92 },
        });
      const execId = trigRes.body.data.id;

      const result = await runner.processExecution(execId);
      expect(result.status).toBe("SUCCEEDED");

      const stepsRes = await request(app)
        .get(`/api/v1/executions/${execId}/steps`)
        .set("Cookie", orgAAdminCookie);

      const executedNodeIds = stepsRes.body.data.map((s: any) => s.nodeId);
      expect(executedNodeIds).toContain("branch_trig");
      expect(executedNodeIds).toContain("branch_cond");
      expect(executedNodeIds).toContain("branch_honor_mail");
      expect(executedNodeIds).toContain("branch_end_pass");

      // False branch nodes must NOT be present
      expect(executedNodeIds).not.toContain("branch_standard_mail");
      expect(executedNodeIds).not.toContain("branch_end_standard");
    });

    it("executes FALSE branch for score < 80, omitting TRUE branch entirely", async () => {
      const trigRes = await request(app)
        .post(`/api/v1/workflows/${branchingWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({
          payload: { score: 65 },
        });
      const execId = trigRes.body.data.id;

      const result = await runner.processExecution(execId);
      expect(result.status).toBe("SUCCEEDED");

      const stepsRes = await request(app)
        .get(`/api/v1/executions/${execId}/steps`)
        .set("Cookie", orgAAdminCookie);

      const executedNodeIds = stepsRes.body.data.map((s: any) => s.nodeId);
      expect(executedNodeIds).toContain("branch_trig");
      expect(executedNodeIds).toContain("branch_cond");
      expect(executedNodeIds).toContain("branch_standard_mail");
      expect(executedNodeIds).toContain("branch_end_standard");

      // True branch nodes must NOT be present
      expect(executedNodeIds).not.toContain("branch_honor_mail");
      expect(executedNodeIds).not.toContain("branch_end_pass");
    });
  });

  describe("Retries, Exponential Backoff, and Non-Retryable Failures", () => {
    let retryWorkflowId: string;

    const retryDefinition: WorkflowDefinition = {
      nodes: [
        {
          id: "r_trig",
          type: "TRIGGER",
          name: "Retry Trigger",
          config: { triggerType: "MANUAL" },
          position: { x: 0, y: 0 },
        },
        {
          id: "r_http",
          type: "HTTP_REQUEST",
          name: "Flaky Service Call",
          config: {
            url: "https://api.example.com/data",
            maxRetries: 3,
            retryBackoffMs: 20,
          },
          position: { x: 100, y: 100 },
        },
        {
          id: "r_end",
          type: "END",
          name: "End",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [
        { id: "re1", source: "r_trig", target: "r_http" },
        { id: "re2", source: "r_http", target: "r_end" },
      ],
    };

    it("publishes retry test workflow", async () => {
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Retry Spec Workflow" });
      retryWorkflowId = res.body.data.id;

      await request(app)
        .patch(`/api/v1/workflows/${retryWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({
          nodes: retryDefinition.nodes,
          edges: retryDefinition.edges,
        });

      await request(app)
        .post(`/api/v1/workflows/${retryWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
    });

    it("recovers and succeeds when transient error resolves within maxRetries", async () => {
      const customRegistry = new NodeHandlerRegistry();
      let callCount = 0;

      customRegistry.register("HTTP_REQUEST", async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error(`Transient gateway timeout (attempt ${callCount})`);
        }
        return {
          status: "COMPLETED",
          output: { success: true, callCount },
        };
      });

      const flakyRunner = new WorkflowExecutionRunner(apiStore, customRegistry);

      const execRes = await request(app)
        .post(`/api/v1/workflows/${retryWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      const execId = execRes.body.data.id;

      const finalExec = await flakyRunner.processExecution(execId);
      expect(finalExec.status).toBe("SUCCEEDED");
      expect(callCount).toBe(3);
      expect(finalExec.retryCount).toBe(2);

      const step = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execId && s.nodeId === "r_http",
      );
      expect(step?.attempt).toBe(3);
      expect(step?.status).toBe("COMPLETED");
    });

    it("fails when retries are exhausted", async () => {
      const customRegistry = new NodeHandlerRegistry();
      customRegistry.register("HTTP_REQUEST", async () => {
        throw new Error("Persistent 503 Service Unavailable");
      });

      const exhaustedRunner = new WorkflowExecutionRunner(
        apiStore,
        customRegistry,
      );

      const execRes = await request(app)
        .post(`/api/v1/workflows/${retryWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      const execId = execRes.body.data.id;

      const failedExec = await exhaustedRunner.processExecution(execId);
      expect(failedExec.status).toBe("FAILED");
      expect(failedExec.errorDetails).toBeDefined();

      const step = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execId && s.nodeId === "r_http",
      );
      expect(step?.status).toBe("FAILED");
      expect(step?.attempt).toBe(4); // Initial (1) + 3 retries = 4 attempts total
      expect(step?.errorMessage).toContain("Persistent 503");
    });

    it("terminates immediately without retrying on non-retryable error", async () => {
      const customRegistry = new NodeHandlerRegistry();
      let executionAttempts = 0;
      customRegistry.register("HTTP_REQUEST", async () => {
        executionAttempts++;
        const nonRetryableError = new Error("Invalid API key credentials");
        (nonRetryableError as any).isNonRetryable = true;
        throw nonRetryableError;
      });

      const nonRetryableRunner = new WorkflowExecutionRunner(
        apiStore,
        customRegistry,
      );

      const execRes = await request(app)
        .post(`/api/v1/workflows/${retryWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      const execId = execRes.body.data.id;

      const failedExec = await nonRetryableRunner.processExecution(execId);
      expect(failedExec.status).toBe("FAILED");
      expect(executionAttempts).toBe(1); // Never retried

      const step = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === execId && s.nodeId === "r_http",
      );
      expect(step?.attempt).toBe(1);
      expect(step?.status).toBe("FAILED");
    });
  });

  describe("Execution Cancellation", () => {
    let cancelWorkflowId: string;

    it("cancels an active execution and prevents subsequent steps from executing", async () => {
      // Create a workflow with a slow step
      const slowDefinition: WorkflowDefinition = {
        nodes: [
          {
            id: "slow_trig",
            type: "TRIGGER",
            name: "Trigger",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "slow_http",
            type: "HTTP_REQUEST",
            name: "Long Running Request",
            config: { url: "https://api.example.com/slow" },
            position: { x: 100, y: 100 },
          },
          {
            id: "slow_end",
            type: "END",
            name: "End",
            config: {},
            position: { x: 200, y: 200 },
          },
        ],
        edges: [
          { id: "se1", source: "slow_trig", target: "slow_http" },
          { id: "se2", source: "slow_http", target: "slow_end" },
        ],
      };

      const wfRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Cancellation Workflow" });
      cancelWorkflowId = wfRes.body.data.id;

      await request(app)
        .patch(`/api/v1/workflows/${cancelWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({
          nodes: slowDefinition.nodes,
          edges: slowDefinition.edges,
        });

      await request(app)
        .post(`/api/v1/workflows/${cancelWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);

      const execRes = await request(app)
        .post(`/api/v1/workflows/${cancelWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      const execId = execRes.body.data.id;

      // Cancel the execution via API
      const cancelRes = await request(app)
        .post(`/api/v1/executions/${execId}/cancel`)
        .set("Cookie", orgAAdminCookie)
        .send({ reason: "User cancelled during staging run" });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe("CANCELLED");
      expect(cancelRes.body.data.errorDetails.cancellationReason).toBe(
        "User cancelled during staging run",
      );

      // Now attempt to run with runner - must return CANCELLED immediately without running slow_http or slow_end
      const result = await runner.processExecution(execId);
      expect(result.status).toBe("CANCELLED");

      // Verify slow_end node was NEVER executed
      const steps = Array.from(apiStore.steps.values()).filter(
        (s) => s.executionId === execId,
      );
      const executedEnd = steps.find((s) => s.nodeId === "slow_end");
      expect(executedEnd).toBeUndefined();
    });

    it("rejects cancellation of an already completed execution", async () => {
      // Create simple completed execution
      const completedExecId = `exec_done_${Date.now()}`;
      apiStore.executions.set(completedExecId, {
        id: completedExecId,
        organizationId: orgAId,
        workflowId: cancelWorkflowId,
        workflowVersionId: "ver_test",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "SUCCEEDED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/executions/${completedExecId}/cancel`)
        .set("Cookie", orgAAdminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TRANSITION");
    });
  });

  describe("Worker Restart Recovery", () => {
    it("recovers orphaned RUNNING executions left behind by worker crash", async () => {
      // Create a workflow
      const simpleDef: WorkflowDefinition = {
        nodes: [
          {
            id: "rec_trig",
            type: "TRIGGER",
            name: "Trigger",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "rec_end",
            type: "END",
            name: "End",
            config: {},
            position: { x: 100, y: 100 },
          },
        ],
        edges: [{ id: "rece1", source: "rec_trig", target: "rec_end" }],
      };

      const wfRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Recovery Test Workflow" });
      const wfId = wfRes.body.data.id;

      await request(app)
        .patch(`/api/v1/workflows/${wfId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ nodes: simpleDef.nodes, edges: simpleDef.edges });

      const pubRes = await request(app)
        .post(`/api/v1/workflows/${wfId}/publish`)
        .set("Cookie", orgAAdminCookie);
      const verId = pubRes.body.data.version.id;

      // Simulate orphaned execution that was mid-flight when worker died
      const orphanedExecId = `exec_orphaned_${Date.now()}`;
      apiStore.executions.set(orphanedExecId, {
        id: orphanedExecId,
        organizationId: orgAId,
        workflowId: wfId,
        workflowVersionId: verId,
        triggerType: "MANUAL",
        triggerPayload: { test: true },
        status: "RUNNING",
        contextData: { trigger: { payload: { test: true }, type: "MANUAL" } },
        retryCount: 0,
        startedAt: new Date(Date.now() - 60000),
        createdAt: new Date(Date.now() - 60000),
        updatedAt: new Date(Date.now() - 60000),
      });

      // Simulate orphaned running step
      const orphanedStepId = `step_orphaned_${Date.now()}`;
      apiStore.steps.set(orphanedStepId, {
        id: orphanedStepId,
        executionId: orphanedExecId,
        nodeId: "rec_trig",
        nodeType: "TRIGGER",
        nodeName: "Trigger",
        status: "RUNNING",
        attempt: 1,
        startedAt: new Date(Date.now() - 60000),
      });

      // Recover
      const stats = await runner.recoverInterruptedExecutions({
        autoResume: true,
      });
      expect(stats.recoveredCount).toBeGreaterThanOrEqual(1);
      expect(stats.resumedCount).toBeGreaterThanOrEqual(1);

      // Verify the orphaned step was marked FAILED due to interruption
      const step = apiStore.steps.get(orphanedStepId);
      expect(step?.status).toBe("FAILED");
      expect(step?.errorMessage).toContain("interrupted");

      // Verify execution resumed to SUCCEEDED
      const execution = apiStore.executions.get(orphanedExecId);
      expect(execution?.status).toBe("SUCCEEDED");
      expect(execution?.completedAt).toBeDefined();
    });

    it("cleanly marks orphaned executions FAILED when autoResume is false", async () => {
      const failExecId = `exec_fail_orphaned_${Date.now()}`;
      apiStore.executions.set(failExecId, {
        id: failExecId,
        organizationId: orgAId,
        workflowId: "wf_dummy",
        workflowVersionId: "ver_dummy",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "RUNNING",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = await runner.recoverInterruptedExecutions({
        autoResume: false,
      });
      expect(stats.recoveredCount).toBeGreaterThanOrEqual(1);
      expect(stats.failedCount).toBeGreaterThanOrEqual(1);

      const exec = apiStore.executions.get(failExecId);
      expect(exec?.status).toBe("FAILED");
      expect(exec?.completedAt).toBeDefined();
    });
  });

  describe("Idempotent Execution Dispatch", () => {
    let testWorkflowId: string;

    it("returns existing execution without duplication when idempotency key is supplied", async () => {
      const simpleDef: WorkflowDefinition = {
        nodes: [
          {
            id: "idemp_trig",
            type: "TRIGGER",
            name: "Trigger",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "idemp_end",
            type: "END",
            name: "End",
            config: {},
            position: { x: 100, y: 100 },
          },
        ],
        edges: [{ id: "ie1", source: "idemp_trig", target: "idemp_end" }],
      };

      const wfRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Idempotency Workflow" });
      testWorkflowId = wfRes.body.data.id;

      await request(app)
        .patch(`/api/v1/workflows/${testWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ nodes: simpleDef.nodes, edges: simpleDef.edges });

      await request(app)
        .post(`/api/v1/workflows/${testWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);

      const idempotencyKey = `order_checkout_${Date.now()}`;

      // Call 1
      const res1 = await request(app)
        .post(`/api/v1/workflows/${testWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { amount: 150 } });

      expect(res1.status).toBe(202);
      const executionId = res1.body.data.id;

      // Call 2 with identical key
      const res2 = await request(app)
        .post(`/api/v1/workflows/${testWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .set("Idempotency-Key", idempotencyKey)
        .send({ payload: { amount: 150 } });

      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(executionId);
      expect(res2.body.meta?.idempotent).toBe(true);

      // Verify in store that only 1 execution was recorded
      const matchingExecutions = Array.from(
        apiStore.executions.values(),
      ).filter((e) => e.idempotencyKey === idempotencyKey);
      expect(matchingExecutions).toHaveLength(1);
    });
  });

  describe("Multi-Tenant Data Isolation & Security Boundaries", () => {
    let orgAExecutionId: string;

    it("creates an execution belonging strictly to Org A", async () => {
      // Use existing execution or trigger one
      const exec = Array.from(apiStore.executions.values()).find(
        (e) => e.organizationId === orgAId,
      );
      expect(exec).toBeDefined();
      orgAExecutionId = exec!.id;
    });

    it("forbids Org B from reading Org A execution details", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${orgAExecutionId}`)
        .set("Cookie", orgBAdminCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("forbids Org B from inspecting Org A execution step history", async () => {
      const res = await request(app)
        .get(`/api/v1/executions/${orgAExecutionId}/steps`)
        .set("Cookie", orgBAdminCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("forbids Org B from cancelling Org A execution", async () => {
      const res = await request(app)
        .post(`/api/v1/executions/${orgAExecutionId}/cancel`)
        .set("Cookie", orgBAdminCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });
});
