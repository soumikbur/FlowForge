import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { WorkflowDefinition } from "@flowforge/shared";
import {
  computePackageIntegrityHash,
  verifyPackageIntegrity,
  extractWorkflowDependencies,
  createWorkflowExportPackage,
  createOrganizationBackupPackage,
  analyzeWorkflowPackageCompatibility,
  applyImportConnectorMappings,
} from "@flowforge/workflow-engine";

describe("Prompt 16: Workflow Import, Export, Portability, and Backup/Restore", () => {
  // Tenant A: Source Org (Acme Corp)
  const ownerEmailA = `acme_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let orgIdA: string;
  let ownerIdA: string;
  let connIdA: string;

  // Tenant B: Destination Org (Globex Inc)
  const ownerEmailB = `globex_owner_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;
  let ownerIdB: string;
  let connIdB: string;

  // Tenant B Viewer (unauthorized for export/import)
  const viewerEmailB = `globex_viewer_${Date.now()}@flowforge.dev`;
  let viewerCookieB: string;
  let viewerIdB: string;

  // Workflows
  let sourceWorkflowIdA: string;
  let publishedWorkflowIdA: string;

  const sampleDefinition: WorkflowDefinition = {
    nodes: [
      {
        id: "trigger_1",
        type: "TRIGGER",
        name: "Incoming Order Webhook",
        position: { x: 100, y: 100 },
        config: {
          triggerType: "WEBHOOK",
          webhookPath: "/orders/incoming",
          secretToken: "super_secret_webhook_token_12345", // to be scrubbed
          enabled: true,
        },
      },
      {
        id: "node_slack",
        type: "CONNECTOR_ACTION",
        name: "Notify Slack Channel",
        position: { x: 300, y: 100 },
        config: {
          connectorId: "slack-webhook",
          operationId: "post_message",
          connectionId: "PLACEHOLDER_CONN_A",
          apiKey: "xoxb-secret-bot-token-9999", // to be scrubbed
          channel: "#orders",
          message: "New order received: {{trigger_1.orderId}}",
        },
      },
      {
        id: "node_http",
        type: "HTTP_REQUEST",
        name: "Call Inventory API",
        position: { x: 500, y: 100 },
        config: {
          url: "https://api.acme.internal/inventory/check",
          method: "POST",
          headers: {
            Authorization: "Bearer internal_secret_token_abcde", // to be scrubbed
            "Content-Type": "application/json",
          },
        },
      },
      {
        id: "node_end",
        type: "END",
        name: "Order Processing Complete",
        position: { x: 700, y: 100 },
        config: {},
      },
    ],
    edges: [
      { id: "e1-2", source: "trigger_1", target: "node_slack" },
      { id: "e2-3", source: "node_slack", target: "node_http" },
      { id: "e3-4", source: "node_http", target: "node_end" },
    ],
  };

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Acme",
      lastName: "Owner",
      organizationName: "Acme Corp",
    });
    expect(resA.status).toBe(201);
    orgIdA = resA.body.data.organization.id;
    ownerIdA = resA.body.data.user.id;
    ownerCookieA = resA.headers["set-cookie"][0];

    // 2. Setup connection for Tenant A
    connIdA = `conn_a_${Date.now()}`;
    apiStore.connections.set(connIdA, {
      id: connIdA,
      organizationId: orgIdA,
      connectorId: "slack-webhook",
      name: "Acme Slack Connection",
      status: "ACTIVE",
      authType: "OAUTH2",
      encryptedData: "mock_encrypted_acme_secret",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Register Tenant B
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Globex",
      lastName: "Owner",
      organizationName: "Globex Inc",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerIdB = resB.body.data.user.id;
    ownerCookieB = resB.headers["set-cookie"][0];

    // 4. Setup connection for Tenant B
    connIdB = `conn_b_${Date.now()}`;
    apiStore.connections.set(connIdB, {
      id: connIdB,
      organizationId: orgIdB,
      connectorId: "slack-webhook",
      name: "Globex Slack Alerts",
      status: "ACTIVE",
      authType: "OAUTH2",
      encryptedData: "mock_encrypted_globex_secret",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Setup Viewer in Tenant B
    viewerIdB = `usr_viewer_${Date.now()}`;
    apiStore.users.set(viewerIdB, {
      id: viewerIdB,
      email: viewerEmailB,
      passwordHash: "mock_hash",
      firstName: "GlobexViewer",
    });
    apiStore.memberships.set(`mem_${viewerIdB}_${orgIdB}`, {
      id: `mem_${viewerIdB}_${orgIdB}`,
      organizationId: orgIdB,
      userId: viewerIdB,
      role: "VIEWER",
    });
    const viewerToken = `sess_viewer_${Date.now()}`;
    apiStore.sessions.set(viewerToken, {
      id: viewerToken,
      userId: viewerIdB,
      token: viewerToken,
      expiresAt: new Date(Date.now() + 3600000),
    });
    viewerCookieB = `flowforge_session=${viewerToken}`;

    // 6. Create test workflows in Tenant A
    const defWithConn = JSON.parse(JSON.stringify(sampleDefinition));
    defWithConn.nodes[1].config.connectionId = connIdA;

    const wfRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", ownerCookieA)
      .send({
        name: "Order Processing Pipeline",
        description: "Standard order intake and fulfillment flow",
      });
    expect(wfRes.status).toBe(201);
    sourceWorkflowIdA = wfRes.body.data.id;

    // Set full valid draft definition
    const srcWf = apiStore.workflows.get(sourceWorkflowIdA)!;
    srcWf.draftDefinition = defWithConn;
    apiStore.workflows.set(sourceWorkflowIdA, srcWf);

    // Create a published workflow in Tenant A
    const pubRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", ownerCookieA)
      .send({
        name: "Published Invoice Flow",
        description: "Production invoice generation",
      });
    publishedWorkflowIdA = pubRes.body.data.id;
    const pubWf = apiStore.workflows.get(publishedWorkflowIdA)!;
    pubWf.draftDefinition = defWithConn;
    apiStore.workflows.set(publishedWorkflowIdA, pubWf);

    // Publish it
    const publishRes = await request(app)
      .post(`/api/v1/workflows/${publishedWorkflowIdA}/publish`)
      .set("Cookie", ownerCookieA)
      .send({ description: "Initial production release" });
    expect([200, 201]).toContain(publishRes.status);
  });

  // =========================================================================
  // 1. Package Integrity & Canonical Hashing
  // =========================================================================
  describe("Package Integrity & Canonical Hashing", () => {
    it("computes deterministic hash regardless of JSON object key ordering", () => {
      const defA = {
        nodes: [
          { id: "n1", type: "CONDITION" as const, name: "Node 1", config: {} },
        ],
        edges: [],
      };
      const defB = {
        edges: [],
        nodes: [
          { name: "Node 1", config: {}, type: "CONDITION" as const, id: "n1" },
        ],
      };

      const hash1 = computePackageIntegrityHash(defA, {
        exportedAt: "2026-10-31T00:00:00.000Z",
        name: "Test",
        sourceAppVersion: "1.0.0",
        tags: [],
      });
      const hash2 = computePackageIntegrityHash(defB, {
        name: "Test",
        tags: [],
        sourceAppVersion: "1.0.0",
        exportedAt: "2026-10-31T00:00:00.000Z",
      });

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("verifies package integrity and flags tampered contents", () => {
      const pkg = createWorkflowExportPackage({
        name: "Sample Workflow",
        description: "Test description",
        sourceWorkflowId: "wf_test",
        sourceRevision: 1,
        definition: sampleDefinition,
      });

      expect(verifyPackageIntegrity(pkg)).toBe(true);

      // Tamper definition
      const tampered = JSON.parse(JSON.stringify(pkg));
      tampered.definition.nodes[0].name = "Malicious Node";
      expect(verifyPackageIntegrity(tampered)).toBe(false);

      // Tamper metadata
      const tamperedMeta = JSON.parse(JSON.stringify(pkg));
      tamperedMeta.metadata.name = "Altered Name";
      expect(verifyPackageIntegrity(tamperedMeta)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Authorized Workflow Export
  // =========================================================================
  describe("Authorized Workflow Export (GET /api/v1/workflows/:id/export)", () => {
    it("exports draft workflow package with sanitized secrets and canonical integrity hash", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.headers["content-disposition"]).toContain(
        "attachment; filename=",
      );
      expect(res.headers["content-disposition"]).toContain(".flowforge.json");

      const pkg = res.body;
      expect(pkg.formatVersion).toBe("flowforge.package/v1");
      expect(pkg.metadata.name).toBe("Order Processing Pipeline");
      expect(pkg.metadata.sourceRevision).toBeDefined();
      expect(pkg.integrity.algorithm).toBe("sha256");
      expect(pkg.integrity.hash).toBeDefined();

      // Verify integrity of exported payload
      expect(verifyPackageIntegrity(pkg)).toBe(true);
    });

    it("exports published version snapshot when requested", async () => {
      const res = await request(app)
        .get(
          `/api/v1/workflows/${publishedWorkflowIdA}/export?target=published`,
        )
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      const pkg = res.body;
      expect(pkg.formatVersion).toBe("flowforge.package/v1");
      expect(pkg.metadata.sourceVersionNumber).toBe(1);
      expect(verifyPackageIntegrity(pkg)).toBe(true);
    });

    it("exports specific historical version by versionNumber", async () => {
      const res = await request(app)
        .get(
          `/api/v1/workflows/${publishedWorkflowIdA}/export?target=version&versionNumber=1`,
        )
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.metadata.sourceVersionNumber).toBe(1);
    });

    it("rejects export from unauthenticated user (401)", async () => {
      const res = await request(app).get(
        `/api/v1/workflows/${sourceWorkflowIdA}/export`,
      );
      expect(res.status).toBe(401);
    });

    it("rejects export from user in a different organization (403 or 404)", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export`)
        .set("Cookie", ownerCookieB);
      expect([403, 404]).toContain(res.status);
    });

    it("returns 404 for non-existent workflow", async () => {
      const res = await request(app)
        .get("/api/v1/workflows/non_existent_wf/export")
        .set("Cookie", ownerCookieA);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. Secret Scrubbing & Sensitive Field Non-Leakage
  // =========================================================================
  describe("Secret Scrubbing & Credential Protection", () => {
    it("scrubs passwords, API keys, bearer tokens, and maps raw connection IDs to portable references", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      const pkg = res.body;

      const rawJson = JSON.stringify(pkg);
      // Secrets must NOT exist anywhere in exported json
      expect(rawJson).not.toContain("super_secret_webhook_token_12345");
      expect(rawJson).not.toContain("xoxb-secret-bot-token-9999");
      expect(rawJson).not.toContain("Bearer internal_secret_token_abcde");
      expect(rawJson).not.toContain(connIdA); // Internal database UUID must not leak

      // Nodes must use portable connection references
      const slackNode = pkg.definition.nodes.find(
        (n: any) => n.id === "node_slack",
      );
      expect(slackNode.config.connectionId).toBe("conn_ref_1");

      // Dependency manifest must capture required connector
      expect(pkg.dependencies.connectors).toHaveLength(1);
      expect(pkg.dependencies.connectors[0].connectorId).toBe("slack-webhook");
      expect(pkg.dependencies.connectors[0].operationIds).toContain(
        "post_message",
      );
    });
  });

  // =========================================================================
  // 4. Dependency Extraction & Compatibility Analysis (Preview)
  // =========================================================================
  describe("Dependency Discovery & Dry-Run Preview (POST /api/v1/workflows/import/preview)", () => {
    let exportedPkg: any;

    beforeAll(async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);
      exportedPkg = res.body;
    });

    it("correctly extracts node types, triggers, and connector dependencies", () => {
      const deps = extractWorkflowDependencies(exportedPkg.definition);
      expect(deps.nodeTypes).toContain("TRIGGER");
      expect(deps.nodeTypes).toContain("CONNECTOR_ACTION");
      expect(deps.nodeTypes).toContain("HTTP_REQUEST");
      expect(deps.nodeTypes).toContain("END");
      expect(deps.triggers).toHaveLength(1);
      expect(deps.triggers[0].type).toBe("WEBHOOK");
      expect(deps.connectors).toHaveLength(1);
      expect(deps.connectors[0].connectorId).toBe("slack-webhook");
    });

    it("previews import package in Tenant B and identifies matching connections", async () => {
      const previewRes = await request(app)
        .post("/api/v1/workflows/import/preview")
        .set("Cookie", ownerCookieB)
        .send({ package: exportedPkg });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.success).toBe(true);

      const preview = previewRes.body.data;
      expect(preview.canImport).toBe(true);
      expect(preview.integrityVerified).toBe(true);
      expect(preview.workflowName).toBe("Order Processing Pipeline");
      expect(preview.nodeSummary.totalNodes).toBe(4);

      // Should find Globex's slack connection as a potential match
      expect(preview.connectorRequirements).toHaveLength(1);
      expect(preview.connectorRequirements[0].connectorId).toBe(
        "slack-webhook",
      );
      expect(
        preview.connectorRequirements[0].matchingOrgConnections,
      ).toHaveLength(1);
      expect(
        preview.connectorRequirements[0].matchingOrgConnections[0].id,
      ).toBe(connIdB);
    });

    it("flags missing connectors with warning when target tenant has no matching connection", async () => {
      // Create a package requiring a non-configured connector type
      const customPkg = JSON.parse(JSON.stringify(exportedPkg));
      customPkg.dependencies.connectors[0].connectorId = "salesforce";
      // Recompute integrity hash
      customPkg.integrity.hash = computePackageIntegrityHash(
        customPkg.definition,
        customPkg.metadata,
        customPkg.dependencies,
      );

      const previewRes = await request(app)
        .post("/api/v1/workflows/import/preview")
        .set("Cookie", ownerCookieB)
        .send({ package: customPkg });

      expect(previewRes.status).toBe(200);
      const preview = previewRes.body.data;
      expect([
        "COMPATIBLE_WITH_WARNINGS",
        "REQUIRES_MAPPING",
        "UNSUPPORTED",
      ]).toContain(preview.status);
    });
  });

  // =========================================================================
  // 5. Staged Import Pipeline & Conflict Resolution (POST /api/v1/workflows/import)
  // =========================================================================
  describe("Staged Import Pipeline & Conflict Resolution", () => {
    let exportedPkg: any;

    beforeAll(async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);
      exportedPkg = res.body;
    });

    it("imports workflow into Tenant B as DRAFT with disabled triggers and mapped connections", async () => {
      const importRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "CREATE_NEW",
          connectorMappings: {
            conn_ref_1: connIdB, // Map portable ref to Tenant B's active Slack connection
          },
        });

      expect(importRes.status).toBe(201);
      expect(importRes.body.success).toBe(true);

      const importedWf = importRes.body.data;
      expect(importedWf.organizationId).toBe(orgIdB);
      expect(importedWf.status).toBe("DRAFT"); // Always DRAFT
      expect(importedWf.publishedVersionId).toBeFalsy(); // Never published automatically

      // Verify connection remapping
      const slackNode = importedWf.draftDefinition.nodes.find(
        (n: any) => n.id === "node_slack",
      );
      expect(slackNode.config.connectionId).toBe(connIdB);

      // Verify trigger deactivated for safety
      const triggerNode = importedWf.draftDefinition.nodes.find(
        (n: any) => n.id === "trigger_1",
      );
      expect(triggerNode.config.enabled).toBe(false);
      expect(triggerNode.config.active).toBe(false);
    });

    it("safely handles name conflicts with CREATE_NEW by appending an auto-incremented suffix", async () => {
      // First import already created "Order Processing Pipeline" in Tenant B
      // Second import with CREATE_NEW should succeed and rename with suffix
      const secondRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "CREATE_NEW",
          connectorMappings: { conn_ref_1: connIdB },
        });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.name).toBe(
        "Order Processing Pipeline (Imported 1)",
      );
    });

    it("respects explicit RENAME strategy with custom target workflow name", async () => {
      const customNameRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "RENAME",
          targetWorkflowName: "Globex Custom Ingestion Pipeline",
          connectorMappings: { conn_ref_1: connIdB },
        });

      expect(customNameRes.status).toBe(201);
      expect(customNameRes.body.data.name).toBe(
        "Globex Custom Ingestion Pipeline",
      );
    });

    it("replaces editable draft with REPLACE_DRAFT without modifying published immutable versions", async () => {
      // 1. Create a workflow in Tenant B with an initial published version
      const origRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", ownerCookieB)
        .send({
          name: "Existing Replace Target",
          description: "Target to be updated by import",
        });
      const targetWfId = origRes.body.data.id;

      // Add a simple node and publish version 1
      const twf = apiStore.workflows.get(targetWfId)!;
      twf.draftDefinition = {
        nodes: [
          {
            id: "old_n1",
            type: "TRIGGER",
            name: "Old Manual",
            position: { x: 0, y: 0 },
            config: { triggerType: "MANUAL" },
          },
        ],
        edges: [],
      };
      apiStore.workflows.set(targetWfId, twf);

      await request(app)
        .post(`/api/v1/workflows/${targetWfId}/publish`)
        .set("Cookie", ownerCookieB)
        .send({ description: "V1 Snapshot" });

      // 2. Perform import with REPLACE_DRAFT
      const replaceRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          conflictStrategy: "REPLACE_DRAFT",
          targetWorkflowId: targetWfId,
          connectorMappings: { conn_ref_1: connIdB },
        });

      expect([200, 201]).toContain(replaceRes.status);
      const updatedWf = replaceRes.body.data;
      expect(updatedWf.id).toBe(targetWfId);
      expect(updatedWf.draftDefinition.nodes).toHaveLength(4); // Replaced with exported 4 nodes
      expect(updatedWf.publishedVersionId).toBeDefined(); // Published V1 remains active pointer

      // 3. Verify Version 1 history is unchanged
      const versionsRes = await request(app)
        .get(`/api/v1/workflows/${targetWfId}/versions`)
        .set("Cookie", ownerCookieB);
      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.data).toHaveLength(1);
      expect(versionsRes.body.data[0].definition.nodes).toHaveLength(1); // Old V1 snapshot preserved!
    });
  });

  // =========================================================================
  // 6. Tenant-Safe Connector Mapping & Cross-Tenant Boundary
  // =========================================================================
  describe("Tenant-Safe Connector Mapping & Cross-Tenant Isolation", () => {
    let exportedPkg: any;

    beforeAll(async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);
      exportedPkg = res.body;
    });

    it("rejects attempt to map destination connector to another tenant's connection (403)", async () => {
      // Malicious user in Tenant B tries to bind to connIdA (which belongs to Tenant A)
      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "CREATE_NEW",
          connectorMappings: {
            conn_ref_1: connIdA, // Cross-tenant connection theft attempt!
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CROSS_TENANT_MAPPING_FORBIDDEN");
    });

    it("rejects mapping to an inactive connection (400)", async () => {
      const inactiveConnId = `conn_inactive_${Date.now()}`;
      apiStore.connections.set(inactiveConnId, {
        id: inactiveConnId,
        organizationId: orgIdB,
        connectorId: "slack-webhook",
        name: "Inactive Slack",
        status: "ERROR",
        authType: "API_KEY",
        encryptedData: "...",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "CREATE_NEW",
          connectorMappings: {
            conn_ref_1: inactiveConnId,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INACTIVE_CONNECTION");
    });
  });

  // =========================================================================
  // 7. Tampered & Hostile Package Protection
  // =========================================================================
  describe("Tampered & Hostile Package Protection", () => {
    it("rejects package with tampered integrity hash (400)", async () => {
      const validPkg = createWorkflowExportPackage({
        sourceWorkflowId: "wf_tamper_test",
        name: "Tamper Target",
        sourceRevision: 1,
        definition: sampleDefinition,
      });

      const tamperedPkg = JSON.parse(JSON.stringify(validPkg));
      tamperedPkg.definition.nodes[0].config.malicious = true; // Alter node without updating hash

      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: tamperedPkg,
          strategy: "CREATE_NEW",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INTEGRITY_VERIFICATION_FAILED");
    });

    it("rejects unsupported format version (400)", async () => {
      const pkg = createWorkflowExportPackage({
        sourceWorkflowId: "wf_ver_test",
        name: "Version Test",
        sourceRevision: 1,
        definition: sampleDefinition,
      });
      (pkg as any).formatVersion = "flowforge.package/v999";

      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({ package: pkg, strategy: "CREATE_NEW" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("UNSUPPORTED_PACKAGE_FORMAT");
    });

    it("rejects viewer role from importing workflow (403)", async () => {
      const pkg = createWorkflowExportPackage({
        sourceWorkflowId: "wf_perm_test",
        name: "Perm Test",
        sourceRevision: 1,
        definition: sampleDefinition,
      });

      const res = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", viewerCookieB)
        .send({ package: pkg, strategy: "CREATE_NEW" });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 8. Import Provenance Tracking & History
  // =========================================================================
  describe("Provenance Tracking & History", () => {
    let importedWorkflowId: string;
    let exportedPkg: any;

    beforeAll(async () => {
      const expRes = await request(app)
        .get(`/api/v1/workflows/${sourceWorkflowIdA}/export?target=draft`)
        .set("Cookie", ownerCookieA);
      exportedPkg = expRes.body;

      const impRes = await request(app)
        .post("/api/v1/workflows/import")
        .set("Cookie", ownerCookieB)
        .send({
          package: exportedPkg,
          strategy: "CREATE_NEW",
          connectorMappings: { conn_ref_1: connIdB },
        });
      importedWorkflowId = impRes.body.data.id;
    });

    it("persists WorkflowImport record and returns provenance via GET /workflows/:id/imports", async () => {
      const res = await request(app)
        .get(`/api/v1/workflows/${importedWorkflowId}/imports`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const record = res.body.data[0];
      expect(record.workflowId).toBe(importedWorkflowId);
      expect(record.sourceWorkflowId).toBe(sourceWorkflowIdA);
      expect(record.packageHash).toBe(exportedPkg.integrity.hash);
      expect(record.importedById).toBe(ownerIdB);
      expect(record.strategy || record.conflictStrategy).toBe("CREATE_NEW");
    });

    it("queries organization-level import history via GET /organizations/:id/imports", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdB}/imports`)
        .set("Cookie", ownerCookieB);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].organizationId).toBe(orgIdB);
    });
  });

  // =========================================================================
  // 9. Organization Bulk Backup and Restore
  // =========================================================================
  describe("Organization Bulk Backup & Restore", () => {
    let backupPackage: any;

    it("exports entire organization workflow backup package with canonical integrity hash", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/export-backup`)
        .set("Cookie", ownerCookieA)
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain("flowforge-backup-");

      backupPackage = res.body;
      expect(backupPackage.formatVersion).toBe("flowforge.backup/v1");
      expect(backupPackage.sourceOrganizationId).toBe(orgIdA);
      expect(backupPackage.workflows.length).toBeGreaterThanOrEqual(2);
      expect(backupPackage.integrity.hash).toBeDefined();

      // Verify all contained workflow packages have valid integrity
      for (const item of backupPackage.workflows) {
        expect(verifyPackageIntegrity(item)).toBe(true);
      }
    });

    it("restores organization workflows from backup into another organization as drafts", async () => {
      const restoreRes = await request(app)
        .post(`/api/v1/organizations/${orgIdB}/restore-backup`)
        .set("Cookie", ownerCookieB)
        .send({
          backupPackage,
          conflictStrategy: "CREATE_NEW",
        });

      expect([200, 201]).toContain(restoreRes.status);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.restoredCount).toBe(
        backupPackage.workflows.length,
      );
      expect(restoreRes.body.data.errors).toHaveLength(0);

      // Verify restored workflows exist in Tenant B in DRAFT status
      for (const restoredWf of restoreRes.body.data.workflows) {
        expect(restoredWf.organizationId).toBe(orgIdB);
        expect(restoredWf.status).toBe("DRAFT");
      }
    });

    it("rejects cross-tenant backup export attempt (403)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/export-backup`)
        .set("Cookie", ownerCookieB) // Tenant B user targeting Tenant A
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
