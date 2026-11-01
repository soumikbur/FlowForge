import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import {
  WorkflowExecutionRunner,
  createDefaultRunner,
} from "../../apps/worker/src/runner.js";
import {
  WorkflowDefinition,
  WorkflowExecutionRecord,
  ExecutionStepRecord,
  ApprovalRecord,
} from "@flowforge/test-utils";

describe("Prompt 8: Human-in-the-Loop Approvals, Execution Controls, and Observability", () => {
  let orgIdA: string;
  let orgIdB: string;
  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let ownerTokenB: string;

  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;

  beforeEach(async () => {
    // Reset in-memory store
    apiStore.users.clear();
    apiStore.organizations.clear();
    apiStore.memberships.clear();
    apiStore.sessions.clear();
    apiStore.workflows.clear();
    apiStore.versions.clear();
    apiStore.executions.clear();
    apiStore.steps.clear();
    apiStore.approvals.clear();
    apiStore.delays.clear();
    apiStore.auditLogs = [];

    // Register Org A with Owner A
    const regResA = await request(app).post("/api/v1/auth/register").send({
      email: "owner.a@flowforge.dev",
      password: "Password123!",
      firstName: "Owner",
      lastName: "Alpha",
      organizationName: "Alpha Corp",
    });
    expect(regResA.status).toBe(201);
    ownerTokenA = regResA.body.data.token;
    ownerUserA = regResA.body.data.user;
    orgIdA = regResA.body.data.organization.id;

    // Register Org B with Owner B
    const regResB = await request(app).post("/api/v1/auth/register").send({
      email: "owner.b@flowforge.dev",
      password: "Password123!",
      firstName: "Owner",
      lastName: "Beta",
      organizationName: "Beta Corp",
    });
    expect(regResB.status).toBe(201);
    ownerTokenB = regResB.body.data.token;
    orgIdB = regResB.body.data.organization.id;

    // Direct User & Membership Setup for Admin in Org A
    const adminUserId = `usr_admin_${Date.now()}`;
    adminUserA = {
      id: adminUserId,
      email: "admin.a@flowforge.dev",
      passwordHash: "dummyhash",
      firstName: "Admin",
      lastName: "Alpha",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.users.set(adminUserId, adminUserA);

    const adminMemId = `mem_admin_${Date.now()}`;
    apiStore.memberships.set(adminMemId, {
      id: adminMemId,
      organizationId: orgIdA,
      userId: adminUserId,
      role: "ADMIN",
    });

    const adminSessId = `sess_admin_${Date.now()}`;
    adminTokenA = `token_admin_${Date.now()}`;
    apiStore.sessions.set(adminSessId, {
      id: adminSessId,
      token: adminTokenA,
      userId: adminUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    // Direct User & Membership Setup for Member in Org A
    const memberUserId = `usr_member_${Date.now()}`;
    memberUserA = {
      id: memberUserId,
      email: "member.a@flowforge.dev",
      passwordHash: "dummyhash",
      firstName: "Member",
      lastName: "Alpha",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.users.set(memberUserId, memberUserA);

    const memberMemId = `mem_member_${Date.now()}`;
    apiStore.memberships.set(memberMemId, {
      id: memberMemId,
      organizationId: orgIdA,
      userId: memberUserId,
      role: "MEMBER",
    });

    const memberSessId = `sess_member_${Date.now()}`;
    memberTokenA = `token_member_${Date.now()}`;
    apiStore.sessions.set(memberSessId, {
      id: memberSessId,
      token: memberTokenA,
      userId: memberUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });
  });

  describe("1. Durable Approval Lifecycle & State Suspension", () => {
    it("halts workflow execution at APPROVAL node and persists ApprovalRecord", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "n_trig",
            type: "TRIGGER",
            name: "Manual Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "n_appr",
            type: "APPROVAL",
            name: "Procurement Approval",
            config: {
              title: "Procurement Over $50k",
              description: "Sign-off required by department manager",
              requiredRole: "ADMIN",
              timeoutSeconds: 3600,
              timeoutPolicy: "REJECT",
              allowSelfApproval: false,
            },
          },
          {
            id: "n_end",
            type: "END",
            name: "Finish",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "n_trig", target: "n_appr" },
          { id: "e2", source: "n_appr", target: "n_end" },
        ],
      };

      const wfId = `wf_${Date.now()}`;
      const vId = `v_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgIdA,
        name: "Procurement Flow",
        status: "ACTIVE",
        draftDefinition: definition,
        publishedVersionId: vId,
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(vId, {
        id: vId,
        workflowId: wfId,
        versionNumber: 1,
        definition,
        publishedAt: new Date(),
        publishedById: adminUserA.id,
      });

      const execId = `exec_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: wfId,
        workflowVersionId: vId,
        triggerType: "MANUAL",
        triggerPayload: { amount: 75000 },
        status: "QUEUED",
        contextData: { amount: 75000 },
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Run until suspension
      const executed = await runner.processExecution(execId);
      expect(executed.status).toBe("WAITING_APPROVAL");

      // Verify approval record was created in store
      const approval = Array.from(apiStore.approvals.values()).find(
        (a) => a.executionId === execId,
      );
      expect(approval).toBeDefined();
      expect(approval?.title).toBe("Procurement Over $50k");
      expect(approval?.requiredRole).toBe("ADMIN");
      expect(approval?.status).toBe("PENDING");
      expect(approval?.timeoutPolicy).toBe("REJECT");
      expect(approval?.expiresAt).toBeDefined();

      // Verify step was set to WAITING
      const step = apiStore.steps.get(approval!.stepId);
      expect(step).toBeDefined();
      expect(step?.status).toBe("WAITING");
      expect(step?.nodeType).toBe("APPROVAL");
    });

    it("resumes workflow execution on APPROVE decision to SUCCEEDED state", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "n_trig",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "n_appr",
            type: "APPROVAL",
            name: "Manager Approval",
            config: {
              title: "Expense Approval",
              requiredRole: "ADMIN",
            },
          },
          {
            id: "n_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "n_trig", target: "n_appr" },
          { id: "e2", source: "n_appr", target: "n_end" },
        ],
      };

      const wfId = `wf_${Date.now()}`;
      const vId = `v_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgIdA,
        name: "Expense Flow",
        status: "ACTIVE",
        draftDefinition: definition,
        publishedVersionId: vId,
        createdById: memberUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(vId, {
        id: vId,
        workflowId: wfId,
        versionNumber: 1,
        definition,
        publishedAt: new Date(),
      });

      const execId = `exec_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: wfId,
        workflowVersionId: vId,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await runner.processExecution(execId);

      const approval = Array.from(apiStore.approvals.values()).find(
        (a) => a.executionId === execId,
      );
      expect(approval).toBeDefined();

      // Submit approve decision via API
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approval!.id}/decide`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "APPROVE",
          comment: "Approved within budget limits.",
        });

      expect(decideRes.status).toBe(200);
      expect(decideRes.body.success).toBe(true);
      expect(decideRes.body.data.approval.status).toBe("APPROVED");
      expect(decideRes.body.data.approval.decisionComment).toBe(
        "Approved within budget limits.",
      );
      expect(decideRes.body.data.execution.status).toBe("QUEUED");

      // Worker runner picks up QUEUED execution and runs to completion
      const finalExec = await runner.processExecution(execId);
      expect(finalExec.status).toBe("SUCCEEDED");
      expect(finalExec.completedAt).toBeDefined();

      // Verify audit log recorded
      const audit = apiStore.auditLogs.find(
        (log) => log.action === "approval.decided",
      );
      expect(audit).toBeDefined();
      expect(audit?.metadata?.decision).toBe("APPROVE");
    });

    it("terminates execution in FAILED state on REJECT decision", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "n_trig",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "n_appr",
            type: "APPROVAL",
            name: "Security Review",
            config: {
              title: "Security Review",
              requiredRole: "ADMIN",
            },
          },
          {
            id: "n_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "n_trig", target: "n_appr" },
          { id: "e2", source: "n_appr", target: "n_end" },
        ],
      };

      const wfId = `wf_${Date.now()}`;
      const vId = `v_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgIdA,
        name: "Security Flow",
        status: "ACTIVE",
        draftDefinition: definition,
        publishedVersionId: vId,
        createdById: memberUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(vId, {
        id: vId,
        workflowId: wfId,
        versionNumber: 1,
        definition,
        publishedAt: new Date(),
      });

      const execId = `exec_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: wfId,
        workflowVersionId: vId,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await runner.processExecution(execId);

      const approval = Array.from(apiStore.approvals.values()).find(
        (a) => a.executionId === execId,
      );
      expect(approval).toBeDefined();

      // Submit reject decision via API
      const rejectRes = await request(app)
        .post(`/api/v1/approvals/${approval!.id}/decide`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "REJECT",
          comment: "Failed risk review.",
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.approval.status).toBe("REJECTED");
      expect(rejectRes.body.data.execution.status).toBe("FAILED");
      expect(rejectRes.body.data.execution.errorDetails.message).toBe(
        "Failed risk review.",
      );

      const step = apiStore.steps.get(approval!.stepId);
      expect(step?.status).toBe("FAILED");
    });
  });

  describe("2. Self-Approval Prevention, RBAC & Assignee Controls", () => {
    it("forbids workflow creator from self-approving when allowSelfApproval is false", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "n_trig",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "n_appr",
            type: "APPROVAL",
            name: "Admin Review",
            config: {
              title: "Admin Review",
              requiredRole: "ADMIN",
              allowSelfApproval: false,
            },
          },
          {
            id: "n_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "n_trig", target: "n_appr" },
          { id: "e2", source: "n_appr", target: "n_end" },
        ],
      };

      const wfId = `wf_${Date.now()}`;
      const vId = `v_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgIdA,
        name: "Self-Approval Test Flow",
        status: "ACTIVE",
        draftDefinition: definition,
        publishedVersionId: vId,
        createdById: adminUserA.id, // Admin created this workflow!
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(vId, {
        id: vId,
        workflowId: wfId,
        versionNumber: 1,
        definition,
        publishedAt: new Date(),
      });

      const execId = `exec_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: wfId,
        workflowVersionId: vId,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await runner.processExecution(execId);

      const approval = Array.from(apiStore.approvals.values()).find(
        (a) => a.executionId === execId,
      );
      expect(approval).toBeDefined();

      // Admin tries to self-approve own workflow
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approval!.id}/decide`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "APPROVE",
          comment: "I approve my own work.",
        });

      expect(decideRes.status).toBe(403);
      expect(decideRes.body.error.code).toBe("SELF_APPROVAL_FORBIDDEN");

      // But Owner can approve (administrative policy override)
      const ownerRes = await request(app)
        .post(`/api/v1/approvals/${approval!.id}/decide`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          decision: "APPROVE",
          comment: "Owner override approval.",
        });

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data.approval.status).toBe("APPROVED");
    });

    it("enforces role requirements (MEMBER cannot decide ADMIN approval)", async () => {
      const approvalId = `appr_${Date.now()}`;
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: `exec_${Date.now()}`,
        stepId: `step_${Date.now()}`,
        title: "Executive Approval",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(),
      });

      // Member attempts to decide
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          decision: "APPROVE",
        });

      expect(decideRes.status).toBe(403);
      expect(decideRes.body.error.code).toBe("FORBIDDEN"); // Member lacks approval:decide permission
    });

    it("enforces specific assigned user restrictions", async () => {
      const execId = `exec_${Date.now()}`;
      const wfId = `wf_${Date.now()}`;
      const vId = `v_${Date.now()}`;

      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgIdA,
        name: "Assignee Flow",
        status: "ACTIVE",
        draftDefinition: { nodes: [], edges: [] },
        publishedVersionId: vId,
        createdById: "some_other_user",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(vId, {
        id: vId,
        workflowId: wfId,
        versionNumber: 1,
        definition: { nodes: [], edges: [] },
        publishedAt: new Date(),
      });
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: wfId,
        workflowVersionId: vId,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "WAITING_APPROVAL",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const approvalId = `appr_assigned_${Date.now()}`;
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: execId,
        stepId: `step_${Date.now()}`,
        title: "Exclusive Approval",
        requiredRole: "ADMIN",
        assignedUserId: adminUserA.id, // Explicitly assigned to adminUserA
        status: "PENDING",
        createdAt: new Date(),
      });

      // Admin can decide
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "APPROVE",
          comment: "Assigned approver verified.",
        });

      expect(decideRes.status).toBe(200);
      expect(decideRes.body.data.approval.status).toBe("APPROVED");
    });
  });

  describe("3. Concurrency Protection & Approval Reassignment", () => {
    it("returns 409 Conflict when submitting decision on already-decided approval", async () => {
      const execId = `exec_${Date.now()}`;
      const approvalId = `appr_conflict_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "WAITING_APPROVAL",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: execId,
        stepId: `step_${Date.now()}`,
        title: "Concurrent Decision Guard",
        requiredRole: "ADMIN",
        status: "APPROVED", // Already approved!
        decidedById: adminUserA.id,
        decidedAt: new Date(),
        createdAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          decision: "REJECT",
          comment: "Late conflicting decision attempt",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_DECIDED");
    });

    it("reassigns approval to another user or role and emits audit log", async () => {
      const approvalId = `appr_reassign_${Date.now()}`;
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: `exec_${Date.now()}`,
        stepId: `step_${Date.now()}`,
        title: "Reassignable Approval",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(),
      });

      const reassignRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/reassign`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          assignedUserId: memberUserA.id,
          requiredRole: "MEMBER",
          reason: "Delegated to analyst",
        });

      expect(reassignRes.status).toBe(200);
      expect(reassignRes.body.data.assignedUserId).toBe(memberUserA.id);
      expect(reassignRes.body.data.requiredRole).toBe("MEMBER");

      const audit = apiStore.auditLogs.find(
        (log) => log.action === "approval.reassigned",
      );
      expect(audit).toBeDefined();
      expect(audit?.metadata?.reason).toBe("Delegated to analyst");
    });

    it("rejects reassignment targeting a user not in the organization", async () => {
      const approvalId = `appr_invalid_target_${Date.now()}`;
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: `exec_${Date.now()}`,
        stepId: `step_${Date.now()}`,
        title: "Reassign Target Test",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/approvals/${approvalId}/reassign`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          assignedUserId: "usr_non_existent",
          reason: "Unknown target",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ASSIGNEE");
    });
  });

  describe("4. Approval Timeout & Overdue Recovery", () => {
    it("recovers overdue approvals and transitions execution to FAILED", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const execId = `exec_timeout_${Date.now()}`;
      const stepId = `step_timeout_${Date.now()}`;
      const approvalId = `appr_timeout_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "WAITING_APPROVAL",
        currentNodeId: "node_approval",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(Date.now() - 7200000),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "node_approval",
        nodeType: "APPROVAL",
        nodeName: "Expiring Approval",
        status: "WAITING",
        attempt: 1,
      });

      // Expired 1 hour ago
      const expiredDate = new Date(Date.now() - 3600000);
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: execId,
        stepId: stepId,
        title: "Expiring Approval",
        requiredRole: "ADMIN",
        status: "PENDING",
        expiresAt: expiredDate,
        timeoutPolicy: "REJECT",
        createdAt: new Date(Date.now() - 7200000),
      });

      const recovered = await runner.recoverOverdueApprovals();
      expect(recovered).toBe(1);

      const approval = apiStore.approvals.get(approvalId);
      expect(approval?.status).toBe("TIMEOUT");
      expect(approval?.decisionComment).toBe("Approval timed out");

      const execution = apiStore.executions.get(execId);
      expect(execution?.status).toBe("FAILED");
      expect(execution?.errorDetails?.message).toBe("Approval timed out");

      const step = apiStore.steps.get(stepId);
      expect(step?.status).toBe("FAILED");
      expect(step?.errorMessage).toBe("Approval timed out");
    });
  });

  describe("5. Execution Cancellation & Pending Approval Invalidation", () => {
    it("cancels execution and invalidates pending approvals", async () => {
      const execId = `exec_cancel_${Date.now()}`;
      const stepId = `step_cancel_${Date.now()}`;
      const approvalId = `appr_cancel_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "WAITING_APPROVAL",
        currentNodeId: "n_appr",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "n_appr",
        nodeType: "APPROVAL",
        nodeName: "Approval Waiting",
        status: "WAITING",
        attempt: 1,
      });

      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: execId,
        stepId: stepId,
        title: "Approval on Soon-to-be-Cancelled Workflow",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(),
      });

      // Cancel execution via API
      const cancelRes = await request(app)
        .post(`/api/v1/executions/${execId}/cancel`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ reason: "Emergency operational stop" });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe("CANCELLED");

      // Verify approval was invalidated
      const approval = apiStore.approvals.get(approvalId);
      expect(approval?.status).toBe("REJECTED");
      expect(approval?.decisionComment).toBe("Execution was cancelled");

      // Verify late attempt to decide does not resume execution
      const lateDecideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ decision: "APPROVE" });

      expect(lateDecideRes.status).toBe(409); // Already rejected due to cancellation
      const freshExec = apiStore.executions.get(execId);
      expect(freshExec?.status).toBe("CANCELLED");
    });

    it("rejects cancellation of already-terminal executions", async () => {
      const execId = `exec_term_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "SUCCEEDED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/executions/${execId}/cancel`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ reason: "Stop finished job" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TRANSITION");
    });
  });

  describe("6. Safe Step Retry & Execution Resumption", () => {
    it("retries failed execution and resets failed step", async () => {
      const execId = `exec_retry_${Date.now()}`;
      const stepId = `step_retry_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "FAILED",
        currentNodeId: "n_http",
        errorDetails: {
          message: "504 Gateway Timeout",
          failedNodeId: "n_http",
        },
        retryCount: 1,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "n_http",
        nodeType: "HTTP_REQUEST",
        nodeName: "External Webhook Sync",
        status: "FAILED",
        errorMessage: "504 Gateway Timeout",
        attempt: 1,
      });

      const retryRes = await request(app)
        .post(`/api/v1/executions/${execId}/retry`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          stepId,
          reason: "Remote service recovered",
        });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.status).toBe("QUEUED");
      expect(retryRes.body.data.retryCount).toBe(2);
      expect(retryRes.body.data.completedAt).toBeUndefined();

      const step = apiStore.steps.get(stepId);
      expect(step?.status).toBe("PENDING");
      expect(step?.attempt).toBe(2);
      expect(step?.errorMessage).toBeUndefined();

      const audit = apiStore.auditLogs.find(
        (log) => log.action === "execution.retried",
      );
      expect(audit).toBeDefined();
      expect(audit?.metadata?.reason).toBe("Remote service recovered");
    });

    it("rejects retry of non-failed execution", async () => {
      const execId = `exec_running_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "RUNNING",
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/executions/${execId}/retry`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATE");
    });
  });

  describe("7. Multi-Tenant Isolation", () => {
    it("guarantees Org B cannot view or decide Org A approvals", async () => {
      const approvalId = `appr_iso_${Date.now()}`;
      apiStore.approvals.set(approvalId, {
        id: approvalId,
        organizationId: orgIdA,
        executionId: `exec_${Date.now()}`,
        stepId: `step_${Date.now()}`,
        title: "Confidential Alpha Approval",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(),
      });

      // Org B user attempts to fetch
      const getRes = await request(app)
        .get(`/api/v1/approvals/${approvalId}`)
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(getRes.status).toBe(404);

      // Org B user attempts to decide
      const decideRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/decide`)
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({ decision: "APPROVE" });

      expect(decideRes.status).toBe(404);
    });

    it("guarantees Org B cannot cancel or retry Org A executions", async () => {
      const execId = `exec_iso_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgIdA,
        workflowId: `wf_${Date.now()}`,
        workflowVersionId: `v_${Date.now()}`,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "FAILED",
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const cancelRes = await request(app)
        .post(`/api/v1/executions/${execId}/cancel`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(cancelRes.status).toBe(404);

      const retryRes = await request(app)
        .post(`/api/v1/executions/${execId}/retry`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(retryRes.status).toBe(404);
    });
  });
});
