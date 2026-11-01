import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { oauthService } from "../../apps/api/src/services/oauth.service.js";
import { signWebhookPayload } from "@flowforge/integrations";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";

describe("Prompt 25: Enterprise API Platform, API Keys, OAuth Client Credentials, and Developer Portal", () => {
  let orgA: any;
  let orgB: any;
  let ownerUserA: any;
  let memberUserA: any;
  let ownerUserB: any;
  let ownerTokenA: string;
  let memberTokenA: string;
  let ownerTokenB: string;

  beforeEach(() => {
    resetRateLimits();
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
      name: "Beta Technologies Ltd",
      slug: `beta-${Date.now()}`,
      billingEmail: "admin@beta.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Create Users
    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@acme.com",
      passwordHash: "hash",
      firstName: "Alice",
      lastName: "Owner",
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@acme.com",
      passwordHash: "hash",
      firstName: "Bob",
      lastName: "Member",
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@beta.com",
      passwordHash: "hash",
      firstName: "Charlie",
      lastName: "OwnerB",
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Create Memberships
    apiStore.memberships.set("mem_1", {
      id: "mem_1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_2", {
      id: "mem_2",
      organizationId: orgA.id,
      userId: memberUserA.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_3", {
      id: "mem_3",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    // 5. Create Sessions
    ownerTokenA = `sess_owner_a_${Date.now()}`;
    memberTokenA = `sess_member_a_${Date.now()}`;
    ownerTokenB = `sess_owner_b_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 86400000);

    apiStore.sessions.set("s1", {
      id: "s1",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt,
    });
    apiStore.sessions.set("s2", {
      id: "s2",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt,
    });
    apiStore.sessions.set("s3", {
      id: "s3",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt,
    });
  });

  // ==========================================
  // 1. API KEY LIFECYCLE MANAGEMENT
  // ==========================================
  describe("1. API Key Lifecycle Management & Secret Handling", () => {
    it("1.1 should create an API key, display raw secret only once, and hash secret in store", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/api-keys`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          name: "CI/CD Integration Key",
          scopes: ["workflows:read", "workflows:write"],
          expiresInDays: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("CI/CD Integration Key");
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.token.startsWith("ff_live_")).toBe(true);

      const rawToken = res.body.data.token;
      const keyRecord = apiStore.apiKeys.get(res.body.data.id);
      expect(keyRecord).toBeDefined();
      expect(keyRecord?.keyHash).not.toBe(rawToken); // Stored as hash!
      expect(keyRecord?.keyPrefix).toBe(rawToken.slice(0, 16));
    });

    it("1.2 should list API keys without exposing secrets", async () => {
      // Create a key
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/api-keys`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          name: "Production Pipeline Key",
          scopes: ["workflows:read"],
        });

      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/api-keys`)
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      const found = listRes.body.data.find(
        (k: any) => k.id === createRes.body.data.id,
      );
      expect(found).toBeDefined();
      expect(found.token).toBeUndefined(); // Secret NEVER returned in list!
      expect(found.keyPrefix).toBeDefined();
    });

    it("1.3 should rotate API key secret, invalidating the old token and returning new token once", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/api-keys`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          name: "Rotation Test Key",
          scopes: ["workflows:read"],
        });

      const oldToken = createRes.body.data.token;
      const keyId = createRes.body.data.id;

      // Verify old token authenticates
      const testOld = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("X-API-Key", oldToken);
      expect(testOld.status).toBe(200);

      // Rotate key secret
      const rotateRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/api-keys/${keyId}/rotate`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ expiresInDays: 60 });

      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.data.token).toBeDefined();
      const newToken = rotateRes.body.data.token;
      expect(newToken).not.toBe(oldToken);

      // Old token MUST now be rejected
      const testOldAfter = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("X-API-Key", oldToken);
      expect(testOldAfter.status).toBe(401);

      // New token MUST succeed
      const testNewAfter = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("X-API-Key", newToken);
      expect(testNewAfter.status).toBe(200);
    });

    it("1.4 should reject expired and revoked API keys", async () => {
      const key = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/api-keys`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Revocation Key",
            scopes: ["workflows:read"],
          })
      ).body.data;

      // Revoke the key
      const revRes = await request(app)
        .delete(`/api/v1/organizations/${orgA.id}/api-keys/${key.id}`)
        .set("Authorization", `Bearer ${ownerTokenA}`);
      expect(revRes.status).toBe(200);

      // Attempt to access with revoked key
      const testRev = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("X-API-Key", key.token);
      expect(testRev.status).toBe(401);
      expect(testRev.body.error.code).toBe("REVOKED_API_KEY");
    });

    it("1.5 should prevent API keys from creating or rotating other API keys", async () => {
      // Create an API key with write scopes
      const apiKey = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/api-keys`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Sub-Key Creator Attempt",
            scopes: ["workflows:write", "apikeys:write"],
          })
      ).body.data;

      // Using the API key to call POST /api-keys must be forbidden
      const subCreate = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/api-keys`)
        .set("X-API-Key", apiKey.token)
        .send({ name: "Malicious Key", scopes: ["workflows:read"] });

      expect(subCreate.status).toBe(403);
    });
  });

  // ==========================================
  // 2. OAUTH 2.0 MACHINE-TO-MACHINE (RFC 6749)
  // ==========================================
  describe("2. OAuth 2.0 Client Credentials Grant & Access Token Lifecycle", () => {
    let testClient: any;
    let testSecret: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/oauth/clients`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          name: "Microservice Service Account",
          scopes: ["workflows:read", "workflows:write", "executions:write"],
        });

      testClient = reg.body.data;
      testSecret = reg.body.data.clientSecret;
    });

    it("2.1 should register an OAuth client and reveal client_secret once", async () => {
      expect(testClient.clientId.startsWith("ff_client_")).toBe(true);
      expect(testSecret.startsWith("ff_sec_")).toBe(true);

      // Verify in store secret is hashed
      const stored = apiStore.oauthClients.get(testClient.clientId);
      expect(stored?.clientSecretHash).not.toBe(testSecret);
    });

    it("2.2 should reject token requests with unsupported grant_type or invalid credentials", async () => {
      // Unsupported grant
      const resBadGrant = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "authorization_code",
        client_id: testClient.clientId,
        client_secret: testSecret,
      });
      expect(resBadGrant.status).toBe(400);
      expect(resBadGrant.body.error).toBe("unsupported_grant_type");

      // Invalid secret
      const resBadSecret = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: "wrong_secret_123",
      });
      expect(resBadSecret.status).toBe(401);
      expect(resBadSecret.body.error).toBe("invalid_client");
    });

    it("2.3 should issue access token via POST body and HTTP Basic Auth", async () => {
      // 1. Via POST body
      const resBody = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
      });

      expect(resBody.status).toBe(200);
      expect(resBody.body.access_token.startsWith("ff_oat_")).toBe(true);
      expect(resBody.body.token_type).toBe("Bearer");
      expect(resBody.body.expires_in).toBe(3600);

      // 2. Via HTTP Basic Authentication
      const basicCreds = Buffer.from(
        `${testClient.clientId}:${testSecret}`,
      ).toString("base64");
      const resBasic = await request(app)
        .post("/api/v1/oauth/token")
        .set("Authorization", `Basic ${basicCreds}`)
        .send({ grant_type: "client_credentials" });

      expect(resBasic.status).toBe(200);
      expect(resBasic.body.access_token).toBeDefined();
    });

    it("2.4 should enforce scope restrictions and reject unauthorized scope escalation", async () => {
      // Attempting to request "audit:read" which the client was not granted
      const resEscalate = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
        scope: "workflows:read audit:read",
      });

      expect(resEscalate.status).toBe(400);
      expect(resEscalate.body.error).toBe("invalid_scope");

      // Valid subset of scopes succeeds
      const resSubset = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
        scope: "workflows:read",
      });

      expect(resSubset.status).toBe(200);
      expect(resSubset.body.scope).toBe("workflows:read");
    });

    it("2.5 should authenticate API endpoints using issued OAuth access token", async () => {
      const tokenRes = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
      });

      const accessToken = tokenRes.body.access_token;

      // Access organization details
      const apiRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(apiRes.status).toBe(200);
      expect(apiRes.body.data.id).toBe(orgA.id);
    });

    it("2.6 should reject tokens if OAuth client is disabled", async () => {
      const tokenRes = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
      });
      const accessToken = tokenRes.body.access_token;

      // Disable client
      await request(app)
        .patch(
          `/api/v1/organizations/${orgA.id}/oauth/clients/${testClient.clientId}`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ enabled: false });

      // Existing token should now be rejected
      const testRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(testRes.status).toBe(401);
      expect(testRes.body.error.code).toBe("INVALID_TOKEN");
    });

    it("2.7 should rotate client secret, invalidating the previous secret", async () => {
      const rotateRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/oauth/clients/${testClient.clientId}/rotate-secret`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(rotateRes.status).toBe(200);
      const newSecret = rotateRes.body.data.clientSecret;
      expect(newSecret).not.toBe(testSecret);

      // Old secret cannot obtain new tokens
      const oldAttempt = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: testSecret,
      });
      expect(oldAttempt.status).toBe(401);

      // New secret succeeds
      const newAttempt = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: testClient.clientId,
        client_secret: newSecret,
      });
      expect(newAttempt.status).toBe(200);
    });
  });

  // ==========================================
  // 3. API SCOPES & AUTHORIZATION
  // ==========================================
  describe("3. API Scopes & Centralized Authorization Enforcement", () => {
    it("3.1 should reject write operations for credentials with only read scopes", async () => {
      // Create a read-only API key
      const readKey = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/api-keys`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Read-Only Auditor",
            scopes: ["workflows:read"],
          })
      ).body.data;

      // Attempt to create a workflow
      const writeAttempt = await request(app)
        .post("/api/v1/workflows")
        .set("X-API-Key", readKey.token)
        .set("X-Organization-Id", orgA.id)
        .send({
          name: "Unauthorized Workflow",
          description: "Should fail with insufficient scope",
        });

      expect(writeAttempt.status).toBe(403);
      expect(writeAttempt.body.error.code).toBe("INSUFFICIENT_SCOPE");
      expect(writeAttempt.body.error.message).toContain("workflow:write");
    });

    it("3.2 should permit operations when granular plural scope matches internal permission", async () => {
      // Create an OAuth client with 'workflows:write'
      const clientRes = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/oauth/clients`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Workflow Creator Service",
            scopes: ["workflows:write", "workflows:read"],
          })
      ).body.data;

      const tokenRes = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: clientRes.clientId,
        client_secret: clientRes.clientSecret,
      });

      const token = tokenRes.body.access_token;

      // Creation should succeed
      const createWf = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Automated Pipeline Workflow",
          description: "Created via OAuth 2.0 machine client",
        });

      expect(createWf.status).toBe(201);
      expect(createWf.body.data.name).toBe("Automated Pipeline Workflow");
    });
  });

  // ==========================================
  // 4. IDEMPOTENCY PROTECTION
  // ==========================================
  describe("4. Centralized Idempotency Protection", () => {
    it("4.1 should return cached response and prevent duplicate operations on key replay", async () => {
      const idempotencyKey = `idem_test_${Date.now()}`;
      const payload = {
        name: "Idempotent Order Workflow",
        description: "Testing idempotent replay",
      };

      // 1. Initial request
      const firstRes = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload);

      expect(firstRes.status).toBe(201);
      const createdId = firstRes.body.data.id;

      // 2. Exact same request replayed
      const secondRes = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload);

      expect([200, 201]).toContain(secondRes.status);
      expect(secondRes.body.data.id).toBe(createdId);
      expect(secondRes.headers["idempotent-replayed"]).toBe("true");
      expect(secondRes.body.meta?.idempotent).toBe(true);

      // Verify no duplicate workflow was created
      const orgWorkflows = Array.from(apiStore.workflows.values()).filter(
        (w) => w.organizationId === orgA.id && w.name === payload.name,
      );
      expect(orgWorkflows.length).toBe(1);
    });

    it("4.2 should reject idempotency key reuse when payload differs", async () => {
      const idempotencyKey = `idem_conflict_${Date.now()}`;

      // 1. Initial request
      await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ name: "Workflow A", description: "Desc A" });

      // 2. Conflicting reuse with different payload
      const conflictRes = await request(app)
        .post("/api/v1/workflows")
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ name: "Workflow B", description: "Different Body" });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe("IDEMPOTENCY_MISMATCH");
    });
  });

  // ==========================================
  // 5. RATE LIMITING & CORRELATION IDS
  // ==========================================
  describe("5. Rate Limiting Headers & Request Correlation", () => {
    it("5.1 should include X-Correlation-Id and X-Request-Id on every API response", async () => {
      const customRequestId = `req_custom_${Date.now()}`;

      const res = await request(app)
        .get("/health")
        .set("X-Request-Id", customRequestId);

      expect(res.status).toBe(200);
      expect(res.headers["x-request-id"]).toBe(customRequestId);
      expect(res.headers["x-correlation-id"]).toBeDefined();
    });

    it("5.2 should return rate limit headers on requests", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    });
  });

  // ==========================================
  // 6. WEBHOOKS & SIGNATURE INTEGRITY
  // ==========================================
  describe("6. Outbound Webhook Delivery & SSRF Protections", () => {
    it("6.1 should reject webhook subscription URLs resolving to internal loopback / private IPs", async () => {
      const ssrfPayloads = [
        "http://127.0.0.1:8080/hook",
        "http://localhost:3000/callback",
        "http://169.254.169.254/latest/meta-data", // Cloud metadata
        "http://10.0.0.1/internal",
      ];

      for (const badUrl of ssrfPayloads) {
        const res = await request(app)
          .post("/api/v1/webhooks/subscriptions")
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "SSRF Attempt",
            url: badUrl,
            events: ["workflow.execution.completed"],
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("SSRF_BLOCKED_DESTINATION");
      }
    });

    it("6.2 should sign outbound webhook payload with timestamped HMAC-SHA256 signature", () => {
      const secret = "whsec_test_secret_key_1234567890";
      const payload = {
        id: "evt_123",
        type: "workflow.execution.completed",
        timestamp: new Date().toISOString(),
      };

      const signed = signWebhookPayload(secret, payload);
      expect(signed.headerValue).toContain("t=");
      expect(signed.headerValue).toContain("v1=");

      // Verify signature manually
      const parts = Object.fromEntries(
        signed.headerValue.split(",").map((p) => p.split("=")),
      );
      const expectedSignedContent = `${parts.t}.${JSON.stringify(payload)}`;
      const expectedHash = crypto
        .createHmac("sha256", secret)
        .update(expectedSignedContent)
        .digest("hex");

      expect(parts.v1).toBe(expectedHash);
    });

    it("6.3 should rotate webhook subscription secret", async () => {
      const sub = (
        await request(app)
          .post("/api/v1/webhooks/subscriptions")
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Webhook Rotation Test",
            url: "https://api.partner.com/webhook",
            events: ["*"],
          })
      ).body.data;

      const rotateRes = await request(app)
        .post(`/api/v1/webhooks/subscriptions/${sub.id}/rotate-secret`)
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.data.secret).toBeDefined();
      expect(rotateRes.body.data.secret).not.toBe(sub.secret);
    });
  });

  // ==========================================
  // 7. DEVELOPER PORTAL & OPENAPI
  // ==========================================
  describe("7. Developer Portal & OpenAPI Documentation", () => {
    it("7.1 should serve interactive developer portal HTML at /api/v1/docs", async () => {
      const res = await request(app).get("/api/v1/docs");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.text).toContain("FlowForge Developer Portal");
      expect(res.text).toContain("OAuth 2.0");
      expect(res.text).toContain("Idempotent Execution");
    });

    it("7.2 should serve OpenAPI 3.0 specification JSON and YAML", async () => {
      // JSON
      const resJson = await request(app).get("/api/v1/docs/openapi.json");
      expect(resJson.status).toBe(200);
      expect(resJson.body.openapi).toBe("3.0.3");
      expect(resJson.body.paths["/api/v1/oauth/token"]).toBeDefined();

      // YAML
      const resYaml = await request(app).get("/api/v1/docs/openapi.yaml");
      expect(resYaml.status).toBe(200);
      expect(resYaml.headers["content-type"]).toContain("yaml");
      expect(resYaml.text).toContain("openapi: 3.0.3");
    });
  });

  // ==========================================
  // 8. MULTI-TENANT ISOLATION
  // ==========================================
  describe("8. Multi-Tenant Boundary Enforcement", () => {
    it("8.1 should prevent API key of Org A from accessing resources in Org B", async () => {
      const keyA = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/api-keys`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Org A Key",
            scopes: ["workflows:read"],
          })
      ).body.data;

      // Accessing Org B's resource must be rejected
      const crossAttempt = await request(app)
        .get(`/api/v1/organizations/${orgB.id}`)
        .set("X-API-Key", keyA.token);

      expect(crossAttempt.status).toBe(403);
    });

    it("8.2 should prevent OAuth client of Org A from accessing resources in Org B", async () => {
      const clientA = (
        await request(app)
          .post(`/api/v1/organizations/${orgA.id}/oauth/clients`)
          .set("Authorization", `Bearer ${ownerTokenA}`)
          .send({
            name: "Org A Machine Client",
            scopes: ["workflows:read"],
          })
      ).body.data;

      const tokenRes = await request(app).post("/api/v1/oauth/token").send({
        grant_type: "client_credentials",
        client_id: clientA.clientId,
        client_secret: clientA.clientSecret,
      });

      const tokenA = tokenRes.body.access_token;

      // Accessing Org B's resource must be rejected
      const crossAttempt = await request(app)
        .get(`/api/v1/organizations/${orgB.id}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(crossAttempt.status).toBe(403);
    });
  });
});
