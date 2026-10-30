import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";

describe("Prompt 14: Workflow Collaboration and Team Productivity", () => {
  // Tenant A: Global Logistics Org
  const ownerEmailA = `collab_owner_${Date.now()}@flowforge.dev`;
  const memberEmailA1 = `collab_mem1_${Date.now()}@flowforge.dev`;
  const memberEmailA2 = `collab_mem2_${Date.now()}@flowforge.dev`;
  let orgIdA: string;
  let ownerIdA: string;
  let memberIdA1: string;
  let memberIdA2: string;
  let ownerCookieA: string;
  let memberCookieA1: string;
  let memberCookieA2: string;

  // Tenant B: FinCorp Org (Multi-tenant isolation)
  const ownerEmailB = `collab_tenant_b_${Date.now()}@flowforge.dev`;
  let orgIdB: string;
  let ownerIdB: string;
  let ownerCookieB: string;

  // Target Workflow
  let workflowIdA: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A Owner
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Alice",
      lastName: "Owner",
      organizationName: "Global Logistics Org",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup Member A1 (Bob) in Tenant A
    memberIdA1 = `usr_bob_${Date.now()}`;
    apiStore.users.set(memberIdA1, {
      id: memberIdA1,
      email: memberEmailA1,
      passwordHash: "mock_hash",
      firstName: "Bob",
      lastName: "Builder",
    });
    apiStore.memberships.set(`mem_${memberIdA1}_${orgIdA}`, {
      id: `mem_${memberIdA1}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA1,
      role: "MEMBER",
    });
    const sessionTokenA1 = `sess_bob_${Date.now()}`;
    apiStore.sessions.set(sessionTokenA1, {
      id: sessionTokenA1,
      userId: memberIdA1,
      token: sessionTokenA1,
      expiresAt: new Date(Date.now() + 3600000),
    });
    memberCookieA1 = `flowforge_session=${sessionTokenA1}`;

    // 3. Setup Member A2 (Charlie) in Tenant A
    memberIdA2 = `usr_charlie_${Date.now()}`;
    apiStore.users.set(memberIdA2, {
      id: memberIdA2,
      email: memberEmailA2,
      passwordHash: "mock_hash",
      firstName: "Charlie",
      lastName: "Reviewer",
    });
    apiStore.memberships.set(`mem_${memberIdA2}_${orgIdA}`, {
      id: `mem_${memberIdA2}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA2,
      role: "MEMBER",
    });
    const sessionTokenA2 = `sess_charlie_${Date.now()}`;
    apiStore.sessions.set(sessionTokenA2, {
      id: sessionTokenA2,
      userId: memberIdA2,
      token: sessionTokenA2,
      expiresAt: new Date(Date.now() + 3600000),
    });
    memberCookieA2 = `flowforge_session=${sessionTokenA2}`;

    // 4. Register Tenant B Owner (Eve)
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Eve",
      lastName: "External",
      organizationName: "FinCorp Org",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerIdB = resB.body.data.user.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 5. Create initial workflow in Tenant A by Alice
    const wfRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", ownerCookieA)
      .send({
        name: "Supply Chain Dispatch Pipeline",
        description: "Automated routing for cross-dock facilities",
      });
    expect(wfRes.status).toBe(201);
    expect(wfRes.body.success).toBe(true);
    workflowIdA = wfRes.body.data.id;
    expect(wfRes.body.data.createdById).toBe(ownerIdA);
  });

  describe("1. Collaborator Management & Permission Matrix", () => {
    it("should allow workflow owner to add an org member as EDITOR", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", ownerCookieA)
        .send({
          userId: memberIdA1,
          role: "EDITOR",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(memberIdA1);
      expect(res.body.data.role).toBe("EDITOR");
    });

    it("should reject adding a user who does not belong to the organization", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", ownerCookieA)
        .send({
          userId: ownerIdB, // Belongs to Tenant B
          role: "EDITOR",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_COLLABORATOR");
    });

    it("should allow EDITOR to edit workflow draft", async () => {
      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", memberCookieA1)
        .send({
          description: "Updated by Bob the Editor",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe("Updated by Bob the Editor");
      expect(res.body.data.lastUpdatedById).toBe(memberIdA1);
    });

    it("should forbid EDITOR from publishing the workflow", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/publish`)
        .set("Cookie", memberCookieA1)
        .send({
          changelog: "Unauthorized publish attempt",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should forbid EDITOR from managing collaborators", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", memberCookieA1)
        .send({
          userId: memberIdA2,
          role: "VIEWER",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should allow workflow owner to promote collaborator to MAINTAINER", async () => {
      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}/collaborators/${memberIdA1}`)
        .set("Cookie", ownerCookieA)
        .send({
          role: "MAINTAINER",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("MAINTAINER");
    });

    it("should allow MAINTAINER to publish workflow and manage collaborators", async () => {
      // 1. Maintainer publishes workflow
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/publish`)
        .set("Cookie", memberCookieA1)
        .send({
          changelog: "Published by Maintainer Bob",
        });

      expect([200, 201]).toContain(pubRes.status);
      expect(pubRes.body.success).toBe(true);

      // 2. Maintainer adds Member A2 as VIEWER
      const addRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", memberCookieA1)
        .send({
          userId: memberIdA2,
          role: "VIEWER",
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);
      expect(addRes.body.data.role).toBe("VIEWER");
    });

    it("should allow VIEWER to read workflow but forbid editing draft", async () => {
      // Read access
      const getRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", memberCookieA2);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.accessLevel).toBe("VIEWER");

      // Edit attempt forbidden
      const editRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", memberCookieA2)
        .send({
          description: "Illegal edit by Viewer Charlie",
        });

      expect(editRes.status).toBe(403);
      expect(editRes.body.success).toBe(false);
      expect(editRes.body.error.code).toBe("FORBIDDEN");
    });

    it("should allow MAINTAINER to remove VIEWER from workflow", async () => {
      const res = await request(app)
        .delete(`/api/v1/workflows/${workflowIdA}/collaborators/${memberIdA2}`)
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify collaborator list
      const listRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", ownerCookieA);

      expect(listRes.status).toBe(200);
      const remainingUserIds = listRes.body.data.map((c: any) => c.userId);
      expect(remainingUserIds).not.toContain(memberIdA2);
    });
  });

  describe("2. Workflow Ownership Transfer", () => {
    it("should allow workflow owner to transfer ownership to Member A1", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/transfer-ownership`)
        .set("Cookie", ownerCookieA)
        .send({
          newOwnerId: memberIdA1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.createdById).toBe(memberIdA1);

      // Verify previous owner Alice is preserved as MAINTAINER
      const collabRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", memberCookieA1);

      expect(collabRes.status).toBe(200);
      const prevOwnerEntry = collabRes.body.data.find((c: any) => c.userId === ownerIdA);
      expect(prevOwnerEntry).toBeDefined();
      expect(prevOwnerEntry.role).toBe("MAINTAINER");
    });

    it("should forbid non-owner/non-admin from transferring ownership", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/transfer-ownership`)
        .set("Cookie", memberCookieA2) // Charlie (regular member, no workflow role)
        .send({
          newOwnerId: memberIdA2,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe("3. Threaded Discussions & Contextual Comments", () => {
    let parentCommentId: string;
    let replyCommentId: string;

    it("should allow collaborators to post top-level comments pinned to revision and node", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", memberCookieA1)
        .send({
          content: "Please review the batch timeout parameter on the dispatch node.",
          nodeId: "node_dispatch_1",
          draftRevision: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe("Please review the batch timeout parameter on the dispatch node.");
      expect(res.body.data.nodeId).toBe("node_dispatch_1");
      expect(res.body.data.draftRevision).toBe(2);
      expect(res.body.data.isResolved).toBe(false);
      parentCommentId = res.body.data.id;
    });

    it("should allow another collaborator to post a reply in the discussion thread", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", ownerCookieA)
        .send({
          content: "Agreed, bumping default timeout to 120s sounds safe.",
          parentId: parentCommentId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBe(parentCommentId);
      replyCommentId = res.body.data.id;
    });

    it("should return nested threaded comments with author details", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/comments?status=all`)
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const parent = res.body.data.find((c: any) => c.id === parentCommentId);
      expect(parent).toBeDefined();
      expect(parent.author.email).toBe(memberEmailA1);
      expect(parent.replies).toHaveLength(1);
      expect(parent.replies[0].id).toBe(replyCommentId);
      expect(parent.replies[0].author.email).toBe(ownerEmailA);
    });

    it("should resolve and reopen comments with state tracking", async () => {
      // 1. Resolve comment
      const resolveRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments/${parentCommentId}/resolve`)
        .set("Cookie", ownerCookieA)
        .send({ isResolved: true });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.success).toBe(true);
      expect(resolveRes.body.data.isResolved).toBe(true);
      expect(resolveRes.body.data.resolvedById).toBe(ownerIdA);

      // Verify filter by open excludes resolved
      const openOnlyRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/comments?status=open`)
        .set("Cookie", memberCookieA1);
      expect(openOnlyRes.body.data.map((c: any) => c.id)).not.toContain(parentCommentId);

      // Verify filter by resolved includes it
      const resolvedOnlyRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/comments?status=resolved`)
        .set("Cookie", memberCookieA1);
      expect(resolvedOnlyRes.body.data.map((c: any) => c.id)).toContain(parentCommentId);

      // 2. Reopen comment
      const reopenRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments/${parentCommentId}/resolve`)
        .set("Cookie", memberCookieA1)
        .send({ isResolved: false });

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.isResolved).toBe(false);
      expect(reopenRes.body.data.resolvedById).toBeNull();
    });

    it("should allow author to edit and delete comment while forbidding non-authors", async () => {
      // Non-author Charlie tries to edit Bob's comment
      const forbidEditRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}/comments/${parentCommentId}`)
        .set("Cookie", memberCookieA2)
        .send({ content: "Malicious modification" });

      expect(forbidEditRes.status).toBe(403);
      expect(forbidEditRes.body.success).toBe(false);

      // Bob edits his own comment
      const editRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}/comments/${parentCommentId}`)
        .set("Cookie", memberCookieA1)
        .send({ content: "Updated review requirement." });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.content).toBe("Updated review requirement.");

      // Alice (org owner) deletes the reply
      const delReplyRes = await request(app)
        .delete(`/api/v1/workflows/${workflowIdA}/comments/${replyCommentId}`)
        .set("Cookie", ownerCookieA);

      expect(delReplyRes.status).toBe(200);
      expect(delReplyRes.body.success).toBe(true);
    });
  });

  describe("4. Optimistic Concurrency & Conflict Detection", () => {
    it("should detect conflict when saving draft with stale expectedRevision", async () => {
      // 1. Fetch current revision
      const getRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", memberCookieA1);
      expect(getRes.status).toBe(200);
      const currentRev = getRes.body.data.draftRevision;

      // 2. Bob updates draft with current revision (succeeds, increments revision)
      const bobRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", memberCookieA1)
        .send({
          name: "Supply Chain Dispatch Pipeline v2",
          expectedRevision: currentRev,
        });

      expect(bobRes.status).toBe(200);
      expect(bobRes.body.data.draftRevision).toBe(currentRev + 1);
      expect(bobRes.body.data.lastUpdatedById).toBe(memberIdA1);

      // 3. Alice attempts to save with the old stale revision -> 409 Conflict
      const staleRes = await request(app)
        .patch(`/api/v1/workflows/${workflowIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          name: "Conflicting Alice Update",
          expectedRevision: currentRev,
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.success).toBe(false);
      expect(staleRes.body.error.code).toBe("DRAFT_CONFLICT");
      expect(staleRes.body.error.details.expectedRevision).toBe(currentRev);
      expect(staleRes.body.error.details.currentRevision).toBe(currentRev + 1);
      expect(staleRes.body.error.details.lastUpdatedById).toBe(memberIdA1);
    });
  });

  describe("5. Team Activity Feeds", () => {
    it("should return workflow-level activity feed with actor metadata", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/activities`)
        .set("Cookie", memberCookieA1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);

      // Verify event types exist in chronological stream
      const types = res.body.data.map((a: any) => a.type);
      expect(types).toContain("WORKFLOW_CREATED");
      expect(types).toContain("COLLABORATOR_ADDED");
      expect(types).toContain("DRAFT_UPDATED");
      expect(types).toContain("OWNERSHIP_TRANSFERRED");

      // Verify actor format
      const firstEvent = res.body.data[0];
      expect(firstEvent.actor).toBeDefined();
      expect(firstEvent.actor.email).toBeDefined();
    });

    it("should return organization-wide activity feed", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/activities`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);

      // Verify organization filter by type
      const filteredRes = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/activities?type=OWNERSHIP_TRANSFERRED`)
        .set("Cookie", ownerCookieA);

      expect(filteredRes.status).toBe(200);
      expect(filteredRes.body.data.every((a: any) => a.type === "OWNERSHIP_TRANSFERRED")).toBe(true);
    });
  });

  describe("6. Multi-Tenant Isolation & Boundary Enforcement", () => {
    it("should prevent Tenant B user from accessing Tenant A workflow collaborators", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", ownerCookieB);

      expect([403, 404]).toContain(res.status);
    });

    it("should prevent Tenant B user from modifying Tenant A workflow collaborators", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/collaborators`)
        .set("Cookie", ownerCookieB)
        .send({
          userId: ownerIdB,
          role: "EDITOR",
        });

      expect([403, 404]).toContain(res.status);
    });

    it("should prevent Tenant B user from viewing or adding Tenant A comments", async () => {
      const getRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", ownerCookieB);

      expect([403, 404]).toContain(getRes.status);

      const postRes = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/comments`)
        .set("Cookie", ownerCookieB)
        .send({
          content: "Cross tenant comment attempt",
        });

      expect([403, 404]).toContain(postRes.status);
    });

    it("should prevent Tenant B user from viewing Tenant A activities", async () => {
      const wfRes = await request(app)
        .get(`/api/v1/workflows/${workflowIdA}/activities`)
        .set("Cookie", ownerCookieB);

      expect([403, 404]).toContain(wfRes.status);

      const orgRes = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/activities`)
        .set("Cookie", ownerCookieB);

      expect([403, 404]).toContain(orgRes.status);
    });

    it("should never leak Tenant A events into Tenant B activity feed", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdB}/activities`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const leakedWorkflows = res.body.data.filter((a: any) => a.workflowId === workflowIdA);
      expect(leakedWorkflows).toHaveLength(0);
    });
  });

  describe("7. Workflow List Filtering (All, Created by Me, Shared with Me)", () => {
    it("should filter workflows by created_by_me and shared_with_me", async () => {
      // 1. Bob (now owner of workflowIdA) filters created_by_me
      const bobCreatedRes = await request(app)
        .get("/api/v1/workflows?filter=created_by_me")
        .set("Cookie", memberCookieA1);

      expect(bobCreatedRes.status).toBe(200);
      const bobCreatedIds = bobCreatedRes.body.data.map((w: any) => w.id);
      expect(bobCreatedIds).toContain(workflowIdA);

      // 2. Alice (now collaborator/maintainer of workflowIdA) filters shared_with_me
      const aliceSharedRes = await request(app)
        .get("/api/v1/workflows?filter=shared_with_me")
        .set("Cookie", ownerCookieA);

      expect(aliceSharedRes.status).toBe(200);
      const aliceSharedIds = aliceSharedRes.body.data.map((w: any) => w.id);
      expect(aliceSharedIds).toContain(workflowIdA);

      // 3. Alice filters created_by_me (since ownership was transferred to Bob, workflowIdA is not created_by_me)
      const aliceCreatedRes = await request(app)
        .get("/api/v1/workflows?filter=created_by_me")
        .set("Cookie", ownerCookieA);

      expect(aliceCreatedRes.status).toBe(200);
      const aliceCreatedWfIds = aliceCreatedRes.body.data.map((w: any) => w.id);
      expect(aliceCreatedWfIds).not.toContain(workflowIdA);

      // 4. All workflows endpoint includes accessLevel and owner metadata
      const allRes = await request(app)
        .get("/api/v1/workflows?filter=all")
        .set("Cookie", memberCookieA1);

      expect(allRes.status).toBe(200);
      const targetWf = allRes.body.data.find((w: any) => w.id === workflowIdA);
      expect(targetWf).toBeDefined();
      expect(targetWf.accessLevel).toBe("OWNER");
      expect(targetWf.owner).toBeDefined();
      expect(targetWf.owner.id).toBe(memberIdA1);
    });
  });
});
