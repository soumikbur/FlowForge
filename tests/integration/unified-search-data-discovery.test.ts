import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 32: Unified Search, Enterprise Data Discovery, and Operational Intelligence", () => {
  let orgA: any;
  let orgB: any;
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

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  const sampleDefinition: WorkflowDefinition = {
    schemaVersion: "1.0",
    id: "wf_search_demo",
    name: "Customer Invoice Generation",
    nodes: [
      {
        id: "trigger_1",
        name: "Invoice Webhook Trigger",
        type: "TRIGGER",
        config: {},
      },
      {
        id: "http_1",
        name: "Stripe Billing Charge",
        type: "HTTP_REQUEST",
        config: {
          url: "https://api.stripe.com/v1/invoices",
          method: "POST",
        },
      },
      {
        id: "end_1",
        name: "Invoice Completed",
        type: "END",
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "http_1" },
      { id: "e2", source: "http_1", target: "end_1" },
    ],
  };

  beforeEach(() => {
    resetRateLimits();
    apiStore.clear();

    // 1. Setup Tenant A
    orgA = {
      id: `org_alpha_${Date.now()}`,
      name: "Acme Enterprise Corp",
      slug: `acme-corp-${Date.now()}`,
      billingEmail: "admin@acme.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Setup Tenant B (for cross-tenant security verification)
    orgB = {
      id: `org_beta_${Date.now()}`,
      name: "Beta Competitor Inc",
      slug: `beta-inc-${Date.now()}`,
      billingEmail: "admin@beta.inc",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Setup Users
    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@beta.inc",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Memberships
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

    // 5. Auth Sessions
    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    memberTokenA = `tok_member_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

    const exp = new Date(Date.now() + 86400000);
    apiStore.sessions.set(ownerTokenA, {
      id: "s1",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(adminTokenA, {
      id: "s2",
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(memberTokenA, {
      id: "s3",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(viewerTokenA, {
      id: "s4",
      userId: viewerUserA.id,
      token: viewerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: "s5",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: exp,
      createdAt: new Date(),
    });

    // 6. Seed Sample Searchable Resources in Tenant A
    // Workflows & Versions
    const wf1 = {
      id: "wf_invoice_gen",
      organizationId: orgA.id,
      name: "Customer Invoice Generation",
      description:
        "Automated recurring customer billing and invoice generation pipeline.",
      status: "ACTIVE" as const,
      draftDefinition: sampleDefinition,
      publishedVersionId: "ver_invoice_1",
      createdById: ownerUserA.id,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 1800000),
    };
    apiStore.workflows.set(wf1.id, wf1);

    const ver1 = {
      id: "ver_invoice_1",
      workflowId: wf1.id,
      versionNumber: 1,
      definition: sampleDefinition,
      publishedAt: new Date(Date.now() - 3600000),
    };
    apiStore.versions.set(ver1.id, ver1);

    // Executions
    const exec1 = {
      id: "exec_inv_9988",
      organizationId: orgA.id,
      workflowId: wf1.id,
      workflowVersionId: ver1.id,
      triggerType: "SCHEDULE" as const,
      status: "SUCCEEDED" as const,
      contextData: {},
      createdAt: new Date(Date.now() - 1200000),
      updatedAt: new Date(Date.now() - 600000),
    };
    apiStore.executions.set(exec1.id, exec1);

    const exec2 = {
      id: "exec_inv_fail_77",
      organizationId: orgA.id,
      workflowId: wf1.id,
      workflowVersionId: ver1.id,
      triggerType: "MANUAL" as const,
      status: "FAILED" as const,
      errorDetails: { message: "Payment gateway timeout on Stripe endpoint" },
      contextData: {},
      createdAt: new Date(Date.now() - 600000),
      updatedAt: new Date(Date.now() - 300000),
    };
    apiStore.executions.set(exec2.id, exec2);

    // Connectors
    const conn1 = {
      id: "conn_stripe_prod",
      organizationId: orgA.id,
      name: "Production Stripe Gateway",
      connectorId: "stripe",
      authType: "BEARER_TOKEN",
      status: "ACTIVE" as const,
      encryptedData: "aes256:fake_cipher_bytes:secret_key_never_leak",
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(Date.now() - 7200000),
    };
    apiStore.connections.set(conn1.id, conn1);

    // Extensions
    const ext1 = {
      id: "ext_pdf_generator",
      organizationId: orgA.id,
      name: "Enterprise PDF Invoice Generator",
      description: "Generates branded PDF invoices and tax receipts.",
      publisherId: "pub_acme",
      publisherName: "Acme Utilities",
      publisherEmail: "tools@acme.corp",
      isVerifiedPublisher: true,
      isPublic: false,
      status: "PUBLISHED" as const,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    };
    apiStore.extensionPackages.set(ext1.id, ext1);

    // Templates
    const tpl1 = {
      id: "tpl_saas_billing",
      organizationId: orgA.id,
      name: "SaaS Subscription Billing Pipeline",
      shortDescription: "Complete automated billing with card retry logic.",
      description:
        "Full end-to-end template for recurring subscription management.",
      category: "Finance",
      tags: ["billing", "stripe", "invoice"],
      visibility: "ORGANIZATION" as const,
      status: "PUBLISHED" as const,
      draftDefinition: sampleDefinition,
      requiredConnections: ["stripe"],
      requiredInputs: {},
      usageCount: 15,
      isFeatured: true,
      isVerified: true,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    };
    apiStore.templates.set(tpl1.id, tpl1);

    // Approvals
    const appr1 = {
      id: "appr_refund_500",
      organizationId: orgA.id,
      executionId: exec1.id,
      stepId: "step_approval_1",
      title: "Approve High-Value Invoice Refund ($500+)",
      description: "Customer requested full refund on annual subscription.",
      requiredRole: "ADMIN" as const,
      status: "PENDING" as const,
      createdAt: new Date(Date.now() - 900000),
    };
    apiStore.approvals.set(appr1.id, appr1);

    // Events
    const evt1 = {
      id: "evt_payment_captured_101",
      type: "payment.captured",
      specVersion: "1.0",
      organizationId: orgA.id,
      source: "stripe.webhook",
      time: new Date(Date.now() - 1000000),
      ingestedAt: new Date(Date.now() - 1000000),
      correlationId: "corr_stripe_9876",
      status: "PROCESSED" as const,
    };
    apiStore.streamEvents.set(evt1.id, evt1);

    // Audit Log
    apiStore.recordAudit({
      id: "audit_sec_rotate",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      action: "security.key_rotated",
      resourceType: "credential",
      resourceId: conn1.id,
      outcome: "SUCCESS",
      createdAt: new Date(Date.now() - 500000),
    });

    // Seed Resource in Tenant B (for cross-tenant isolation testing)
    const wfB = {
      id: "wf_secret_beta_plans",
      organizationId: orgB.id,
      name: "Top Secret Beta Weapon Project",
      description: "Proprietary roadmap and stealth product design.",
      status: "ACTIVE" as const,
      draftDefinition: sampleDefinition,
      createdById: ownerUserB.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.workflows.set(wfB.id, wfB);
  });

  describe("1. Unified Search across multiple resource types", () => {
    it("searches across workflows, executions, connectors, extensions, templates, approvals, events, and audit logs", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/search?query=Invoice`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(4);

      const typesFound = new Set(
        res.body.data.results.map((r: any) => r.resourceType),
      );
      expect(typesFound.has("workflow")).toBe(true);
      expect(typesFound.has("execution")).toBe(true);
      expect(typesFound.has("extension")).toBe(true);
      expect(typesFound.has("approval")).toBe(true);
    });

    it("returns correct navigation URLs for canonical resource pages", async () => {
      const res = await request(app)
        .get(`/api/v1/search?query=Invoice`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      const results = res.body.data.results;

      const wf = results.find((r: any) => r.resourceType === "workflow");
      expect(wf?.navigationUrl).toBe(`/workflows/${wf.id}`);

      const exec = results.find((r: any) => r.resourceType === "execution");
      expect(exec?.navigationUrl).toBe(`/executions/${exec.id}`);

      const appr = results.find((r: any) => r.resourceType === "approval");
      expect(appr?.navigationUrl).toBe(`/approvals`);
    });
  });

  describe("2. Relevance scoring, ranking & exact match prioritization", () => {
    it("prioritizes exact ID matches above substring and description matches", async () => {
      const res = await request(app)
        .get(`/api/v1/search?query=exec_inv_9988`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      const results = res.body.data.results;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("exec_inv_9988");
      expect(results[0].score).toBe(100); // Exact ID score
      expect(results[0].matchedFields).toContain("id");
    });

    it("ranks title matches above description matches", async () => {
      const res = await request(app)
        .get(`/api/v1/search?query=Customer Invoice Generation`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      const results = res.body.data.results;
      expect(results[0].title).toBe("Customer Invoice Generation");
      expect(results[0].score).toBeGreaterThanOrEqual(80);
    });
  });

  describe("3. Filtering, Faceting and Bounded Pagination", () => {
    it("filters results strictly by resource type", async () => {
      const res = await request(app)
        .get(`/api/v1/search?types=connector,template`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      for (const item of res.body.data.results) {
        expect(["connector", "template"]).toContain(item.resourceType);
      }
    });

    it("filters results by status", async () => {
      const res = await request(app)
        .get(`/api/v1/search?status=FAILED`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      for (const item of res.body.data.results) {
        expect(item.status).toBe("FAILED");
      }
    });

    it("aggregates facets by type and by status", async () => {
      const res = await request(app)
        .get(`/api/v1/search?query=`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.facets.byType).toBeDefined();
      expect(res.body.data.facets.byType.workflow).toBeGreaterThanOrEqual(1);
      expect(res.body.data.facets.byType.execution).toBeGreaterThanOrEqual(2);
      expect(res.body.data.facets.byStatus).toBeDefined();
    });

    it("applies bounded pagination with page and pageSize", async () => {
      const res = await request(app)
        .get(`/api/v1/search?pageSize=2&page=1`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeLessThanOrEqual(2);
      expect(res.body.data.pageSize).toBe(2);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.totalPages).toBeGreaterThanOrEqual(1);
    });
  });

  describe("4. Security, Tenant Isolation and Sensitive Data Protection", () => {
    it("strictly isolates tenants: Tenant A cannot search or discover Tenant B resources", async () => {
      const res = await request(app)
        .get(`/api/v1/search?query=Top Secret Beta Weapon`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.results.length).toBe(0);
    });

    it("enforces RBAC: VIEWER/MEMBER without audit:read cannot view audit logs", async () => {
      // Member search
      const memberRes = await request(app)
        .get(`/api/v1/search?types=audit_log`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(memberRes.status).toBe(200);
      expect(memberRes.body.data.results.length).toBe(0);

      // Admin search with audit:read succeeds
      const adminRes = await request(app)
        .get(`/api/v1/search?types=audit_log`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.results.length).toBeGreaterThanOrEqual(1);
      expect(adminRes.body.data.results[0].resourceType).toBe("audit_log");
    });

    it("never exposes encrypted credentials, signing secrets or auth headers in snippets", async () => {
      const res = await request(app)
        .get(`/api/v1/search?types=connector`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(res.status).toBe(200);
      const strResponse = JSON.stringify(res.body);
      expect(strResponse).not.toContain("fake_cipher_bytes");
      expect(strResponse).not.toContain("secret_key_never_leak");
    });

    it("safely handles SQL and RegEx metacharacters without errors or injection", async () => {
      const pathologicalQueries = [
        "'; DROP TABLE workflows; --",
        '" OR 1=1 --',
        "([a-z]+)*",
        ".*?+$",
        "<script>alert('xss')</script>",
      ];

      for (const pq of pathologicalQueries) {
        const res = await request(app)
          .get(`/api/v1/search?query=${encodeURIComponent(pq)}`)
          .set("Authorization", `Bearer ${adminTokenA}`)
          .set("x-organization-id", orgA.id);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe("5. Saved Searches and Personalization", () => {
    it("creates, lists, and deletes user and shared saved searches", async () => {
      // 1. Create personal saved search
      const createRes = await request(app)
        .post(`/api/v1/search/saved`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id)
        .send({
          name: "Failed Payments Queue",
          description: "Tracks all failed executions for finance remediation",
          query: "Payment",
          types: ["execution"],
          filters: { status: "FAILED" },
          isShared: true,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.name).toBe("Failed Payments Queue");
      expect(createRes.body.data.isShared).toBe(true);

      const savedId = createRes.body.data.id;

      // 2. Member can list shared saved searches
      const listRes = await request(app)
        .get(`/api/v1/search/saved`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((s: any) => s.id === savedId)).toBe(true);

      // 3. Delete saved search
      const delRes = await request(app)
        .delete(`/api/v1/search/saved/${savedId}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);
    });
  });

  describe("6. Search Observability and Metrics", () => {
    it("records search metrics and surfaces latency percentiles and query counts", async () => {
      // Execute searches
      await request(app)
        .get(`/api/v1/search?query=Stripe`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      const metricsRes = await request(app)
        .get(`/api/v1/search/metrics`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.data.totalSearches).toBeGreaterThanOrEqual(1);
      expect(typeof metricsRes.body.data.avgDurationMs).toBe("number");
      expect(metricsRes.body.data.searchesByType).toBeDefined();
    });
  });
});
