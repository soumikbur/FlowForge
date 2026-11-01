import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { WorkflowDefinition } from "@flowforge/shared";
import {
  sanitizeWorkflowForTemplate,
  instantiateGraphFromTemplate,
  computeWorkflowContentHash,
} from "@flowforge/workflow-engine";

describe("Prompt 13: Enterprise Workflow Templates, Reusable Components, and Template Marketplace", () => {
  // Tenant A: Global Operations
  const ownerEmailA = `ops_owner_${Date.now()}@flowforge.dev`;
  const viewerEmailA = `ops_viewer_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let viewerCookieA: string;
  let orgIdA: string;
  let ownerIdA: string;
  let viewerIdA: string;
  let connIdA: string;

  // Tenant B: FinTech Services
  const ownerEmailB = `fin_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;
  let ownerIdB: string;
  let connIdB: string;

  // Sample workflow in Tenant A
  let sourceWorkflowIdA: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Ops",
      lastName: "Owner",
      organizationName: "Global Operations",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup Tenant A Viewer
    viewerIdA = `usr_viewer_${Date.now()}`;
    apiStore.users.set(viewerIdA, {
      id: viewerIdA,
      email: viewerEmailA,
      passwordHash: "mock_hash",
      firstName: "OpsViewer",
    });
    apiStore.memberships.set(`mem_${viewerIdA}_${orgIdA}`, {
      id: `mem_${viewerIdA}_${orgIdA}`,
      organizationId: orgIdA,
      userId: viewerIdA,
      role: "VIEWER",
    });
    const viewerSessionToken = `sess_viewer_${Date.now()}`;
    apiStore.sessions.set(viewerSessionToken, {
      id: viewerSessionToken,
      userId: viewerIdA,
      token: viewerSessionToken,
      expiresAt: new Date(Date.now() + 3600000),
    });
    viewerCookieA = `flowforge_session=${viewerSessionToken}`;

    // 3. Register Tenant B
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Fin",
      lastName: "Owner",
      organizationName: "FinTech Services",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerIdB = resB.body.data.user.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 4. Create connections in Tenant A and Tenant B
    connIdA = `conn_a_${Date.now()}`;
    apiStore.connections.set(connIdA, {
      id: connIdA,
      organizationId: orgIdA,
      connectorId: "slack-webhook",
      name: "Tenant A Slack Alerting",
      status: "ACTIVE",
      authType: "API_KEY",
      encryptedData: "mock_encrypted_a",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    connIdB = `conn_b_${Date.now()}`;
    apiStore.connections.set(connIdB, {
      id: connIdB,
      organizationId: orgIdB,
      connectorId: "slack-webhook",
      name: "Tenant B Slack Alerting",
      status: "ACTIVE",
      authType: "API_KEY",
      encryptedData: "mock_encrypted_b",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Create an initial workflow in Tenant A with sensitive tokens and connection IDs
    const sourceDefinition: WorkflowDefinition = {
      nodes: [
        {
          id: "node_trig_1",
          type: "TRIGGER",
          name: "Webhook Trigger",
          config: {
            triggerType: "WEBHOOK",
            webhookPath: "/tenant-a/events",
            enabled: true,
            active: true,
          },
        },
        {
          id: "node_slack_1",
          type: "CONNECTOR_ACTION",
          name: "Slack Incident Notification",
          config: {
            connectorId: "slack-webhook",
            operationId: "sendMessage",
            connectionId: connIdA, // Tenant A's connection
            parameters: { channel: "#incidents", text: "Alert" },
            apiKey: "sk-super-secret-slack-token-12345", // Sensitive secret
            webhookUrl: "https://hooks.slack.com/services/T00/B00/SECRET123", // Sensitive webhook
            executionId: "exec_old_runtime_123", // Runtime state
            lastOutput: { ok: true },
          },
        },
        {
          id: "node_email_1",
          type: "EMAIL",
          name: "Escalation Email",
          config: {
            to: "security@tenant-a.com",
            subject: "Incident Escalation",
            template: "Incident {{incidentId}} has been escalated to security.",
            smtpPassword: "SmtpSuperSecretPassword99!", // Sensitive password
          },
        },
        {
          id: "node_end_1",
          type: "END",
          name: "Completed",
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "node_trig_1", target: "node_slack_1" },
        { id: "e2", source: "node_slack_1", target: "node_email_1" },
        { id: "e3", source: "node_email_1", target: "node_end_1" },
      ],
    };

    sourceWorkflowIdA = `wf_src_${Date.now()}`;
    apiStore.workflows.set(sourceWorkflowIdA, {
      id: sourceWorkflowIdA,
      organizationId: orgIdA,
      name: "Production Incident Pipeline",
      description: "Handles P1 incidents",
      status: "ACTIVE",
      draftDefinition: sourceDefinition,
      draftRevision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: ownerIdA,
    });
  });

  describe("1. Template Creation, Graph Sanitization & Credential Stripping", () => {
    let createdTemplateId: string;

    it("creates a template from an existing workflow and deeply redacts credentials and runtime state", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Incident Escalation Template",
          shortDescription: "Standard P1 triage pipeline with Slack and Email",
          category: "DevOps",
          tags: ["incident", "devops", "slack"],
          visibility: "ORGANIZATION",
          workflowId: sourceWorkflowIdA,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const template = res.body.data;
      createdTemplateId = template.id;

      expect(template.id).toMatch(/^tmpl_/);
      expect(template.organizationId).toBe(orgIdA);
      expect(template.name).toBe("Incident Escalation Template");
      expect(template.status).toBe("DRAFT");
      expect(template.usageCount).toBe(0);
      expect(template.requiredConnections).toEqual(
        expect.arrayContaining(["slack-webhook", "smtp-email"]),
      );

      // Verify graph sanitization
      const def = template.draftDefinition;
      expect(def.nodes).toHaveLength(4);

      // 1. Secrets must be wiped or scrubbed to [REDACTED]
      const slackNode = def.nodes.find((n: any) => n.id === "node_slack_1");
      expect(slackNode).toBeDefined();
      expect(slackNode.config.apiKey).toBe("[REDACTED]");
      expect(slackNode.config.webhookUrl).toBe("[REDACTED]");

      // 2. Organization connectionId must be stripped so no cross-tenant leakage occurs
      expect(slackNode.config.connectionId).toBe("");

      // 3. Runtime artifacts must be stripped
      expect(slackNode.config.executionId).toBeUndefined();
      expect(slackNode.config.lastOutput).toBeUndefined();

      // 4. Email node secrets scrubbed
      const emailNode = def.nodes.find((n: any) => n.id === "node_email_1");
      expect(emailNode.config.smtpPassword).toBe("[REDACTED]");

      // 5. Trigger deactivated so instantiated workflows never auto-trigger
      const triggerNode = def.nodes.find((n: any) => n.id === "node_trig_1");
      expect(triggerNode.config.enabled).toBe(false);
      expect(triggerNode.config.active).toBe(false);

      // 6. Audit log recorded
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "template:create" && a.resourceId === createdTemplateId,
      );
      expect(audit).toBeDefined();
      expect(audit?.organizationId).toBe(orgIdA);
    });

    it("creates a template directly from definition with validation", async () => {
      const customDef: WorkflowDefinition = {
        nodes: [
          {
            id: "n_trig",
            type: "TRIGGER",
            name: "Manual Start",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "n_end",
            type: "END",
            name: "Done",
            config: {},
          },
        ],
        edges: [{ id: "e1", source: "n_trig", target: "n_end" }],
      };

      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Minimal Task Template",
          shortDescription: "A simple starter template",
          category: "General",
          tags: ["starter"],
          visibility: "PRIVATE",
          definition: customDef,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.visibility).toBe("PRIVATE");
      expect(res.body.data.status).toBe("DRAFT");
    });

    it("rejects template creation when neither workflowId nor definition is provided", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Incomplete Template",
          shortDescription: "Missing definition",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("2. Immutable Version Publishing, Content Hashing, and Comparison", () => {
    let templateId: string;
    let version1Id: string;
    let version2Id: string;

    beforeAll(async () => {
      // Create a test template
      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Versioning Test Template",
          shortDescription: "Testing version immutability and hashes",
          category: "DevOps",
          visibility: "ORGANIZATION",
          workflowId: sourceWorkflowIdA,
        });
      templateId = res.body.data.id;
    });

    it("publishes version 1 with deterministic SHA-256 content hash and updates status", async () => {
      const res = await request(app)
        .post(`/api/v1/templates/${templateId}/publish`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          releaseNotes: "Initial stable release v1.0.0",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const ver = res.body.data;
      version1Id = ver.id;

      expect(ver.versionNumber).toBe(1);
      expect(ver.releaseNotes).toBe("Initial stable release v1.0.0");
      expect(ver.contentHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string

      // Verify template state updated to PUBLISHED
      const tmpl = apiStore.templates.get(templateId);
      expect(tmpl?.status).toBe("PUBLISHED");
      expect(tmpl?.publishedVersionId).toBe(version1Id);

      // Verify audit logged
      const audit = apiStore.auditLogs.find(
        (a) => a.action === "template:publish" && a.resourceId === templateId,
      );
      expect(audit).toBeDefined();
    });

    it("publishes version 2 with monotonic version increment and updated content hash", async () => {
      // Modify draft definition by adding a node
      const currentTmpl = apiStore.templates.get(templateId)!;
      const updatedDef = JSON.parse(
        JSON.stringify(currentTmpl.draftDefinition),
      );
      updatedDef.nodes.push({
        id: "node_approval_v2",
        type: "APPROVAL",
        name: "Security Review",
        config: { requiredRole: "ADMIN", timeoutSeconds: 3600 },
      });
      currentTmpl.draftDefinition = updatedDef;
      apiStore.templates.set(templateId, currentTmpl);

      const res = await request(app)
        .post(`/api/v1/templates/${templateId}/publish`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          releaseNotes: "Added mandatory security review approval step",
        });

      expect(res.status).toBe(201);
      const ver2 = res.body.data;
      version2Id = ver2.id;

      expect(ver2.versionNumber).toBe(2);
      expect(ver2.releaseNotes).toBe(
        "Added mandatory security review approval step",
      );
      expect(ver2.contentHash).not.toBe(
        apiStore.templateVersions.get(version1Id)?.contentHash,
      );

      const tmpl = apiStore.templates.get(templateId);
      expect(tmpl?.publishedVersionId).toBe(version2Id);
    });

    it("lists all published template versions in descending order", async () => {
      const res = await request(app)
        .get(`/api/v1/templates/${templateId}/versions`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].versionNumber).toBe(2);
      expect(res.body.data[1].versionNumber).toBe(1);
    });

    it("compares two template versions and returns structured diff", async () => {
      const res = await request(app)
        .get(`/api/v1/templates/${templateId}/compare`)
        .query({ sourceVersionId: version1Id, targetVersionId: version2Id })
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const diff = res.body.data;

      expect(diff.isIdentical).toBe(false);
      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].id).toBe("node_approval_v2");
    });
  });

  describe("3. Workflow Instantiation into Draft Workflow with Provenance", () => {
    let publishedTemplateId: string;

    beforeAll(async () => {
      // Create and publish a template
      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Deploy Pipeline Template",
          shortDescription: "Deploy pipeline with notifications",
          category: "DevOps",
          visibility: "ORGANIZATION",
          workflowId: sourceWorkflowIdA,
        });
      publishedTemplateId = res.body.data.id;

      await request(app)
        .post(`/api/v1/templates/${publishedTemplateId}/publish`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({ releaseNotes: "Initial deploy template" });
    });

    it("instantiates a new workflow, regenerating all node and edge IDs without collision", async () => {
      const initialUsage =
        apiStore.templates.get(publishedTemplateId)!.usageCount;

      const res = await request(app)
        .post(`/api/v1/templates/${publishedTemplateId}/instantiate`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Project Pegasus Deploy Workflow",
          description: "Instantiated for Project Pegasus production rollout",
          connectionMappings: {
            "slack-webhook": connIdA,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const wf = res.body.data;

      // 1. Workflow record attributes
      expect(wf.id).toMatch(/^wf_/);
      expect(wf.organizationId).toBe(orgIdA);
      expect(wf.name).toBe("Project Pegasus Deploy Workflow");
      expect(wf.status).toBe("DRAFT"); // Must remain unpublished initially
      expect(wf.publishedVersionId).toBeUndefined(); // Never published automatically

      // 2. Provenance tracking
      expect(wf.sourceTemplateId).toBe(publishedTemplateId);
      expect(wf.sourceTemplateVersionId).toBeDefined();

      // 3. Node ID regeneration & connectivity verification
      const instantiatedNodes = wf.draftDefinition.nodes;
      const instantiatedEdges = wf.draftDefinition.edges;

      expect(instantiatedNodes).toHaveLength(4);
      // Original node IDs (node_trig_1, node_slack_1, etc.) must not exist
      const nodeIds = instantiatedNodes.map((n: any) => n.id);
      expect(nodeIds).not.toContain("node_trig_1");
      expect(nodeIds).not.toContain("node_slack_1");
      expect(nodeIds).not.toContain("node_email_1");
      expect(nodeIds).not.toContain("node_end_1");

      // Verify edges point to the newly regenerated node IDs
      for (const edge of instantiatedEdges) {
        expect(nodeIds).toContain(edge.source);
        expect(nodeIds).toContain(edge.target);
      }

      // 4. Connection mapping injected into node config
      const slackNode = instantiatedNodes.find(
        (n: any) => n.type === "CONNECTOR_ACTION",
      );
      expect(slackNode.config.connectionId).toBe(connIdA);

      // 5. Triggers remain inactive
      const triggerNode = instantiatedNodes.find(
        (n: any) => n.type === "TRIGGER",
      );
      expect(triggerNode.config.enabled).toBe(false);
      expect(triggerNode.config.active).toBe(false);

      // 6. Template usage counter incremented
      const updatedTmpl = apiStore.templates.get(publishedTemplateId);
      expect(updatedTmpl?.usageCount).toBe(initialUsage + 1);

      // 7. Audit logged
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "workflow:instantiate_from_template" &&
          a.resourceId === wf.id,
      );
      expect(audit).toBeDefined();
      expect(audit?.organizationId).toBe(orgIdA);
    });
  });

  describe("4. Multi-Tenant Isolation & Server-Side RBAC Enforcement", () => {
    let orgTemplateIdA: string;
    let privateTemplateIdA: string;
    let platformTemplateId: string;

    beforeAll(async () => {
      // 1. Tenant A Organization Template
      const resOrgA = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Tenant A Internal Procedures",
          shortDescription: "Org-internal procedures",
          category: "Operations",
          visibility: "ORGANIZATION",
          workflowId: sourceWorkflowIdA,
        });
      orgTemplateIdA = resOrgA.body.data.id;
      await request(app)
        .post(`/api/v1/templates/${orgTemplateIdA}/publish`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({ releaseNotes: "v1" });

      // 2. Tenant A Private Template
      const resPrivA = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Owner A Private Draft Experiment",
          shortDescription: "Owner personal experiment",
          category: "Operations",
          visibility: "PRIVATE",
          workflowId: sourceWorkflowIdA,
        });
      privateTemplateIdA = resPrivA.body.data.id;

      // 3. Platform Template
      const platformDef: WorkflowDefinition = {
        nodes: [
          {
            id: "p_trig",
            type: "TRIGGER",
            name: "Start",
            config: { triggerType: "MANUAL" },
          },
          { id: "p_end", type: "END", name: "Finish", config: {} },
        ],
        edges: [{ id: "pe1", source: "p_trig", target: "p_end" }],
      };
      const resPlat = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .send({
          name: "Verified Platform Boilerplate",
          shortDescription: "Available to all tenants",
          category: "General",
          visibility: "PLATFORM",
          definition: platformDef,
        });
      platformTemplateId = resPlat.body.data.id;
      await request(app)
        .post(`/api/v1/templates/${platformTemplateId}/publish`)
        .set("Cookie", ownerCookieA)
        .send({ releaseNotes: "Platform release" });
    });

    it("prevents Tenant B from retrieving Tenant A's organization template (404/restricted)", async () => {
      const res = await request(app)
        .get(`/api/v1/templates/${orgTemplateIdA}`)
        .set("Cookie", ownerCookieB)
        .set("x-organization-id", orgIdB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("prevents Tenant B from retrieving Tenant A's private template (404/restricted)", async () => {
      const res = await request(app)
        .get(`/api/v1/templates/${privateTemplateIdA}`)
        .set("Cookie", ownerCookieB)
        .set("x-organization-id", orgIdB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("filters out Tenant A's private & org templates from Tenant B's catalog discovery query", async () => {
      const res = await request(app)
        .get("/api/v1/templates")
        .set("Cookie", ownerCookieB)
        .set("x-organization-id", orgIdB);

      expect(res.status).toBe(200);
      const returnedIds = res.body.data.map((t: any) => t.id);

      expect(returnedIds).not.toContain(orgTemplateIdA);
      expect(returnedIds).not.toContain(privateTemplateIdA);
      // Platform template must be discoverable by Tenant B
      expect(returnedIds).toContain(platformTemplateId);
    });

    it("rejects Tenant B attempting to instantiate Tenant A's organization template", async () => {
      const res = await request(app)
        .post(`/api/v1/templates/${orgTemplateIdA}/instantiate`)
        .set("Cookie", ownerCookieB)
        .set("x-organization-id", orgIdB)
        .send({ name: "Malicious Instantiation Attempt" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("rejects cross-tenant connection ID binding during workflow instantiation (403)", async () => {
      // Tenant A attempts to bind Tenant B's connection ID (connIdB)
      const res = await request(app)
        .post(`/api/v1/templates/${platformTemplateId}/instantiate`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Cross Tenant Connection Hijack Attempt",
          connectionMappings: {
            "slack-webhook": connIdB, // Belongs to Tenant B!
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CROSS_TENANT_CONNECTION_FORBIDDEN");
    });

    it("allows Tenant B to instantiate platform templates with Tenant B's own connection", async () => {
      const res = await request(app)
        .post(`/api/v1/templates/${platformTemplateId}/instantiate`)
        .set("Cookie", ownerCookieB)
        .set("x-organization-id", orgIdB)
        .send({
          name: "Tenant B Platform Workflow",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBe(orgIdB);
    });

    it("denies VIEWER role from publishing or updating templates (403 Forbidden)", async () => {
      const resPublish = await request(app)
        .post(`/api/v1/templates/${orgTemplateIdA}/publish`)
        .set("Cookie", viewerCookieA)
        .set("x-organization-id", orgIdA)
        .send({ releaseNotes: "Unauthorized publish" });

      expect(resPublish.status).toBe(403);

      const resPatch = await request(app)
        .patch(`/api/v1/templates/${orgTemplateIdA}`)
        .set("Cookie", viewerCookieA)
        .set("x-organization-id", orgIdA)
        .send({ name: "Unauthorized Update" });

      expect(resPatch.status).toBe(403);
    });
  });

  describe("5. Template Lifecycle, Search Filtering & Archival", () => {
    let lifecycleTemplateId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Lifecycle Security Scanner",
          shortDescription: "Automated vulnerability scanner for dependencies",
          category: "Security",
          tags: ["vulnerability", "scanner", "cve"],
          visibility: "ORGANIZATION",
          workflowId: sourceWorkflowIdA,
        });
      lifecycleTemplateId = res.body.data.id;
    });

    it("updates template metadata successfully", async () => {
      const res = await request(app)
        .patch(`/api/v1/templates/${lifecycleTemplateId}`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA)
        .send({
          name: "Automated Enterprise Vulnerability Scanner",
          category: "Security",
          tags: ["cve", "security", "automated"],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(
        "Automated Enterprise Vulnerability Scanner",
      );
      expect(res.body.data.tags).toContain("automated");

      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "template:update" &&
          a.resourceId === lifecycleTemplateId,
      );
      expect(audit).toBeDefined();
    });

    it("filters templates by category and search keyword", async () => {
      const resCategory = await request(app)
        .get("/api/v1/templates")
        .query({ category: "Security", status: "DRAFT" })
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(resCategory.status).toBe(200);
      const items = resCategory.body.data;
      expect(items.some((i: any) => i.id === lifecycleTemplateId)).toBe(true);

      const resSearch = await request(app)
        .get("/api/v1/templates")
        .query({ search: "Vulnerability", status: "DRAFT" })
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(resSearch.status).toBe(200);
      expect(
        resSearch.body.data.some((i: any) => i.id === lifecycleTemplateId),
      ).toBe(true);
    });

    it("archives a template and omits it from default catalog listings", async () => {
      const resArchive = await request(app)
        .delete(`/api/v1/templates/${lifecycleTemplateId}`)
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(resArchive.status).toBe(200);
      expect(resArchive.body.success).toBe(true);

      const tmpl = apiStore.templates.get(lifecycleTemplateId);
      expect(tmpl?.status).toBe("ARCHIVED");

      // Verify it is excluded from default catalog list
      const resList = await request(app)
        .get("/api/v1/templates")
        .set("Cookie", ownerCookieA)
        .set("x-organization-id", orgIdA);

      expect(resList.status).toBe(200);
      const ids = resList.body.data.map((t: any) => t.id);
      expect(ids).not.toContain(lifecycleTemplateId);

      // Verify audit recorded
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "template:archive" &&
          a.resourceId === lifecycleTemplateId,
      );
      expect(audit).toBeDefined();
    });
  });
});
