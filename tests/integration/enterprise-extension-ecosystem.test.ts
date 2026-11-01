import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import {
  validateWorkflowDefinition,
  resetValidationCache,
} from "@flowforge/workflow-engine";
import {
  ExtensionManifest,
  ExtensionNodeConfigSchema,
  WorkflowDefinition,
} from "@flowforge/shared";
import { encryptCredentialData } from "@flowforge/integrations";

describe("Prompt 30: Extension SDK, Custom Nodes, and Governed Integration Ecosystem", () => {
  let orgA: any;
  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;

  let orgB: any;
  let ownerUserB: any;
  let ownerTokenB: string;

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  const validManifestV1: ExtensionManifest = {
    id: "ext_pkg_transformer",
    name: "Acme Data Transformer",
    description:
      "Enterprise data transformation utilities and custom workflow nodes.",
    version: "1.0.0",
    manifestSchemaVersion: "1.0",
    publisher: {
      id: "pub_acme_corp",
      name: "Acme Extensions Corp",
      email: "ecosystem@acme.corp",
      verified: true,
    },
    supportedFlowForgeVersions: ">=1.0.0",
    runtime: "sandboxed-js",
    declaredCapabilities: [
      "connectors:invoke",
      "credentials:read",
      "logging:write",
    ],
    requiredConnectors: [],
    declaredNodeTypes: [
      {
        nodeType: "xmlToJson",
        label: "XML to JSON Converter",
        description: "Parses XML payloads into structured JSON objects.",
        category: "Transform",
        inputs: 1,
        outputs: 1,
        deprecated: false,
      },
      {
        nodeType: "legacyFormat",
        label: "Legacy Data Formatter",
        description: "Transforms payloads to legacy mainframe format.",
        category: "Transform",
        inputs: 1,
        outputs: 1,
        deprecated: false,
      },
      {
        nodeType: "cryptoSign",
        label: "Cryptographic Signer",
        description: "Signs payloads using secure credentials.",
        category: "Security",
        inputs: 1,
        outputs: 1,
        deprecated: false,
      },
    ],
    license: "MIT",
  };

  const validManifestV2: ExtensionManifest = {
    ...validManifestV1,
    version: "2.0.0",
    description:
      "Enterprise data transformation utilities v2.0 with modern JSON schemas.",
    declaredNodeTypes: [
      {
        nodeType: "xmlToJson",
        label: "XML to JSON Converter v2",
        description: "High-performance XML to JSON converter.",
        category: "Transform",
        inputs: 1,
        outputs: 1,
        deprecated: false,
      },
      {
        nodeType: "cryptoSign",
        label: "Cryptographic Signer",
        description: "Signs payloads using secure credentials.",
        category: "Security",
        inputs: 1,
        outputs: 1,
        deprecated: false,
      },
      // Note: 'legacyFormat' intentionally dropped in v2.0.0 to test breaking change detection
    ],
  };

  beforeEach(() => {
    resetRateLimits();
    resetValidationCache();
    apiStore.clear();

    // 1. Setup Tenant A
    orgA = {
      id: `org_ext_${Date.now()}`,
      name: "Acme Extension Labs",
      slug: `acme-ext-${Date.now()}`,
      billingEmail: "admin@acme.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Setup Tenant B
    orgB = {
      id: `org_rival_${Date.now()}`,
      name: "Rival Industries",
      slug: `rival-${Date.now()}`,
      billingEmail: "admin@rival.corp",
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
      email: "owner@rival.corp",
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

    // 5. Sessions
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
  });

  describe("1. Manifest Contract, Validation, and Deterministic Packaging", () => {
    it("rejects manifest submission with missing required fields", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          manifest: {
            name: "Incomplete Extension",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects manifest with invalid semver format", async () => {
      const invalidManifest = {
        ...validManifestV1,
        version: "v1.0", // Invalid semver
      };

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          manifest: invalidManifest,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects manifest with invalid extension ID identifier", async () => {
      const invalidManifest = {
        ...validManifestV1,
        id: "Invalid Space Identifier",
      };

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          manifest: invalidManifest,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects manifest with invalid requested capabilities", async () => {
      const invalidManifest = {
        ...validManifestV1,
        declaredCapabilities: ["root:admin", "system:execute"], // Unauthorized capabilities
      };

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          manifest: invalidManifest,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("2. Package Registration, SHA-256 Hashing, and Administrative Review", () => {
    it("submits valid extension package and computes deterministic SHA-256 integrity hash", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          manifest: validManifestV1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(validManifestV1.id);
      expect(res.body.data.status).toBe("SUBMITTED");

      // Verify version record created in apiStore
      const verRecord = apiStore.extensionVersions.get(
        `${validManifestV1.id}@1.0.0`,
      );
      expect(verRecord).toBeDefined();
      expect(verRecord?.status).toBe("PENDING_REVIEW");
      expect(verRecord?.packageIntegrityHash).toBeDefined();
      expect(verRecord?.packageIntegrityHash.length).toBe(64); // SHA-256 length
    });

    it("rejects submission from user with VIEWER role", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          manifest: validManifestV1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects package review attempt from non-admin role", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ manifest: validManifestV1 });

      // Member attempts to review
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          decision: "APPROVED",
          comment: "Looks good to me",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("allows admin to review and REJECT an extension package with review notes", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      const reviewRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "REJECTED",
          comment:
            "Security review failed: missing input sanitization for nested XML entities.",
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe("REJECTED");

      const verRecord = apiStore.extensionVersions.get(
        `${validManifestV1.id}@1.0.0`,
      );
      expect(verRecord?.status).toBe("REJECTED");
    });

    it("allows admin to review and APPROVE an extension package for publishing", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      const reviewRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "APPROVED",
          comment: "Approved following automated AST and capability audit.",
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe("PUBLISHED");

      const verRecord = apiStore.extensionVersions.get(
        `${validManifestV1.id}@1.0.0`,
      );
      expect(verRecord?.status).toBe("APPROVED");
    });
  });

  describe("3. Tenant Extension Installation and Capability-Based Security Allowlist", () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });
    });

    it("installs approved extension into organization with explicit capability grant allowlist", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          version: "1.0.0",
          grantedCapabilities: ["connectors:invoke", "credentials:read"],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(orgA.id);
      expect(res.body.data.extensionId).toBe(validManifestV1.id);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.grantedCapabilities).toEqual([
        "connectors:invoke",
        "credentials:read",
      ]);
      expect(res.body.data.installedVersion).toBe("1.0.0");
    });

    it("rejects granting capabilities not declared in extension manifest", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          version: "1.0.0",
          grantedCapabilities: ["events:emit"], // Not declared in validManifestV1
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CAPABILITY_NOT_DECLARED");
    });

    it("rejects installation of an unapproved package", async () => {
      const draftManifest: ExtensionManifest = {
        ...validManifestV1,
        id: "draft_pkg_experimental",
        name: "Experimental Draft Extension",
      };

      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: draftManifest });

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${draftManifest.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ version: "1.0.0" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PACKAGE_NOT_APPROVED");
    });

    it("lists installed extensions for the organization", async () => {
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ version: "1.0.0", grantedCapabilities: ["connectors:invoke"] });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/extensions/installed`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].extensionId).toBe(validManifestV1.id);
      expect(res.body.data[0].installedVersion).toBe("1.0.0");
    });
  });

  describe("4. Workflow Engine & Canonical Workflow Validator Integration", () => {
    it("successfully validates workflow definition containing EXTENSION_NODE", () => {
      const workflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trig",
            type: "TRIGGER",
            name: "Manual Trigger",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_ext_xml",
            type: "EXTENSION_NODE",
            name: "Parse XML to JSON",
            config: {
              extensionId: "ext_pkg_transformer",
              nodeType: "xmlToJson",
              version: "1.0.0",
              parameters: {
                xmlData: "<order><id>ORD-1234</id><amount>450</amount></order>",
              },
            },
            position: { x: 100, y: 100 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 200, y: 200 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trig", target: "node_ext_xml" },
          { id: "e2", source: "node_ext_xml", target: "node_end" },
        ],
      };

      const result = validateWorkflowDefinition(workflowDef);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects EXTENSION_NODE with missing nodeType or invalid config structure", () => {
      const invalidDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trig",
            type: "TRIGGER",
            name: "Manual Trigger",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "node_ext_invalid",
            type: "EXTENSION_NODE",
            name: "Bad Extension Node",
            config: {
              extensionId: "ext_pkg_transformer",
              // missing nodeType
              version: "1.0.0",
            } as any,
            position: { x: 100, y: 100 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 200, y: 200 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trig", target: "node_ext_invalid" },
          { id: "e2", source: "node_ext_invalid", target: "node_end" },
        ],
      };

      const result = validateWorkflowDefinition(invalidDef);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.nodeId === "node_ext_invalid")).toBe(
        true,
      );
    });

    it("verifies ExtensionNodeConfigSchema strictly parses and accepts optional connectionId", () => {
      const validConfig = {
        extensionId: "ext_pkg_security",
        nodeType: "cryptoSign",
        version: "1.2.0",
        connectionId: "conn_secret_signer",
        parameters: { algorithm: "sha256" },
      };

      const parseResult = ExtensionNodeConfigSchema.safeParse(validConfig);
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.connectionId).toBe("conn_secret_signer");
      }
    });
  });

  describe("5. Sandboxed Node Execution and Credential Zero-Exposure", () => {
    let credId: string;

    beforeEach(async () => {
      // 1. Submit and Approve Manifest
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });

      // 2. Setup an encrypted credential in Org A
      credId = `cred_sec_${Date.now()}`;
      const encrypted = encryptCredentialData({
        apiKey: "prod_super_secret_token_999",
      });
      apiStore.credentials.set(credId, {
        id: credId,
        organizationId: orgA.id,
        name: "Acme Signing Key",
        type: "API_KEY",
        encryptedData: encrypted,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("executes custom node and safely converts XML to structured JSON", async () => {
      // Install with connectors:invoke
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          version: "1.0.0",
          grantedCapabilities: ["connectors:invoke"],
        });

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/execute/${validManifestV1.id}/xmlToJson`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          parameters: {
            xmlData:
              "<customer><name>Alice Smith</name><tier>Enterprise</tier></customer>",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jsonData.customer.name).toBe("Alice Smith");
      expect(res.body.data.jsonData.customer.tier).toBe("Enterprise");
    });

    it("safely resolves credentials during node execution when credentials:read is granted", async () => {
      // Install with credentials:read capability
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          version: "1.0.0",
          grantedCapabilities: ["credentials:read"],
        });

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/execute/${validManifestV1.id}/cryptoSign`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          connectionId: credId,
          parameters: {
            message: "Verify Order #10023",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signature).toBeDefined();
      // Raw credential secret must NOT leak in the execution response
      expect(JSON.stringify(res.body)).not.toContain(
        "prod_super_secret_token_999",
      );
    });

    it("blocks credential access when credentials:read capability is NOT granted", async () => {
      // Install WITHOUT credentials:read
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          version: "1.0.0",
          grantedCapabilities: ["connectors:invoke"], // credentials:read is omitted
        });

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/execute/${validManifestV1.id}/cryptoSign`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          connectionId: credId,
          parameters: { message: "Test payload" },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CAPABILITY_DENIED");
      expect(res.body.error.message).toContain("credentials:read");
    });
  });

  describe("6. Extension Lifecycle: Suspension, Reactivation, and Removal", () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ version: "1.0.0", grantedCapabilities: ["connectors:invoke"] });
    });

    it("suspends installed extension and blocks subsequent node execution", async () => {
      // Suspend
      const suspendRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}/suspend`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.status).toBe("SUSPENDED");

      // Execution attempt must fail
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/execute/${validManifestV1.id}/xmlToJson`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ parameters: { xmlData: "<item>apple</item>" } });

      expect(execRes.status).toBe(403);
      expect(execRes.body.error.code).toBe("EXTENSION_SUSPENDED");
    });

    it("reactivates suspended extension and restores node execution", async () => {
      // Suspend first
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}/suspend`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      // Reactivate
      const reactivateRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}/reactivate`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.status).toBe("ACTIVE");

      // Execution succeeds
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/execute/${validManifestV1.id}/xmlToJson`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ parameters: { xmlData: "<item>banana</item>" } });

      expect(execRes.status).toBe(200);
      expect(execRes.body.success).toBe(true);
    });

    it("uninstalls extension cleanly from the organization", async () => {
      const deleteRes = await request(app)
        .delete(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);

      // Verify no longer listed
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/extensions/installed`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(listRes.body.data.length).toBe(0);
    });
  });

  describe("7. Upgrade Impact Preview and Workflow Regression Detection", () => {
    let workflowId: string;

    beforeEach(async () => {
      // 1. Submit and Approve v1.0.0
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV1 });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });

      // 2. Install v1.0.0 in Org A
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/install`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ version: "1.0.0", grantedCapabilities: ["connectors:invoke"] });

      // 3. Create active workflow in Org A using the node 'legacyFormat'
      workflowId = `wf_legacy_pipeline_${Date.now()}`;
      const versionId = `ver_wf_${Date.now()}`;

      apiStore.workflows.set(workflowId, {
        id: workflowId,
        organizationId: orgA.id,
        name: "Legacy Integration Pipeline",
        slug: "legacy-pipeline",
        status: "ACTIVE",
        publishedVersionId: versionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.versions.set(versionId, {
        id: versionId,
        workflowId,
        versionNumber: 1,
        definition: {
          nodes: [
            {
              id: "trig",
              type: "TRIGGER",
              name: "Trig",
              config: {},
              position: { x: 0, y: 0 },
            },
            {
              id: "node_legacy",
              type: "EXTENSION_NODE",
              name: "Format Legacy",
              config: {
                extensionId: validManifestV1.id,
                nodeType: "legacyFormat",
                version: "1.0.0",
              },
              position: { x: 100, y: 100 },
            },
            {
              id: "end",
              type: "END",
              name: "End",
              config: {},
              position: { x: 200, y: 200 },
            },
          ],
          edges: [
            { id: "e1", source: "trig", target: "node_legacy" },
            { id: "e2", source: "node_legacy", target: "end" },
          ],
        },
        createdAt: new Date(),
      });

      // 4. Submit and Approve v2.0.0 (which drops 'legacyFormat')
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ manifest: validManifestV2 });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${validManifestV1.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });
    });

    it("previews upgrade and flags breaking changes and affected workflows", async () => {
      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}/upgrade-preview?targetVersion=2.0.0`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const preview = res.body.data;
      expect(preview.currentVersion).toBe("1.0.0");
      expect(preview.targetVersion).toBe("2.0.0");
      expect(preview.isCompatible).toBe(false);
      expect(preview.removedNodeTypes).toEqual(["legacyFormat"]);
      expect(preview.affectedWorkflows.length).toBe(1);
      expect(preview.affectedWorkflows[0].id).toBe(workflowId);
      expect(preview.affectedWorkflows[0].name).toBe(
        "Legacy Integration Pipeline",
      );
    });

    it("executes upgrade to target version successfully", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/installed/${validManifestV1.id}/upgrade`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ targetVersion: "2.0.0" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.installedVersion).toBe("2.0.0");
    });
  });

  describe("8. Multi-Tenant Isolation and Access Control", () => {
    const privateManifest: ExtensionManifest = {
      ...validManifestV1,
      id: "acme_private_tools",
      name: "Acme Confidential Tools",
    };

    beforeEach(async () => {
      // Tenant A submits a private extension (scoped to orgA)
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/extensions/submit`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          manifest: privateManifest,
          isPublic: false,
        });

      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/extensions/${privateManifest.id}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });
    });

    it("isolates private extensions: Tenant B catalog listing does not disclose Tenant A's private extension", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/extensions/catalog`)
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(res.status).toBe(200);
      const pkg = res.body.data.find((p: any) => p.id === privateManifest.id);
      expect(pkg).toBeUndefined();
    });

    it("enforces tenant boundary: Tenant B cannot install Tenant A's private extension", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgB.id}/extensions/${privateManifest.id}/install`,
        )
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({ version: "1.0.0" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });
});
