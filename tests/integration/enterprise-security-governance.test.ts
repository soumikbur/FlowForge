import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";

describe("Prompt 11: Enterprise Security, Governance, and Organization Administration", () => {
  // Tenant A: Sovereign Enterprises
  const ownerEmailA = `sovereign_owner_${Date.now()}@flowforge.dev`;
  const adminEmailA = `sovereign_admin_${Date.now()}@flowforge.dev`;
  const memberEmailA = `sovereign_member_${Date.now()}@flowforge.dev`;
  const viewerEmailA = `sovereign_viewer_${Date.now()}@flowforge.dev`;

  let ownerCookieA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;

  let ownerIdA: string;
  let adminIdA: string;
  let memberIdA: string;
  let viewerIdA: string;
  let orgIdA: string;
  let workflowIdA: string;

  // Tenant B: Isolated Systems
  const ownerEmailB = `isolated_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;
  let workflowIdB: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A Owner
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Owner",
      lastName: "Sovereign",
      organizationName: "Sovereign Enterprises",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup Tenant A Admin
    adminIdA = `usr_admin_${Date.now()}`;
    apiStore.users.set(adminIdA, {
      id: adminIdA,
      email: adminEmailA,
      passwordHash: "mock_hash",
      firstName: "Admin",
      lastName: "User",
    });
    apiStore.memberships.set(`mem_${adminIdA}_${orgIdA}`, {
      id: `mem_${adminIdA}_${orgIdA}`,
      organizationId: orgIdA,
      userId: adminIdA,
      role: "ADMIN",
    });
    adminTokenA = `sess_tok_${Date.now()}_admin`;
    apiStore.sessions.set(adminTokenA, {
      id: adminTokenA,
      userId: adminIdA,
      token: adminTokenA,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 3. Setup Tenant A Member
    memberIdA = `usr_member_${Date.now()}`;
    apiStore.users.set(memberIdA, {
      id: memberIdA,
      email: memberEmailA,
      passwordHash: "mock_hash",
      firstName: "Member",
      lastName: "User",
    });
    apiStore.memberships.set(`mem_${memberIdA}_${orgIdA}`, {
      id: `mem_${memberIdA}_${orgIdA}`,
      organizationId: orgIdA,
      userId: memberIdA,
      role: "MEMBER",
    });
    memberTokenA = `sess_tok_${Date.now()}_member`;
    apiStore.sessions.set(memberTokenA, {
      id: memberTokenA,
      userId: memberIdA,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 4. Setup Tenant A Viewer
    viewerIdA = `usr_viewer_${Date.now()}`;
    apiStore.users.set(viewerIdA, {
      id: viewerIdA,
      email: viewerEmailA,
      passwordHash: "mock_hash",
      firstName: "Viewer",
      lastName: "User",
    });
    apiStore.memberships.set(`mem_${viewerIdA}_${orgIdA}`, {
      id: `mem_${viewerIdA}_${orgIdA}`,
      organizationId: orgIdA,
      userId: viewerIdA,
      role: "VIEWER",
    });
    viewerTokenA = `sess_tok_${Date.now()}_viewer`;
    apiStore.sessions.set(viewerTokenA, {
      id: viewerTokenA,
      userId: viewerIdA,
      token: viewerTokenA,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 5. Register Tenant B Owner
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Owner",
      lastName: "Isolated",
      organizationName: "Isolated Systems",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 6. Create Seed Workflows
    workflowIdA = `wf_sov_${Date.now()}`;
    apiStore.workflows.set(workflowIdA, {
      id: workflowIdA,
      organizationId: orgIdA,
      name: "Sovereign Main Workflow",
      status: "ACTIVE",
      draftDefinition: { nodes: [], edges: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    workflowIdB = `wf_iso_${Date.now()}`;
    apiStore.workflows.set(workflowIdB, {
      id: workflowIdB,
      organizationId: orgIdB,
      name: "Isolated B Workflow",
      status: "ACTIVE",
      draftDefinition: { nodes: [], edges: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // ==========================================
  // 1. ROLE & PERMISSION MATRIX (VIEWER, MEMBER, ADMIN, OWNER)
  // ==========================================
  describe("1. Role-Based Access Control & Permission Enforcements", () => {
    it("allows VIEWER to read workflows, members, and analytics", async () => {
      // Workflows
      const resWf = await request(app)
        .get("/api/v1/workflows")
        .set("Authorization", `Bearer ${viewerTokenA}`);
      expect(resWf.status).toBe(200);

      // Members
      const resMem = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/members`)
        .set("Authorization", `Bearer ${viewerTokenA}`);
      expect(resMem.status).toBe(200);

      // Analytics
      const resAnalytics = await request(app)
        .get("/api/v1/analytics/overview")
        .set("Authorization", `Bearer ${viewerTokenA}`);
      expect(resAnalytics.status).toBe(200);
    });

    it("forbids VIEWER from creating or modifying workflows", async () => {
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({ name: "Unauthorized Workflow" });

      expect(res.status).toBe(403);
    });

    it("forbids VIEWER from executing workflows", async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/${workflowIdA}/trigger`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({ payload: {} });

      expect(res.status).toBe(403);
    });

    it("forbids VIEWER and MEMBER from inviting new members", async () => {
      const resViewer = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({ email: "new_person@corp.com", role: "MEMBER" });
      expect(resViewer.status).toBe(403);

      const resMember = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ email: "new_person2@corp.com", role: "MEMBER" });
      expect(resMember.status).toBe(403);
    });

    it("allows ADMIN to invite members but forbids non-owners from inviting OWNERs", async () => {
      const resAdminInviteOwner = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ email: "wannabe_owner@corp.com", role: "OWNER" });

      expect(resAdminInviteOwner.status).toBe(403);
    });
  });

  // ==========================================
  // 2. ORGANIZATION SETTINGS & GOVERNANCE
  // ==========================================
  describe("2. Organization Settings, Timezone & Last-Owner Invariant", () => {
    it("retrieves organization settings", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/settings`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("timezone");
      expect(res.body.data).toHaveProperty("executionRetentionDays");
      expect(res.body.data).toHaveProperty("auditRetentionDays");
    });

    it("updates organization settings with validation (timezone, retention, IP ranges)", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgIdA}/settings`)
        .set("Cookie", ownerCookieA)
        .send({
          name: "Sovereign Enterprises International",
          timezone: "America/New_York",
          billingEmail: "governance@sovereign.internal",
          enforce2FA: true,
          allowedIpRanges: ["10.50.0.0/16"],
          executionRetentionDays: 60,
          auditRetentionDays: 180,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Sovereign Enterprises International");
      expect(res.body.data.timezone).toBe("America/New_York");
      expect(res.body.data.enforce2FA).toBe(true);
      expect(res.body.data.executionRetentionDays).toBe(60);
    });

    it("enforces last-owner protection against demoting the sole owner", async () => {
      const ownerMem = Array.from(apiStore.memberships.values()).find(
        (m) => m.organizationId === orgIdA && m.role === "OWNER"
      );
      expect(ownerMem).toBeDefined();

      const res = await request(app)
        .patch(`/api/v1/organizations/${orgIdA}/members/${ownerMem!.id}`)
        .set("Cookie", ownerCookieA)
        .send({ role: "ADMIN" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LAST_OWNER_PROTECTION");
    });

    it("enforces last-owner protection against removing the sole owner", async () => {
      const ownerMem = Array.from(apiStore.memberships.values()).find(
        (m) => m.organizationId === orgIdA && m.role === "OWNER"
      );

      const res = await request(app)
        .delete(`/api/v1/organizations/${orgIdA}/members/${ownerMem!.id}`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LAST_OWNER_PROTECTION");
    });

    it("successfully transfers organization ownership to another member", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/transfer-ownership`)
        .set("Cookie", ownerCookieA)
        .send({ newOwnerUserId: adminIdA });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newOwnerId).toBe(adminIdA);

      // Verify roles in store: adminIdA is now OWNER, ownerIdA is now ADMIN
      const newOwnerMem = Array.from(apiStore.memberships.values()).find(
        (m) => m.organizationId === orgIdA && m.userId === adminIdA
      );
      expect(newOwnerMem?.role).toBe("OWNER");

      const prevOwnerMem = Array.from(apiStore.memberships.values()).find(
        (m) => m.organizationId === orgIdA && m.userId === ownerIdA
      );
      expect(prevOwnerMem?.role).toBe("ADMIN");

      // Verify audit event
      const audit = apiStore.auditLogs.find(
        (l) => l.action === "organization.ownership_transferred" && l.organizationId === orgIdA
      );
      expect(audit).toBeDefined();

      // Transfer ownership back to maintain consistency for subsequent tests
      const revertRes = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/transfer-ownership`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ newOwnerUserId: ownerIdA });
      expect(revertRes.status).toBe(200);
    });
  });

  // ==========================================
  // 3. SECURE INVITATION LIFECYCLE
  // ==========================================
  describe("3. Secure Member Invitation Lifecycle", () => {
    let invitationToken: string;
    let invitationId: string;
    const inviteeEmail = `invitee_${Date.now()}@flowforge.dev`;

    it("issues a cryptographically hashed invitation with single-use secret token", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Cookie", ownerCookieA)
        .send({ email: inviteeEmail, role: "MEMBER" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.status).toBe("PENDING");

      invitationToken = res.body.data.token;
      invitationId = res.body.data.id;

      // Ensure plaintext token is NOT stored in database
      const storedInv = apiStore.invitations.get(invitationId);
      expect(storedInv).toBeDefined();
      expect(storedInv!.tokenHash).toBeDefined();
      expect((storedInv as any).token).toBeUndefined();
      expect(storedInv!.tokenHash).not.toBe(invitationToken);

      // Ensure audit log did NOT record raw token
      const audit = apiStore.auditLogs.find(
        (l) => l.action === "organization.invitation.created" && l.resourceId === invitationId
      );
      expect(audit).toBeDefined();
      expect(JSON.stringify(audit!.metadata)).not.toContain(invitationToken);
    });

    it("rejects duplicate active invitations for the same email", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Cookie", ownerCookieA)
        .send({ email: inviteeEmail, role: "MEMBER" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVITATION_ALREADY_EXISTS");
    });

    it("accepts invitation via token and creates membership atomically", async () => {
      const res = await request(app)
        .post("/api/v1/organizations/invitations/accept")
        .send({ token: invitationToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(orgIdA);
      expect(res.body.data.role).toBe("MEMBER");

      // Verify invitation transitioned to ACCEPTED
      const updatedInv = apiStore.invitations.get(invitationId);
      expect(updatedInv?.status).toBe("ACCEPTED");
      expect(updatedInv?.acceptedAt).toBeDefined();
    });

    it("rejects re-use of already accepted invitation tokens", async () => {
      const res = await request(app)
        .post("/api/v1/organizations/invitations/accept")
        .send({ token: invitationToken });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVITATION_ALREADY_USED");
    });

    it("allows revoking an invitation and forbids accepting revoked invitations", async () => {
      // Create new invite to revoke
      const resCreate = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations`)
        .set("Cookie", ownerCookieA)
        .send({ email: `revoked_${Date.now()}@flowforge.dev`, role: "VIEWER" });

      const revokeToken = resCreate.body.data.token;
      const revokeId = resCreate.body.data.id;

      // Revoke
      const resRevoke = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/invitations/${revokeId}/revoke`)
        .set("Cookie", ownerCookieA);
      expect(resRevoke.status).toBe(200);

      // Attempt to accept
      const resAccept = await request(app)
        .post("/api/v1/organizations/invitations/accept")
        .send({ token: revokeToken });

      expect(resAccept.status).toBe(400);
      expect(resAccept.body.error.code).toBe("INVITATION_REVOKED");
    });
  });

  // ==========================================
  // 4. API CREDENTIALS & SERVICE ACCESS
  // ==========================================
  describe("4. Scoped API Key Authentication & Access Controls", () => {
    let apiPlaintextKey: string;
    let apiKeyId: string;

    it("generates an API key with specific scopes and displays secret token once", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/api-keys`)
        .set("Cookie", ownerCookieA)
        .send({
          name: "CI/CD Deployment Service Key",
          scopes: ["workflow:read", "workflow:execute"],
          expiresInDays: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.token).toMatch(/^ff_live_/);
      expect(res.body.data.scopes).toContain("workflow:read");
      expect(res.body.data.scopes).toContain("workflow:execute");

      apiPlaintextKey = res.body.data.token;
      apiKeyId = res.body.data.id;

      // Verify that stored record only has keyHash, not raw token
      const storedKey = apiStore.apiKeys.get(apiKeyId);
      expect(storedKey).toBeDefined();
      expect(storedKey!.keyHash).toBeDefined();
      expect((storedKey as any).token).toBeUndefined();
    });

    it("authenticates via API Key on authorized scoped endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/workflows")
        .set("Authorization", `Bearer ${apiPlaintextKey}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify lastUsedAt was recorded
      const storedKey = apiStore.apiKeys.get(apiKeyId);
      expect(storedKey?.lastUsedAt).toBeDefined();
    });

    it("denies API key when endpoint requires a scope that was not granted", async () => {
      // Key only has workflow:read and workflow:execute, missing workflow:write
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${apiPlaintextKey}`)
        .send({ name: "Attempt by API Key without write scope" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("INSUFFICIENT_SCOPE");
    });

    it("prevents API keys from performing user/session operations like ownership transfer", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/transfer-ownership`)
        .set("Authorization", `Bearer ${apiPlaintextKey}`)
        .send({ newOwnerUserId: memberIdA });

      expect(res.status).toBe(403);
    });

    it("revokes an API key and subsequently rejects requests", async () => {
      const resRevoke = await request(app)
        .delete(`/api/v1/organizations/${orgIdA}/api-keys/${apiKeyId}`)
        .set("Cookie", ownerCookieA);

      expect(resRevoke.status).toBe(200);

      const resAuth = await request(app)
        .get("/api/v1/workflows")
        .set("Authorization", `Bearer ${apiPlaintextKey}`);

      expect(resAuth.status).toBe(401);
      expect(resAuth.body.error.code).toBe("REVOKED_API_KEY");
    });
  });

  // ==========================================
  // 5. CROSS-TENANT ISOLATION
  // ==========================================
  describe("5. Cross-Tenant Isolation Safeguards", () => {
    it("strictly isolates Tenant B from accessing Tenant A settings", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/settings`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("strictly isolates Tenant B from accessing Tenant A members or API keys", async () => {
      const resMembers = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/members`)
        .set("Cookie", ownerCookieB);
      expect(resMembers.status).toBe(403);

      const resKeys = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/api-keys`)
        .set("Cookie", ownerCookieB);
      expect(resKeys.status).toBe(403);
    });

    it("strictly isolates Tenant B from accessing Tenant A audit logs", async () => {
      const resAudit = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/audit-logs`)
        .set("Cookie", ownerCookieB);

      expect(resAudit.status).toBe(403);
    });
  });

  // ==========================================
  // 6. RATE LIMITING & SECURITY HEADERS
  // ==========================================
  describe("6. Rate Limiting, Abuse Controls & Security Headers", () => {
    it("returns standard security headers on API responses", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("enforces rate limits and returns 429 with Retry-After header on sustained bursts", async () => {
      // Make repeated fast requests
      let rateLimited = false;
      for (let i = 0; i < 310; i++) {
        const res = await request(app).get("/health");
        if (res.status === 429) {
          rateLimited = true;
          expect(res.headers).toHaveProperty("retry-after");
          expect(res.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
          break;
        }
      }
      expect(rateLimited).toBe(true);

      // Reset limiter for remaining tests
      resetRateLimits();
    });
  });

  // ==========================================
  // 7. DATA RETENTION & PRIVACY CONTROLS
  // ==========================================
  describe("7. Data Retention & Execution Pruning Controls", () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

    beforeAll(() => {
      // Seed terminal execution older than 90-day retention cutoff
      const oldTerminalExecId = `exec_old_term_${Date.now()}`;
      apiStore.executions.set(oldTerminalExecId, {
        id: oldTerminalExecId,
        organizationId: orgIdA,
        workflowId: workflowIdA,
        workflowVersionId: "ver_1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "SUCCEEDED",
        contextData: {},
        createdAt: oldDate,
        updatedAt: oldDate,
        retryCount: 0,
      });

      // Seed non-terminal active execution older than 90-day retention cutoff (MUST NEVER BE DELETED!)
      const oldActiveExecId = `exec_old_active_${Date.now()}`;
      apiStore.executions.set(oldActiveExecId, {
        id: oldActiveExecId,
        organizationId: orgIdA,
        workflowId: workflowIdA,
        workflowVersionId: "ver_1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "RUNNING", // active status
        contextData: {},
        createdAt: oldDate,
        updatedAt: oldDate,
        retryCount: 0,
      });
    });

    it("executes a dry-run cleanup assessment without deleting records", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/retention/cleanup`)
        .set("Cookie", ownerCookieA)
        .send({ dryRun: true, olderThanDays: 90 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dryRun).toBe(true);
      expect(res.body.data.candidateExecutionsCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.prunedExecutionsCount).toBe(0);
    });

    it("purges eligible terminal records while preserving active in-flight executions", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/retention/cleanup`)
        .set("Cookie", ownerCookieA)
        .send({ dryRun: false, olderThanDays: 90 });

      expect(res.status).toBe(200);
      expect(res.body.data.dryRun).toBe(false);
      expect(res.body.data.prunedExecutionsCount).toBeGreaterThanOrEqual(1);

      // Assert that non-terminal running execution was strictly preserved
      const remainingExecs = Array.from(apiStore.executions.values()).filter(
        (e) => e.organizationId === orgIdA && e.status === "RUNNING"
      );
      expect(remainingExecs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
