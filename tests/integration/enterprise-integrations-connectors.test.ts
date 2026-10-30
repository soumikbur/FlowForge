import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import {
  defaultConnectorRegistry,
  ConnectorRegistry,
  redactDeep,
  redactUrl,
  redactErrorMessage,
  maskSecret,
  createMaskedSummary,
  resolveAndValidateDestination,
  decryptCredentialData,
  testConnection,
} from "@flowforge/integrations";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 12: Enterprise Integration Management, Connector Registry, and Secure Credential Lifecycle", () => {
  // Tenant A: Global Logistics
  const ownerEmailA = `logistics_owner_${Date.now()}@flowforge.dev`;
  const viewerEmailA = `logistics_viewer_${Date.now()}@flowforge.dev`;
  let ownerCookieA: string;
  let viewerCookieA: string;
  let orgIdA: string;
  let ownerIdA: string;
  let viewerIdA: string;

  // Tenant B: Isolated Financial
  const ownerEmailB = `isolated_fin_${Date.now()}@flowforge.dev`;
  let ownerCookieB: string;
  let orgIdB: string;

  let createdHttpConnIdA: string;
  let createdSlackConnIdA: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Register Tenant A Owner
    const resA = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailA,
      password: "Password123!",
      firstName: "Logistics",
      lastName: "Owner",
      organizationName: "Global Logistics",
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
      passwordHash: "mock_viewer_pass",
      firstName: "Viewer",
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

    // 3. Register Tenant B Owner
    const resB = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmailB,
      password: "Password123!",
      firstName: "Finance",
      lastName: "Owner",
      organizationName: "Isolated Financial",
    });
    expect(resB.status).toBe(201);
    orgIdB = resB.body.data.organization.id;
    ownerCookieB = resB.headers["set-cookie"][0];
  });

  // ==========================================
  // SUITE 1: CONNECTOR REGISTRY
  // ==========================================
  describe("1. Centralized Typed Connector Registry", () => {
    it("should list default production connectors via API", async () => {
      const res = await request(app).get("/api/v1/connectors");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const connectorIds = res.body.data.map((c: any) => c.id);
      expect(connectorIds).toContain("http-api");
      expect(connectorIds).toContain("smtp-email");
      expect(connectorIds).toContain("slack-webhook");
    });

    it("should retrieve specific connector definition with schemas", async () => {
      const res = await request(app).get("/api/v1/connectors/http-api");
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe("http-api");
      expect(res.body.data.category).toBe("HTTP");
      expect(res.body.data.operations.length).toBeGreaterThan(0);
      expect(res.body.data.operations[0].id).toBe("request");
    });

    it("should return 404 for unknown connector ID", async () => {
      const res = await request(app).get("/api/v1/connectors/unknown-connector-xyz");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CONNECTOR_NOT_FOUND");
    });

    it("should reject duplicate connector ID registration in registry", () => {
      const customRegistry = new ConnectorRegistry();
      const def: any = {
        id: "custom-connector",
        name: "Custom Service",
        description: "Custom",
        version: "1.0.0",
        category: "CUSTOM",
        authType: "API_KEY",
        authConfigFields: [],
        operations: [],
      };
      customRegistry.register(def, async () => ({ success: true, data: null }));

      expect(() => {
        customRegistry.register(def, async () => ({ success: true, data: null }));
      }).toThrow(/already registered/i);
    });

    it("should support category filtering in connector registry", () => {
      const httpConnectors = defaultConnectorRegistry.list("HTTP");
      expect(httpConnectors.every((c) => c.category === "HTTP")).toBe(true);

      const notifConnectors = defaultConnectorRegistry.list("NOTIFICATION");
      expect(notifConnectors.every((c) => c.category === "NOTIFICATION")).toBe(true);
    });
  });

  // ==========================================
  // SUITE 2: REDACTION & SSRF DEFENSES
  // ==========================================
  describe("2. Deep Credential Redaction & SSRF Defenses", () => {
    it("should mask secrets with maskSecret utility", () => {
      expect(maskSecret("sk_live_1234567890")).toBe("••••••••7890");
      expect(maskSecret("1234")).toBe("••••••••");
      expect(maskSecret(null)).toBe("••••••••");
    });

    it("should create masked summaries from plaintext credentials", () => {
      const summary = createMaskedSummary({
        apiKey: "sk_live_987654321",
        baseUrl: "https://api.stripe.com",
        timeoutMs: 5000,
      });
      expect(summary.apiKey).toBe("••••••••4321");
      expect(summary.baseUrl).toBe("https://api.stripe.com");
      expect(summary.timeoutMs).toBe("5000");
    });

    it("should deeply redact sensitive keys in nested objects and circular structures", () => {
      const sensitiveData: any = {
        name: "Order Service",
        credentials: {
          apiKey: "secret_value_12345",
          authorization: "Bearer secret_bearer_token",
          config: {
            webhookSecret: "whsec_abcdef123456",
            publicHost: "api.stripe.com",
          },
        },
      };
      sensitiveData.self = sensitiveData; // Circular reference

      const redacted: any = redactDeep(sensitiveData);
      expect(redacted.credentials.apiKey).toBe("[REDACTED]");
      expect(redacted.credentials.authorization).toBe("[REDACTED]");
      expect(redacted.credentials.config.webhookSecret).toBe("[REDACTED]");
      expect(redacted.credentials.config.publicHost).toBe("api.stripe.com");
      expect(redacted.self).toBe("[CIRCULAR_REFERENCE]");
    });

    it("should redact URL passwords and sensitive query params with redactUrl", () => {
      const dirtyUrl = "https://user:mypassword@api.example.com/v1?apiKey=secretKey123&page=1";
      const cleanUrl = redactUrl(dirtyUrl);
      expect(cleanUrl).not.toContain("mypassword");
      expect(cleanUrl).not.toContain("secretKey123");
      expect(cleanUrl).toContain("page=1");
    });

    it("should redact sensitive tokens in error messages", () => {
      const dirtyError = "Request to https://api.com?token=xyz failed with Bearer eyJhbGciOiJIUzI1NiJ9";
      const cleanError = redactErrorMessage(dirtyError);
      expect(cleanError).not.toContain("xyz");
      expect(cleanError).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(cleanError).toContain("Bearer [REDACTED]");
    });

    it("should block loopback, link-local, and private addresses via resolveAndValidateDestination", async () => {
      const loopback = await resolveAndValidateDestination("http://127.0.0.1:8080/admin");
      expect(loopback.isSafe).toBe(false);

      const metadata = await resolveAndValidateDestination("http://169.254.169.254/latest/meta-data");
      expect(metadata.isSafe).toBe(false);

      const privateSubnet = await resolveAndValidateDestination("http://10.0.1.5/internal");
      expect(privateSubnet.isSafe).toBe(false);
    });
  });

  // ==========================================
  // SUITE 3: CONNECTION LIFECYCLE & APIS
  // ==========================================
  describe("3. Connection Lifecycle, AES-256-GCM, and Governance API", () => {
    it("should test draft connection credentials before creation", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections/test-draft`)
        .set("Cookie", ownerCookieA)
        .send({
          connectorId: "http-api",
          credentialData: {
            baseUrl: "https://httpbin.org",
            apiKey: "test_key_123",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.testedAt).toBeDefined();
    });

    it("should reject draft connection test pointing to blocked private IP", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections/test-draft`)
        .set("Cookie", ownerCookieA)
        .send({
          connectorId: "http-api",
          credentialData: {
            baseUrl: "http://169.254.169.254",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(false);
      expect(res.body.data.errorCategory).toBe("SSRF_BLOCKED");
    });

    it("should create an organization-scoped connection with AES-256-GCM encryption", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections`)
        .set("Cookie", ownerCookieA)
        .send({
          connectorId: "http-api",
          name: "Stripe Production API",
          authType: "API_KEY",
          credentialData: {
            baseUrl: "https://api.stripe.com",
            apiKey: "sk_live_verysecretstripekey1234",
            authPrefix: "Bearer",
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toMatch(/^conn_/);
      createdHttpConnIdA = res.body.data.id;

      // Plaintext must NOT be returned in response
      expect(res.body.data.credentialData).toBeUndefined();
      expect(res.body.data.maskedSummary.apiKey).toBe("••••••••1234");
      expect(res.body.data.status).toBe("ACTIVE");

      // Verify stored record in database is encrypted
      const record = apiStore.connections.get(createdHttpConnIdA);
      expect(record).toBeDefined();
      expect(record!.encryptedData).not.toContain("sk_live_verysecretstripekey1234");
      const parts = record!.encryptedData.split(":");
      expect(parts.length).toBe(3); // iv:authTag:ciphertext

      // Decryption check
      const decrypted: any = decryptCredentialData(record!.encryptedData);
      expect(decrypted.apiKey).toBe("sk_live_verysecretstripekey1234");
    });

    it("should create Slack Webhook connection", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections`)
        .set("Cookie", ownerCookieA)
        .send({
          connectorId: "slack-webhook",
          name: "Alerts Slack Channel",
          authType: "CUSTOM",
          credentialData: {
            webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXXX1234",
            defaultChannel: "#alerts",
          },
        });

      expect(res.status).toBe(201);
      createdSlackConnIdA = res.body.data.id;
      expect(res.body.data.maskedSummary.webhookUrl).toBe("••••••••1234");
    });

    it("should list connections for organization with masked secrets only", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/connections`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const conn = res.body.data.find((c: any) => c.id === createdHttpConnIdA);
      expect(conn).toBeDefined();
      expect(conn.maskedSummary.apiKey).toBe("••••••••1234");
      expect(conn.credentialData).toBeUndefined();
    });

    it("should test existing saved connection", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections/${createdHttpConnIdA}/test`)
        .set("Cookie", ownerCookieA)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.testedAt).toBeDefined();

      // Check updated diagnostics on connection record
      const conn = apiStore.connections.get(createdHttpConnIdA);
      expect(conn?.lastTestedAt).toBeDefined();
      expect(conn?.lastTestStatus).toBeDefined();
    });

    it("should rotate credentials and record audit event", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections/${createdHttpConnIdA}/rotate`)
        .set("Cookie", ownerCookieA)
        .send({
          credentialData: {
            baseUrl: "https://api.stripe.com",
            apiKey: "sk_live_newrotatedkey9999",
            authPrefix: "Bearer",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.maskedSummary.apiKey).toBe("••••••••9999");

      // Verify re-encrypted secret in store
      const conn = apiStore.connections.get(createdHttpConnIdA);
      const decrypted: any = decryptCredentialData(conn!.encryptedData);
      expect(decrypted.apiKey).toBe("sk_live_newrotatedkey9999");

      // Verify audit log
      const audit = apiStore.auditLogs.find(
        (a) => a.action === "connection:rotate" && a.resourceId === createdHttpConnIdA,
      );
      expect(audit).toBeDefined();
    });

    it("should update connection status to DISABLED", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgIdA}/connections/${createdHttpConnIdA}`)
        .set("Cookie", ownerCookieA)
        .send({
          status: "DISABLED",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("DISABLED");
    });
  });

  // ==========================================
  // SUITE 4: WORKFLOW RUNNER EXECUTION
  // ==========================================
  describe("4. Workflow Runner Execution with Connector Nodes", () => {
    let runner: WorkflowExecutionRunner;

    beforeAll(() => {
      runner = new WorkflowExecutionRunner(apiStore);
    });

    it("should reject execution when referenced connection is DISABLED", async () => {
      const workflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_connector",
            type: "CONNECTOR_ACTION",
            name: "Call Stripe",
            config: {
              connectorId: "http-api",
              operationId: "request",
              connectionId: createdHttpConnIdA,
              parameters: {
                url: "/v1/charges",
              },
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_connector" },
          { id: "e2", source: "node_connector", target: "node_end" },
        ],
      };

      const executionId = `exec_disabled_conn_${Date.now()}`;
      apiStore.workflows.set("wf_1", {
        id: "wf_1",
        organizationId: orgIdA,
        name: "Stripe Workflow",
        status: "ACTIVE",
        draftDefinition: workflowDef,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("ver_1", {
        id: "ver_1",
        workflowId: "wf_1",
        versionNumber: 1,
        definition: workflowDef,
        publishedAt: new Date(),
      });
      apiStore.executions.set(executionId, {
        id: executionId,
        organizationId: orgIdA,
        workflowId: "wf_1",
        workflowVersionId: "ver_1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const outcome = await runner.processExecution(executionId);
      expect(outcome.status).toBe("FAILED");
      expect(JSON.stringify(outcome.errorDetails)).toContain("DISABLED");
    });

    it("should execute CONNECTOR_ACTION successfully when connection is ACTIVE", async () => {
      // Re-enable connection
      const conn = apiStore.connections.get(createdHttpConnIdA)!;
      conn.status = "ACTIVE";
      apiStore.connections.set(conn.id, conn);

      // Create dummy webhook connection for testing
      const testConnId = `conn_test_email_${Date.now()}`;
      const { encryptCredentialData } = await import("@flowforge/integrations");
      apiStore.connections.set(testConnId, {
        id: testConnId,
        organizationId: orgIdA,
        connectorId: "smtp-email",
        name: "Test Mailer",
        status: "ACTIVE",
        authType: "BASIC_AUTH",
        encryptedData: encryptCredentialData({
          host: "smtp.mock.dev",
          username: "mailer_bot",
          password: "secret_mailer_pass",
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const workflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_notify",
            type: "CONNECTOR_ACTION",
            name: "Dispatch Email",
            config: {
              connectorId: "smtp-email",
              operationId: "sendEmail",
              connectionId: testConnId,
              parameters: {
                to: "operations@company.com",
                subject: "Warehouse Batch Processed",
                body: "All shipment items cleared customs.",
              },
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_notify" },
          { id: "e2", source: "node_notify", target: "node_end" },
        ],
      };

      const executionId = `exec_active_conn_${Date.now()}`;
      apiStore.workflows.set("wf_2", {
        id: "wf_2",
        organizationId: orgIdA,
        name: "Mailer Workflow",
        status: "ACTIVE",
        draftDefinition: workflowDef,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("ver_2", {
        id: "ver_2",
        workflowId: "wf_2",
        versionNumber: 1,
        definition: workflowDef,
        publishedAt: new Date(),
      });
      apiStore.executions.set(executionId, {
        id: executionId,
        organizationId: orgIdA,
        workflowId: "wf_2",
        workflowVersionId: "ver_2",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const outcome = await runner.processExecution(executionId);
      expect(outcome.status).toBe("SUCCEEDED");
      const stepOutput = (outcome.contextData as any).steps["node_notify"]?.output;
      expect(stepOutput).toBeDefined();
      expect(stepOutput.delivered).toBe(true);
    });

    it("should prevent non-idempotent retries on connector failure", async () => {
      const testConnId = `conn_test_slack_${Date.now()}`;
      const { encryptCredentialData } = await import("@flowforge/integrations");
      apiStore.connections.set(testConnId, {
        id: testConnId,
        organizationId: orgIdA,
        connectorId: "slack-webhook",
        name: "Test Slack",
        status: "ACTIVE",
        authType: "CUSTOM",
        encryptedData: encryptCredentialData({
          webhookUrl: "https://invalid.slack.hook.url.doesnotexist",
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const workflowDef: WorkflowDefinition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
          },
          {
            id: "node_slack",
            type: "CONNECTOR_ACTION",
            name: "Slack Post",
            config: {
              connectorId: "slack-webhook",
              operationId: "sendMessage",
              connectionId: testConnId,
              parameters: { text: "Hello" },
              idempotentRetry: false, // Non-idempotent
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_slack" },
          { id: "e2", source: "node_slack", target: "node_end" },
        ],
      };

      const executionId = `exec_non_idempotent_${Date.now()}`;
      apiStore.workflows.set("wf_3", {
        id: "wf_3",
        organizationId: orgIdA,
        name: "Slack Workflow",
        status: "ACTIVE",
        draftDefinition: workflowDef,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("ver_3", {
        id: "ver_3",
        workflowId: "wf_3",
        versionNumber: 1,
        definition: workflowDef,
        publishedAt: new Date(),
      });
      apiStore.executions.set(executionId, {
        id: executionId,
        organizationId: orgIdA,
        workflowId: "wf_3",
        workflowVersionId: "ver_3",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "QUEUED",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const outcome = await runner.processExecution(executionId);
      expect(outcome.status).toBe("FAILED");
      // Must not be stuck in RETRYING because non-idempotent failures are non-retryable
      expect(outcome.status).not.toBe("RETRYING");
    });
  });

  // ==========================================
  // SUITE 5: CROSS-TENANT ISOLATION & RBAC
  // ==========================================
  describe("5. Multi-Tenant Isolation & Role Authorization", () => {
    it("should prevent Tenant B from accessing Tenant A's connection", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgIdB}/connections/${createdHttpConnIdA}`)
        .set("Cookie", ownerCookieB);

      // Org mismatch returns 404
      expect(res.status).toBe(404);
    });

    it("should prevent Tenant B from rotating Tenant A's connection", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdB}/connections/${createdHttpConnIdA}/rotate`)
        .set("Cookie", ownerCookieB)
        .send({
          credentialData: { apiKey: "hacked_key" },
        });

      expect(res.status).toBe(404);
    });

    it("should prevent Tenant B from testing Tenant A's connection", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgIdB}/connections/${createdHttpConnIdA}/test`)
        .set("Cookie", ownerCookieB)
        .send({});

      expect(res.status).toBe(404);
    });

    it("should prevent Viewer role from creating or deleting connections", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgIdA}/connections`)
        .set("Cookie", viewerCookieA)
        .send({
          connectorId: "http-api",
          name: "Viewer Illegal Connection",
          credentialData: { apiKey: "test" },
        });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe("FORBIDDEN");

      const deleteRes = await request(app)
        .delete(`/api/v1/organizations/${orgIdA}/connections/${createdHttpConnIdA}`)
        .set("Cookie", viewerCookieA);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe("FORBIDDEN");
    });

    it("should successfully revoke connection when authorized", async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${orgIdA}/connections/${createdSlackConnIdA}`)
        .set("Cookie", ownerCookieA);

      expect(res.status).toBe(200);

      // Re-fetching revoked connection returns 404
      const fetchRes = await request(app)
        .get(`/api/v1/organizations/${orgIdA}/connections/${createdSlackConnIdA}`)
        .set("Cookie", ownerCookieA);
      expect(fetchRes.status).toBe(404);
    });
  });
});
