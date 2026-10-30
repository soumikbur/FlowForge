import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { sampleOrderWorkflow } from "@flowforge/test-utils";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";

describe("End-to-End Workflow Execution & Human Approval Lifecycle", () => {
  const runner = new WorkflowExecutionRunner(apiStore);
  let sessionCookie: string;
  let workflowId: string;
  let executionId: string;
  let approvalId: string;

  it("sets up authenticated session", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `ops_${Date.now()}@flowforge.dev`,
        password: "Password123!",
        firstName: "Ops",
        lastName: "Manager",
        organizationName: "Global Logistics",
      });

    expect(res.status).toBe(201);
    sessionCookie = res.headers["set-cookie"][0];
  });

  it("creates workflow draft with conditional approval graph", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", sessionCookie)
      .send({
        name: "High Value Order Pipeline",
        description:
          "Auto-approves orders <= $10k, requires manager approval if > $10k",
      });

    expect(res.status).toBe(201);
    workflowId = res.body.data.id;

    // Update draft with full graph
    const updateRes = await request(app)
      .patch(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", sessionCookie)
      .send({
        nodes: sampleOrderWorkflow.nodes,
        edges: sampleOrderWorkflow.edges,
      });

    expect(updateRes.status).toBe(200);
  });

  it("validates and publishes immutable workflow version", async () => {
    const valRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/validate`)
      .set("Cookie", sessionCookie);

    expect(valRes.status).toBe(200);
    expect(valRes.body.data.isValid).toBe(true);

    const pubRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set("Cookie", sessionCookie);

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.data.version.versionNumber).toBe(1);
  });

  it("triggers execution for high value order ($15,000)", async () => {
    const trigRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/trigger`)
      .set("Cookie", sessionCookie)
      .send({
        payload: {
          orderId: "ORD-5544",
          orderValue: 15000,
          customer: "MegaCorp",
        },
      });

    expect(trigRes.status).toBe(202);
    executionId = trigRes.body.data.id;
    expect(trigRes.body.data.status).toBe("QUEUED");
  });

  it("worker processes execution and enters WAITING_APPROVAL state", async () => {
    const exec = await runner.processExecution(executionId);
    expect(exec.status).toBe("WAITING_APPROVAL");

    // Verify approval record was generated
    const pendingApproval = Array.from(apiStore.approvals.values()).find(
      (a) => a.executionId === executionId,
    );
    expect(pendingApproval).toBeDefined();
    expect(pendingApproval?.status).toBe("PENDING");
    approvalId = pendingApproval!.id;
  });

  it("approver signs decision and execution resumes to SUCCEEDED", async () => {
    const decideRes = await request(app)
      .post(`/api/v1/approvals/${approvalId}/decide`)
      .set("Cookie", sessionCookie)
      .send({
        decision: "APPROVE",
        comment: "Verified budget availability with finance department.",
      });

    expect(decideRes.status).toBe(200);
    expect(decideRes.body.data.approval.status).toBe("APPROVED");
    expect(decideRes.body.data.execution.status).toBe("QUEUED");

    // Resume execution with worker runner
    const finalExec = await runner.processExecution(executionId);
    expect(finalExec.status).toBe("SUCCEEDED");
    expect(finalExec.completedAt).toBeDefined();

    // Verify step timeline records
    const steps = Array.from(apiStore.steps.values()).filter(
      (s) => s.executionId === executionId,
    );
    expect(steps.length).toBeGreaterThanOrEqual(4);
  });
});
