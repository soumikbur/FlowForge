import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { computeWorkflowContentHash } from "@flowforge/workflow-engine";

describe("Prompt 9: Workflow Versioning, Publishing, Environment Promotion & Rollback", () => {
  // Tenant A: Workflow Systems Ltd
  const ownerEmailA = `org_a_owner_${Date.now()}@flowforge.dev`;
  const memberEmailA = `org_a_member_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let memberTokenA: string;
  let orgIdA: string;
  let workflowIdA: string;

  // Tenant B: Isolated Corp
  const ownerEmailB = `org_b_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;

  let version1Id: string;
  let version1Hash: string;
  let version2Id: string;
  let version2Hash: string;

  // Helper definition 1 (Valid with TRIGGER -> EMAIL -> END)
  const validDefinitionV1 = {
    nodes: [
      {
        id: "node_trigger",
        name: "Webhook Trigger",
        type: "TRIGGER" as const,
        config: { triggerType: "WEBHOOK" },
        position: { x: 100, y: 100 },
      },
      {
        id: "node_notify",
        name: "Email Notification",
        type: "EMAIL" as const,
        config: {
          to: "team@company.com",
          subject: "Order Alert",
          template: "Order received",
        },
        position: { x: 300, y: 100 },
      },
      {
        id: "node_end",
        name: "End Process",
        type: "END" as const,
        config: {},
        position: { x: 500, y: 100 },
      },
    ],
    edges: [
      {
        id: "edge_1",
        source: "node_trigger",
        target: "node_notify",
      },
      {
        id: "edge_2",
        source: "node_notify",
        target: "node_end",
      },
    ],
  };

  // Helper definition 2 (Modified with secret: TRIGGER -> EMAIL -> HTTP -> END)
  const validDefinitionV2 = {
    nodes: [
      {
        id: "node_trigger",
        name: "Webhook Trigger",
        type: "TRIGGER" as const,
        config: { triggerType: "WEBHOOK" },
        position: { x: 100, y: 100 },
      },
      {
        id: "node_notify",
        name: "Email Notification",
        type: "EMAIL" as const,
        config: {
          to: "exec@company.com", // modified
          subject: "Order Alert v2", // modified
          template: "Order received",
        },
        position: { x: 300, y: 100 },
      },
      {
        id: "node_http",
        name: "ERP Dispatch",
        type: "HTTP_REQUEST" as const,
        config: {
          url: "https://api.erp.internal/orders",
          method: "POST",
          apiSecretKey: "super-secret-token-12345", // sensitive credential
        },
        position: { x: 500, y: 100 },
      },
      {
        id: "node_end",
        name: "End Process",
        type: "END" as const,
        config: {},
        position: { x: 700, y: 100 },
      },
    ],
    edges: [
      {
        id: "edge_1",
        source: "node_trigger",
        target: "node_notify",
      },
      {
        id: "edge_2",
        source: "node_notify",
        target: "node_http",
      },
      {
        id: "edge_3",
        source: "node_http",
        target: "node_end",
      },
    ],
  };

  // ==========================================
  // 1. SETUP: ORGANIZATIONS & USERS
  // ==========================================
  it("registers Org A Owner and captures session", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Alice",
      lastName: "Owner",
      organizationName: "Workflow Systems Ltd",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    orgIdA = res.body.data.organization.id;
    ownerCookieA = res.headers["set-cookie"][0];
  });

  it("sets up Org A Member (restricted role) in same organization", async () => {
    const memberId = `user_member_${Date.now()}`;
    apiStore.users.set(memberId, {
      id: memberId,
      email: memberEmailA,
      passwordHash: "hash",
      firstName: "Bob",
      lastName: "Member",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    apiStore.memberships.set(`mem_${memberId}`, {
      id: `mem_${memberId}`,
      organizationId: orgIdA,
      userId: memberId,
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create session token for member
    memberTokenA = `sess_${Date.now()}_member`;
    apiStore.sessions.set(memberTokenA, {
      id: memberTokenA,
      userId: memberId,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("registers Org B Owner for tenant isolation verification", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Eve",
      lastName: "Isolator",
      organizationName: "Isolated Corp",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    orgIdB = res.body.data.organization.id;
    ownerCookieB = res.headers["set-cookie"][0];
  });

  // ==========================================
  // 2. DRAFT EDITING & OPTIMISTIC CONCURRENCY
  // ==========================================
  it("creates a new workflow starting at draftRevision 1", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", ownerCookieA)
      .send({
        name: "Order Processing Automation",
        description: "Draft revision and lifecycle test workflow",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    workflowIdA = res.body.data.id;
    expect(res.body.data.draftRevision).toBe(1);
    expect(res.body.data.publishedVersionId).toBeUndefined();
  });

  it("updates draft with valid expectedRevision 1 and increments revision to 2", async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}`)
      .set("Cookie", ownerCookieA)
      .send({
        expectedRevision: 1,
        nodes: validDefinitionV1.nodes,
        edges: validDefinitionV1.edges,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.draftRevision).toBe(2);
    expect(res.body.data.draftDefinition.nodes.length).toBe(3);
  });

  it("rejects concurrent draft edit with stale expectedRevision (DRAFT_CONFLICT)", async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}`)
      .set("Cookie", ownerCookieA)
      .send({
        expectedRevision: 1, // stale! Current revision is 2
        name: "Stale Concurrent Name Update",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("DRAFT_CONFLICT");
    expect(res.body.error.details.currentRevision).toBe(2);
  });

  // ==========================================
  // 3. PRE-PUBLICATION GRAPH VALIDATION
  // ==========================================
  it("prevents publishing an invalid workflow definition (missing terminal path / disconnected)", async () => {
    // Break graph by removing END node and edges
    await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}`)
      .set("Cookie", ownerCookieA)
      .send({
        nodes: [
          {
            id: "node_trigger",
            name: "Trigger",
            type: "TRIGGER",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_action_orphan",
            name: "Orphan Action",
            type: "EMAIL",
            config: { to: "a@b.com", subject: "Sub", template: "Body" },
            position: { x: 100, y: 100 },
          },
        ],
        edges: [],
      });

    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/publish`)
      .set("Cookie", ownerCookieA)
      .send({ releaseNotes: "Attempting invalid publish" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("GRAPH_VALIDATION_FAILED");
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  // ==========================================
  // 4. PUBLISHING IMMUTABLE VERSION 1 & CANONICAL CONTENT HASH
  // ==========================================
  it("restores valid definition and successfully publishes Version 1", async () => {
    // Restore valid definition
    await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}`)
      .set("Cookie", ownerCookieA)
      .send({
        nodes: validDefinitionV1.nodes,
        edges: validDefinitionV1.edges,
      });

    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/publish`)
      .set("Cookie", ownerCookieA)
      .send({ releaseNotes: "Initial Production Release v1" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version.versionNumber).toBe(1);
    expect(res.body.data.version.releaseNotes).toBe(
      "Initial Production Release v1",
    );

    version1Id = res.body.data.version.id;
    version1Hash = res.body.data.version.contentHash;
    expect(version1Hash).toBeDefined();
    expect(version1Hash.length).toBe(64); // SHA-256 hex string

    // Verify canonical content hash matches engine computation
    const expectedHash = computeWorkflowContentHash(validDefinitionV1);
    expect(version1Hash).toBe(expectedHash);

    // Verify auto-deployment to development environment
    expect(res.body.data.deployment).toBeDefined();
    expect(res.body.data.deployment.environment).toBe("development");
    expect(res.body.data.deployment.status).toBe("ACTIVE");
    expect(res.body.data.deployment.workflowVersionId).toBe(version1Id);
  });

  // ==========================================
  // 5. DUPLICATE PUBLICATION REJECTION
  // ==========================================
  it("rejects duplicate publication when workflow definition has not changed (UNCHANGED_CONTENT)", async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/publish`)
      .set("Cookie", ownerCookieA)
      .send({ releaseNotes: "Attempting duplicate publish" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNCHANGED_CONTENT");
    expect(res.body.data.currentVersion.id).toBe(version1Id);
    expect(res.body.data.contentHash).toBe(version1Hash);
  });

  // ==========================================
  // 6. IMMUTABILITY ENFORCEMENT ON PUBLISHED VERSIONS
  // ==========================================
  it("rejects PUT /versions/:id with 405 VERSION_IMMUTABLE", async () => {
    const res = await request(app)
      .put(`/api/v1/workflows/${workflowIdA}/versions/${version1Id}`)
      .set("Cookie", ownerCookieA)
      .send({ name: "Mutated Version Name" });

    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe("VERSION_IMMUTABLE");
  });

  it("rejects PATCH /versions/:id with 405 VERSION_IMMUTABLE", async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}/versions/${version1Id}`)
      .set("Cookie", ownerCookieA)
      .send({ releaseNotes: "Mutated Notes" });

    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe("VERSION_IMMUTABLE");
  });

  it("rejects DELETE /versions/:id with 405 VERSION_IMMUTABLE", async () => {
    const res = await request(app)
      .delete(`/api/v1/workflows/${workflowIdA}/versions/${version1Id}`)
      .set("Cookie", ownerCookieA);

    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe("VERSION_IMMUTABLE");
  });

  // ==========================================
  // 7. PUBLISHING VERSION 2 & COMPARISON WITH SENSITIVE REDACTION
  // ==========================================
  it("updates draft to definition V2 and publishes Version 2", async () => {
    await request(app)
      .patch(`/api/v1/workflows/${workflowIdA}`)
      .set("Cookie", ownerCookieA)
      .send({
        nodes: validDefinitionV2.nodes,
        edges: validDefinitionV2.edges,
      });

    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/publish`)
      .set("Cookie", ownerCookieA)
      .send({ releaseNotes: "Added ERP Dispatch HTTP node with token" });

    expect(res.status).toBe(201);
    expect(res.body.data.version.versionNumber).toBe(2);
    version2Id = res.body.data.version.id;
    version2Hash = res.body.data.version.contentHash;
    expect(version2Hash).not.toBe(version1Hash);
  });

  it("performs semantic comparison between V1 and V2 with credential redaction", async () => {
    const res = await request(app)
      .get(
        `/api/v1/workflows/${workflowIdA}/compare?baseVersionId=${version1Id}&targetVersionId=${version2Id}`,
      )
      .set("Cookie", ownerCookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const diff = res.body.data;
    expect(diff.isIdentical).toBe(false);

    // Added node
    expect(diff.addedNodes.length).toBe(1);
    expect(diff.addedNodes[0].id).toBe("node_http");
    // Verify credential was redacted in added node!
    expect(diff.addedNodes[0].config.apiSecretKey).toBe("[REDACTED]");

    // Modified node
    expect(diff.modifiedNodes.length).toBe(1);
    expect(diff.modifiedNodes[0].nodeId).toBe("node_notify");
    const changedPaths = diff.modifiedNodes[0].diffs.map((c: any) => c.path);
    expect(changedPaths).toContain("to");
    expect(changedPaths).toContain("subject");

    // Edge changes (edge_2 target changed, edge_3 added)
    expect(diff.addedEdges.length).toBeGreaterThan(0);
  });

  // ==========================================
  // 8. RESTORE HISTORICAL VERSION SNAPSHOT INTO DRAFT
  // ==========================================
  it("restores Version 1 snapshot back into workflow draft", async () => {
    const res = await request(app)
      .post(
        `/api/v1/workflows/${workflowIdA}/versions/${version1Id}/create-draft`,
      )
      .set("Cookie", ownerCookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.draftDefinition.nodes.length).toBe(3);
    expect(
      res.body.data.draftDefinition.nodes.find(
        (n: any) => n.id === "node_http",
      ),
    ).toBeUndefined();
  });

  // ==========================================
  // 9. ENVIRONMENT PROMOTION PIPELINE & IDEMPOTENCY
  // ==========================================
  it("promotes Version 2 to staging environment", async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieA)
      .send({
        versionId: version2Id,
        targetEnvironment: "staging",
        releaseNotes: "Promoting to Staging for QA sign-off",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.environment).toBe("staging");
    expect(res.body.data.workflowVersionId).toBe(version2Id);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("handles promote with idempotency-key correctly", async () => {
    const idempotencyKey = `promo_key_${Date.now()}`;
    const res1 = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieA)
      .set("idempotency-key", idempotencyKey)
      .send({
        versionId: version1Id,
        targetEnvironment: "staging",
        releaseNotes: "Switch staging to v1",
      });

    expect(res1.status).toBe(201);
    expect(res1.body.data.workflowVersionId).toBe(version1Id);

    // Replay same request with same idempotency key
    const res2 = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieA)
      .set("idempotency-key", idempotencyKey)
      .send({
        versionId: version1Id,
        targetEnvironment: "staging",
        releaseNotes: "Switch staging to v1",
      });

    expect(res2.status).toBe(200);
    expect(res2.body.meta?.idempotent).toBe(true);
    expect(res2.body.data.id).toBe(res1.body.data.id);
  });

  // ==========================================
  // 10. PRODUCTION DEPLOYMENT SAFEGUARD (RBAC)
  // ==========================================
  it("rejects Member without elevated privileges from promoting to production (403)", async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Authorization", `Bearer ${memberTokenA}`)
      .send({
        versionId: version2Id,
        targetEnvironment: "production",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PRODUCTION_DEPLOY_UNAUTHORIZED");
  });

  it("allows Owner to promote Version 2 to production", async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieA)
      .send({
        versionId: version2Id,
        targetEnvironment: "production",
        releaseNotes: "Production Live Release",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.environment).toBe("production");
    expect(res.body.data.workflowVersionId).toBe(version2Id);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  // ==========================================
  // 11. SAFE ROLLBACK WITHOUT HISTORY LOSS
  // ==========================================
  it("promotes Version 1 to production, then rolls back production to Version 2", async () => {
    // 1. Promote v1 to prod
    await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieA)
      .send({
        versionId: version1Id,
        targetEnvironment: "production",
        releaseNotes: "Update prod to v1",
      });

    // 2. Rollback production
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/environments/production/rollback`)
      .set("Cookie", ownerCookieA)
      .send({
        notes: "Emergency rollback to previous version",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workflowVersionId).toBe(version2Id); // restored v2!
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("preserves complete deployment audit history", async () => {
    const res = await request(app)
      .get(`/api/v1/workflows/${workflowIdA}/deployments`)
      .set("Cookie", ownerCookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Deployment history must contain multiple records including SUPERSEDED and ACTIVE
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    const statuses = res.body.data.map((d: any) => d.status);
    expect(statuses).toContain("ACTIVE");
    expect(statuses).toContain("SUPERSEDED");
  });

  // ==========================================
  // 12. TRIGGER-TO-VERSION RESOLUTION & EXECUTION IMMUTABILITY
  // ==========================================
  it("binds execution immutably to the environment's active deployed version at trigger acceptance", async () => {
    // Production currently has Version 2 active
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/trigger`)
      .set("Cookie", ownerCookieA)
      .set("x-environment", "production")
      .send({
        payload: { orderId: "ord_1001" },
      });

    expect(res.status).toBe(202);
    expect(res.body.data.workflowVersionId).toBe(version2Id);
    expect(res.body.data.environment).toBe("production");
    const executionId = res.body.data.id;

    // Now roll back production to Version 1
    await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/environments/production/rollback`)
      .set("Cookie", ownerCookieA)
      .send({ targetVersionId: version1Id });

    // Inspect the prior execution record in store: IT MUST REMAIN BOUND TO version2Id!
    const recordedExec = apiStore.executions.get(executionId);
    expect(recordedExec).toBeDefined();
    expect(recordedExec?.workflowVersionId).toBe(version2Id); // Unchanged!
  });

  // ==========================================
  // 13. CROSS-TENANT ISOLATION
  // ==========================================
  it("prevents Org B from accessing Org A's versions, deployments, or promotion endpoints", async () => {
    // 1. Get versions of Org A workflow
    const vRes = await request(app)
      .get(`/api/v1/workflows/${workflowIdA}/versions`)
      .set("Cookie", ownerCookieB);
    expect(vRes.status).toBe(404);

    // 2. Compare Org A versions
    const cRes = await request(app)
      .get(
        `/api/v1/workflows/${workflowIdA}/compare?baseVersionId=${version1Id}&targetVersionId=${version2Id}`,
      )
      .set("Cookie", ownerCookieB);
    expect(cRes.status).toBe(404);

    // 3. Promote Org A workflow
    const pRes = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/promote`)
      .set("Cookie", ownerCookieB)
      .send({
        versionId: version1Id,
        targetEnvironment: "production",
      });
    expect(pRes.status).toBe(404);

    // 4. Rollback Org A workflow
    const rRes = await request(app)
      .post(`/api/v1/workflows/${workflowIdA}/environments/production/rollback`)
      .set("Cookie", ownerCookieB)
      .send({});
    expect(rRes.status).toBe(404);
  });
});
