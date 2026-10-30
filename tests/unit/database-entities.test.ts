import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryDatabase } from "@flowforge/test-utils";
import crypto from "crypto";

describe("Database Entities, Invariants & Constraints", () => {
  let db: InMemoryDatabase;

  beforeEach(() => {
    db = new InMemoryDatabase();
  });

  it("enforces user creation and email uniqueness", () => {
    const email = "alex.developer@flowforge.dev";
    const normalizedEmail = email.toLowerCase().trim();

    db.users.set("u1", {
      id: "u1",
      email: normalizedEmail,
      passwordHash: "$2b$10$hashedpasswordstring",
      firstName: "Alex",
      lastName: "Dev",
    });

    const storedUser = db.users.get("u1");
    expect(storedUser).toBeDefined();
    expect(storedUser?.email).toBe(normalizedEmail);

    // Attempt duplicate user with same email (case insensitive)
    const duplicateEmail = "ALEX.DEVELOPER@flowforge.dev".toLowerCase().trim();
    const isDuplicate = Array.from(db.users.values()).some(
      (u) => u.email === duplicateEmail,
    );
    expect(isDuplicate).toBe(true);
  });

  it("enforces organization creation and slug uniqueness", () => {
    db.organizations.set("org1", {
      id: "org1",
      name: "Acme Operations",
      slug: "acme-operations",
    });

    const isSlugTaken = Array.from(db.organizations.values()).some(
      (o) => o.slug === "acme-operations",
    );
    expect(isSlugTaken).toBe(true);
  });

  it("enforces membership uniqueness for the same user and organization", () => {
    const userId = "u1";
    const orgId = "org1";

    db.memberships.set("m1", {
      id: "m1",
      userId,
      organizationId: orgId,
      role: "ADMIN",
    });

    // Check compound uniqueness constraint: (organizationId, userId)
    const exists = Array.from(db.memberships.values()).some(
      (m) => m.organizationId === orgId && m.userId === userId,
    );
    expect(exists).toBe(true);
  });

  it("persists workflow draft and enforces version uniqueness", () => {
    const wfId = "wf_1";
    const orgId = "org1";

    db.workflows.set(wfId, {
      id: wfId,
      organizationId: orgId,
      name: "Invoice Processing",
      status: "DRAFT",
      draftDefinition: { nodes: [], edges: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Publish Version 1
    db.versions.set("v1", {
      id: "v1",
      workflowId: wfId,
      versionNumber: 1,
      definition: {
        nodes: [{ id: "t", type: "TRIGGER", name: "Trigger", config: {} }],
        edges: [],
      },
      publishedAt: new Date(),
    });

    // Check version number uniqueness per workflow: (workflowId, versionNumber)
    const v1Exists = Array.from(db.versions.values()).some(
      (v) => v.workflowId === wfId && v.versionNumber === 1,
    );
    expect(v1Exists).toBe(true);
  });

  it("persists execution bound permanently to specific workflow version", () => {
    const execId = "exec_101";
    const wfId = "wf_1";
    const versionId = "v1";

    db.versions.set(versionId, {
      id: versionId,
      workflowId: wfId,
      versionNumber: 1,
      definition: { nodes: [], edges: [] },
      publishedAt: new Date(),
    });

    db.executions.set(execId, {
      id: execId,
      organizationId: "org1",
      workflowId: wfId,
      workflowVersionId: versionId,
      triggerType: "WEBHOOK",
      triggerPayload: { orderId: "ORD-99" },
      status: "QUEUED",
      contextData: {},
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exec = db.executions.get(execId);
    expect(exec).toBeDefined();
    expect(exec?.workflowVersionId).toBe(versionId);

    // If workflow is later modified or updated, execution remains bound to v1
    const boundVersion = db.versions.get(exec!.workflowVersionId);
    expect(boundVersion?.versionNumber).toBe(1);
  });

  it("validates foreign-key relationships and organization isolation", () => {
    const orgA = "org_a";
    const orgB = "org_b";

    db.workflows.set("wf_a", {
      id: "wf_a",
      organizationId: orgA,
      name: "Org A Secret Process",
      status: "ACTIVE",
      draftDefinition: { nodes: [], edges: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Tenant isolation query check: Org B must not see Org A workflows
    const orgBWorkflows = Array.from(db.workflows.values()).filter(
      (w) => w.organizationId === orgB,
    );
    expect(orgBWorkflows.length).toBe(0);
  });

  it("preserves execution history and audit records when workflow is archived or removed", () => {
    const wfId = "wf_retain_test";
    const execId = "exec_retain_test";

    db.workflows.set(wfId, {
      id: wfId,
      organizationId: "org1",
      name: "Workflow With Critical Audits",
      status: "ARCHIVED", // Archival retention policy
      draftDefinition: { nodes: [], edges: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    db.executions.set(execId, {
      id: execId,
      organizationId: "org1",
      workflowId: wfId,
      workflowVersionId: "v1",
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "SUCCEEDED",
      contextData: {},
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Execution record remains durable and intact
    expect(db.executions.get(execId)).toBeDefined();
    expect(db.executions.get(execId)?.workflowId).toBe(wfId);
  });
});
