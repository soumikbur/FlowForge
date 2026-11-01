import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { entitlementService } from "../../apps/api/src/services/entitlement.service.js";
import { defaultEmailService } from "@flowforge/integrations";
import { dispatchOutboxEvent } from "@flowforge/integrations";
import { DEFAULT_PLANS } from "@flowforge/shared";

describe("Prompt 23: Enterprise Licensing, White-Labeling, and Multi-Workspace Management", () => {
  let orgA: any;
  let orgB: any;
  let ownerUser: any;
  let adminUser: any;
  let memberUser: any;
  let viewerUser: any;
  let strangerUser: any;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;
  let strangerToken: string;

  beforeEach(() => {
    apiStore.clear();

    // 1. Create Organization A
    orgA = {
      id: `org_a_${Date.now()}`,
      name: "Acme Enterprise Corp",
      slug: `acme-${Date.now()}`,
      billingEmail: "admin@acme.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Create Organization B (Tenant Isolation)
    orgB = {
      id: `org_b_${Date.now()}`,
      name: "Beta Solutions Ltd",
      slug: `beta-${Date.now()}`,
      billingEmail: "admin@beta.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Create Users
    ownerUser = {
      id: `usr_owner_${Date.now()}`,
      email: "owner@acme.com",
      firstName: "Alice",
      lastName: "Owner",
    };
    adminUser = {
      id: `usr_admin_${Date.now()}`,
      email: "admin@acme.com",
      firstName: "Bob",
      lastName: "Admin",
    };
    memberUser = {
      id: `usr_member_${Date.now()}`,
      email: "member@acme.com",
      firstName: "Charlie",
      lastName: "Member",
    };
    viewerUser = {
      id: `usr_viewer_${Date.now()}`,
      email: "viewer@acme.com",
      firstName: "Dana",
      lastName: "Viewer",
    };
    strangerUser = {
      id: `usr_stranger_${Date.now()}`,
      email: "stranger@beta.com",
      firstName: "Eve",
      lastName: "Stranger",
    };

    apiStore.users.set(ownerUser.id, ownerUser);
    apiStore.users.set(adminUser.id, adminUser);
    apiStore.users.set(memberUser.id, memberUser);
    apiStore.users.set(viewerUser.id, viewerUser);
    apiStore.users.set(strangerUser.id, strangerUser);

    // 4. Create Memberships in Org A
    apiStore.memberships.set(`mem_1`, {
      id: "mem_1",
      organizationId: orgA.id,
      userId: ownerUser.id,
      role: "OWNER",
    });
    apiStore.memberships.set(`mem_2`, {
      id: "mem_2",
      organizationId: orgA.id,
      userId: adminUser.id,
      role: "ADMIN",
    });
    apiStore.memberships.set(`mem_3`, {
      id: "mem_3",
      organizationId: orgA.id,
      userId: memberUser.id,
      role: "MEMBER",
    });
    apiStore.memberships.set(`mem_4`, {
      id: "mem_4",
      organizationId: orgA.id,
      userId: viewerUser.id,
      role: "VIEWER",
    });

    // Membership for Stranger in Org B
    apiStore.memberships.set(`mem_5`, {
      id: "mem_5",
      organizationId: orgB.id,
      userId: strangerUser.id,
      role: "OWNER",
    });

    // 5. Create Sessions
    ownerToken = `sess_owner_${Date.now()}`;
    adminToken = `sess_admin_${Date.now()}`;
    memberToken = `sess_member_${Date.now()}`;
    viewerToken = `sess_viewer_${Date.now()}`;
    strangerToken = `sess_stranger_${Date.now()}`;

    const expiresAt = new Date(Date.now() + 86400000);
    apiStore.sessions.set(ownerToken, {
      id: "s1",
      userId: ownerUser.id,
      token: ownerToken,
      expiresAt,
    });
    apiStore.sessions.set(adminToken, {
      id: "s2",
      userId: adminUser.id,
      token: adminToken,
      expiresAt,
    });
    apiStore.sessions.set(memberToken, {
      id: "s3",
      userId: memberUser.id,
      token: memberToken,
      expiresAt,
    });
    apiStore.sessions.set(viewerToken, {
      id: "s4",
      userId: viewerUser.id,
      token: viewerToken,
      expiresAt,
    });
    apiStore.sessions.set(strangerToken, {
      id: "s5",
      userId: strangerUser.id,
      token: strangerToken,
      expiresAt,
    });
  });

  // ==========================================
  // 1. WORKSPACE CREATION & LIFECYCLE
  // ==========================================
  describe("Multi-Workspace Management & Quotas", () => {
    it("1.1 should create the first workspace as the default workspace and assign creator as admin", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Engineering Core",
          slug: "engineering-core",
          description: "Primary engineering workspace",
          timezone: "America/New_York",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Engineering Core");
      expect(res.body.data.slug).toBe("engineering-core");
      expect(res.body.data.isDefault).toBe(true);
      expect(res.body.data.status).toBe("ACTIVE");

      // Verify creator membership in workspace
      const member = Array.from(apiStore.workspaceMembers.values()).find(
        (m) => m.workspaceId === res.body.data.id && m.userId === adminUser.id,
      );
      expect(member).toBeDefined();
      expect(member?.role).toBe("ADMIN");
    });

    it("1.2 should reject invalid workspace slugs with validation errors", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Invalid Slug",
          slug: "Invalid_Slug!", // Contains uppercase and special chars
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("1.3 should reject duplicate slugs within the same organization", async () => {
      // First workspace
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Core", slug: "core-team" });

      // Upgrade plan to enterprise to allow 2nd workspace
      apiStore.subscriptions.set("sub_a", {
        id: "sub_a",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Duplicate slug
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Duplicate Core", slug: "core-team" });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("SLUG_CONFLICT");
    });

    it("1.4 should enforce plan workspace quota (Free tier allows max 1 workspace)", async () => {
      // Create first workspace (succeeds)
      const res1 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Workspace 1", slug: "ws-one" });
      expect(res1.status).toBe(201);

      // Attempt 2nd workspace without upgrading (fails quota check)
      const res2 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Workspace 2", slug: "ws-two" });

      expect(res2.status).toBe(402);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe("QUOTA_EXCEEDED");
    });

    it("1.5 should allow archiving non-default workspaces and prevent archiving default workspace", async () => {
      // Upgrade to allow 2 workspaces
      apiStore.subscriptions.set("sub_a", {
        id: "sub_a",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ws1 = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Default WS", slug: "default-ws" })
      ).body.data;

      const ws2 = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Secondary WS", slug: "secondary-ws" })
      ).body.data;

      // Attempt archiving default workspace (must fail)
      const archDefault = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws1.id}/archive`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(archDefault.status).toBe(400);
      expect(archDefault.body.error.code).toBe("CANNOT_ARCHIVE_DEFAULT");

      // Archive secondary workspace (must succeed)
      const archSecondary = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws2.id}/archive`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(archSecondary.status).toBe(200);
      expect(archSecondary.body.data.status).toBe("ARCHIVED");

      // Restore secondary workspace (must succeed)
      const restoreSecondary = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws2.id}/restore`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(restoreSecondary.status).toBe(200);
      expect(restoreSecondary.body.data.status).toBe("ACTIVE");
    });
  });

  // ==========================================
  // 2. WORKSPACE RESOURCE SCOPING & EXECUTION GUARD
  // ==========================================
  describe("Workspace Resource Scoping & Execution Guard", () => {
    it("2.1 should reject workflow execution when the workspace is archived", async () => {
      // 1. Upgrade to enterprise
      apiStore.subscriptions.set("sub_a", {
        id: "sub_a",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Create workspace & secondary workspace
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Default WS", slug: "default-ws" });

      const wsSecondary = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Finance Projects", slug: "finance-ws" })
      ).body.data;

      // 3. Create workflow assigned to secondary workspace
      const wfRes = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id)
        .send({
          name: "Payroll Pipeline",
          workspaceId: wsSecondary.id,
        });
      expect(wfRes.status).toBe(201);
      const workflow = wfRes.body.data;
      expect(workflow.workspaceId).toBe(wsSecondary.id);

      // Add a valid version so workflow can be triggered
      const versionId = `ver_${Date.now()}`;
      apiStore.versions.set(versionId, {
        id: versionId,
        workflowId: workflow.id,
        versionNumber: 1,
        definition: workflow.draftDefinition,
        publishedAt: new Date(),
      });
      workflow.publishedVersionId = versionId;
      workflow.status = "ACTIVE";
      apiStore.workflows.set(workflow.id, workflow);

      // 4. Archive the secondary workspace
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/workspaces/${wsSecondary.id}/archive`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      // 5. Attempt execution (must be rejected with WORKSPACE_ARCHIVED)
      const execRes = await request(app)
        .post(`/api/v1/workflows/${workflow.id}/execute`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id)
        .send({ payload: { run: true } });

      expect(execRes.status).toBe(403);
      expect(execRes.body.error.code).toBe("WORKSPACE_ARCHIVED");

      // 6. Restore workspace and execution should succeed
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/workspaces/${wsSecondary.id}/restore`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      const execRes2 = await request(app)
        .post(`/api/v1/workflows/${workflow.id}/execute`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id)
        .send({ payload: { run: true } });

      expect(execRes2.status).toBe(202);
      expect(execRes2.body.success).toBe(true);
    });

    it("2.2 should filter workflows by workspaceId query parameter", async () => {
      // Create workspace
      const ws = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Analytics WS", slug: "analytics-ws" })
      ).body.data;

      // Create one workflow in workspace and one without
      await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id)
        .send({ name: "In Workspace", workspaceId: ws.id });

      await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id)
        .send({ name: "No Workspace" });

      const filtered = await request(app)
        .get(`/api/v1/workflows?workspaceId=${ws.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-organization-id", orgA.id);

      expect(filtered.status).toBe(200);
      expect(filtered.body.data.length).toBe(1);
      expect(filtered.body.data[0].name).toBe("In Workspace");
    });
  });

  // ==========================================
  // 3. WORKSPACE MEMBERSHIP & ROLE ASSIGNMENTS
  // ==========================================
  describe("Workspace Membership Management", () => {
    it("3.1 should reject adding a non-organization user to a workspace", async () => {
      const ws = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Ops WS", slug: "ops-ws" })
      ).body.data;

      // strangerUser is only in Org B
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws.id}/members`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          userId: strangerUser.id,
          role: "EDITOR",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("NOT_ORGANIZATION_MEMBER");
    });

    it("3.2 should add, update, and remove workspace members", async () => {
      const ws = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/workspaces`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Dev WS", slug: "dev-ws" })
      ).body.data;

      // Add memberUser
      const addRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws.id}/members`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: memberUser.id, role: "VIEWER" });
      expect(addRes.status).toBe(200);
      expect(addRes.body.data.role).toBe("VIEWER");

      // Update role to EDITOR
      const updateRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces/${ws.id}/members`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: memberUser.id, role: "EDITOR" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.role).toBe("EDITOR");

      // Remove member
      const removeRes = await request(app)
        .delete(
          `/api/v1/organizations/${orgA.id}/workspaces/${ws.id}/members/${memberUser.id}`,
        )
        .set("Authorization", `Bearer ${adminToken}`);
      expect(removeRes.status).toBe(200);

      // Verify list has removed member
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/workspaces/${ws.id}/members`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(
        listRes.body.data.some((m: any) => m.userId === memberUser.id),
      ).toBe(false);
    });
  });

  // ==========================================
  // 4. WHITE-LABEL BRANDING SYSTEM
  // ==========================================
  describe("White-Label Branding System", () => {
    it("4.1 should return platform defaults when organization has no custom branding", async () => {
      const res = await request(app).get(
        `/api/v1/organizations/${orgA.id}/branding`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.productName).toBe("FlowForge");
      expect(res.body.data.primaryColor).toBe("#0d9488");
    });

    it("4.2 should reject branding updates when plan lacks white-label entitlement", async () => {
      // Free plan has hasWhiteLabel: false
      const res = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/branding`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productName: "Acme Automation Studio",
          primaryColor: "#4F46E5",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FEATURE_NOT_IN_PLAN");
    });

    it("4.3 should validate hex colors and sanitize malicious script tags", async () => {
      // Enable enterprise license with white label
      apiStore.subscriptions.set("sub_a", {
        id: "sub_a",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Invalid hex color
      const invalidColor = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/branding`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productName: "Acme Portal",
          primaryColor: "not-a-hex-color",
        });
      expect(invalidColor.status).toBe(400);
      expect(invalidColor.body.error.code).toBe("VALIDATION_FAILED");

      // XSS payload sanitized
      const xssRes = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/branding`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productName: "Acme Portal <script>alert('xss')</script>",
          primaryColor: "#2563EB",
          customFooterText: "Safe Footer <img src=x onerror=alert(1)>",
        });
      expect(xssRes.status).toBe(200);
      expect(xssRes.body.data.productName).not.toContain("<script>");
      expect(xssRes.body.data.customFooterText).not.toContain("<img");
    });

    it("4.4 should resolve branding by custom domain via public endpoint", async () => {
      // Configure verified custom domain
      apiStore.customDomains.set("cd_1", {
        id: "cd_1",
        organizationId: orgA.id,
        domain: "workflows.acme.com",
        verificationToken: "token_123",
        verificationStatus: "VERIFIED",
        sslStatus: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Configure branding
      apiStore.brandings.set(orgA.id, {
        id: "brd_1",
        organizationId: orgA.id,
        productName: "Acme Flow",
        primaryColor: "#7c3aed",
        secondaryColor: "#1e1b4b",
        accentColor: "#a855f7",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app).get(
        "/api/v1/branding/resolve?domain=workflows.acme.com",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.isCustomBranded).toBe(true);
      expect(res.body.data.branding.productName).toBe("Acme Flow");
      expect(res.body.data.branding.primaryColor).toBe("#7c3aed");
    });
  });

  // ==========================================
  // 5. CUSTOM DOMAINS MANAGEMENT & VERIFICATION
  // ==========================================
  describe("Custom Domain Management & Challenge Verification", () => {
    beforeEach(() => {
      // Provide enterprise plan with hasCustomDomains: true
      apiStore.subscriptions.set("sub_a", {
        id: "sub_a",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("5.1 should reject reserved platform apex domains", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/custom-domains`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ domain: "flowforge.dev" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("DOMAIN_RESERVED");
    });

    it("5.2 should register custom domain and generate DNS TXT verification instructions", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/custom-domains`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ domain: "automation.acme.com" });

      expect(res.status).toBe(201);
      expect(res.body.data.domain).toBe("automation.acme.com");
      expect(res.body.data.verificationStatus).toBe("PENDING");
      expect(res.body.data.sslStatus).toBe("PENDING");
      expect(res.body.instructions.txtRecord.host).toBe(
        "_flowforge-challenge.automation.acme.com",
      );
      expect(res.body.instructions.txtRecord.value).toMatch(
        /^flowforge-verify=/,
      );
    });

    it("5.3 should reject duplicate domain registration across different organizations", async () => {
      // Register in Org A
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/custom-domains`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ domain: "shared.company.com" });

      // Attempt registration in Org B
      apiStore.subscriptions.set("sub_b", {
        id: "sub_b",
        organizationId: orgB.id,
        planId: DEFAULT_PLANS.enterprise.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgB.id}/custom-domains`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({ domain: "shared.company.com" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DOMAIN_ALREADY_REGISTERED");
    });

    it("5.4 should verify DNS TXT challenge and automatically issue active SSL certificate", async () => {
      const regRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/custom-domains`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ domain: "app.acme-corp.com" });

      const domainId = regRes.body.data.id;

      // Perform verification challenge
      const verifyRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/custom-domains/${domainId}/verify`,
        )
        .set("Authorization", `Bearer ${adminToken}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.verificationStatus).toBe("VERIFIED");
      expect(verifyRes.body.data.sslStatus).toBe("ACTIVE");
      expect(verifyRes.body.data.verifiedAt).toBeDefined();
    });

    it("5.5 should handle verification failure and update status to FAILED", async () => {
      const regRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/custom-domains`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ domain: "failing.acme-corp.com" });

      const domainId = regRes.body.data.id;

      const verifyRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/custom-domains/${domainId}/verify`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ simulateFailure: true });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.data.verificationStatus).toBe("FAILED");
      expect(verifyRes.body.data.sslStatus).toBe("FAILED");
    });
  });

  // ==========================================
  // 6. ENTERPRISE LICENSING & ENTITLEMENT OVERRIDES
  // ==========================================
  describe("Enterprise Licensing & Entitlement Overrides", () => {
    it("6.1 should reject invalid license key format", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/license`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          licenseKey: "invalid-key",
          issuedTo: "Acme Corp",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LICENSE_KEY");
    });

    it("6.2 should apply valid enterprise license key and override plan entitlements", async () => {
      const licenseKey = `FF-ENT-${crypto.randomUUID().toUpperCase()}`;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/license`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          licenseKey,
          issuedTo: "Acme Corporation",
          edition: "Enterprise Platinum",
          customEntitlements: {
            maxWorkspaces: 25,
            maxSeats: 500,
            hasWhiteLabel: true,
            hasCustomDomains: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.license.licenseKey).toBe(licenseKey);
      expect(res.body.data.effectiveEntitlements.maxWorkspaces).toBe(25);
      expect(res.body.data.effectiveEntitlements.maxSeats).toBe(500);
      expect(res.body.data.effectiveEntitlements.hasWhiteLabel).toBe(true);

      // Verify that EntitlementService immediately honors the overrides
      const effectivePlan = entitlementService.getEffectivePlan(orgA.id);
      expect(effectivePlan.entitlements.maxWorkspaces).toBe(25);
      expect(effectivePlan.entitlements.maxSeats).toBe(500);
      expect(effectivePlan.entitlements.hasWhiteLabel).toBe(true);
      expect(effectivePlan.entitlements.hasCustomDomains).toBe(true);

      // Workspace creation now allows beyond default Free limit
      const wsRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Licensed WS 1", slug: "licensed-ws-1" });
      expect(wsRes.status).toBe(201);

      const wsRes2 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Licensed WS 2", slug: "licensed-ws-2" });
      expect(wsRes2.status).toBe(201);
    });

    it("6.3 should reject license key reuse across different organizations", async () => {
      const licenseKey = `FF-ENT-${crypto.randomUUID().toUpperCase()}`;

      // Apply in Org A
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/license`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          licenseKey,
          issuedTo: "Acme",
        });

      // Attempt to reuse in Org B
      const res = await request(app)
        .post(`/api/v1/organizations/${orgB.id}/license`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({
          licenseKey,
          issuedTo: "Beta",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("LICENSE_KEY_IN_USE");
    });
  });

  // ==========================================
  // 7. BRANDED EMAIL NOTIFICATIONS
  // ==========================================
  describe("White-Label Notification & Email Delivery", () => {
    it("7.1 should render custom branding in dispatched notification emails", async () => {
      // 1. Set custom branding for Org A
      apiStore.brandings.set(orgA.id, {
        id: "brd_test",
        organizationId: orgA.id,
        productName: "Acme Automate",
        primaryColor: "#059669",
        secondaryColor: "#064e3b",
        accentColor: "#10b981",
        emailSenderName: "Acme Bot",
        emailSenderAddress: "bot@acme.com",
        customFooterText: "Confidential - Acme Internal Use Only",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Spy on defaultEmailService.sendEmail
      let dispatchedMessage: any = null;
      const originalSendEmail = defaultEmailService.sendEmail;
      defaultEmailService.sendEmail = async (msg: any) => {
        dispatchedMessage = msg;
        return {
          messageId: "msg_1",
          delivered: true,
          timestamp: new Date().toISOString(),
          recipient: msg.to,
        };
      };

      try {
        const domainEvent = {
          id: `evt_${Date.now()}`,
          organizationId: orgA.id,
          type: "approval.requested",
          resourceType: "approval",
          resourceId: "app_123",
          data: {
            assignedUserId: memberUser.id,
            title: "Manager Signoff",
          },
          createdAt: new Date(),
        };

        apiStore.outboxEvents.set(domainEvent.id, {
          id: domainEvent.id,
          organizationId: orgA.id,
          eventType: domainEvent.type,
          payload: domainEvent,
          status: "PENDING",
          attemptCount: 0,
          createdAt: new Date(),
        });

        await dispatchOutboxEvent(apiStore as any, domainEvent.id);

        expect(dispatchedMessage).toBeDefined();
        expect(dispatchedMessage.to).toBe(memberUser.email);
        expect(dispatchedMessage.from).toBe("Acme Bot <bot@acme.com>");
        expect(dispatchedMessage.subject).toContain("[Acme Automate]");
        expect(dispatchedMessage.html).toContain("View in Acme Automate");
        expect(dispatchedMessage.html).toContain(
          "Confidential - Acme Internal Use Only",
        );
        expect(dispatchedMessage.html).toContain("#059669");
      } finally {
        defaultEmailService.sendEmail = originalSendEmail;
      }
    });
  });

  // ==========================================
  // 8. TENANT ISOLATION & NEGATIVE ACCESS TESTS
  // ==========================================
  describe("Tenant Isolation & Authorization RBAC", () => {
    it("8.1 should prevent users from accessing workspaces belonging to another organization", async () => {
      // Create workspace in Org B
      const wsB = (
        await request(app)
          .post(`/api/v1/organizations/${orgB.id}/workspaces`)
          .set("Authorization", `Bearer ${strangerToken}`)
          .send({ name: "Org B WS", slug: "org-b-ws" })
      ).body.data;

      // User from Org A attempts to read Org B workspace
      const res = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/workspaces/${wsB.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("8.2 should prevent VIEWER role from modifying workspaces or branding", async () => {
      // VIEWER tries to create workspace in Org A
      const wsRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/workspaces`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "Unauthorized WS", slug: "unauth-ws" });

      expect(wsRes.status).toBe(403);

      // VIEWER tries to update branding in Org A
      const brdRes = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/branding`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ productName: "Viewer Hijack" });

      expect(brdRes.status).toBe(403);
    });
  });
});
