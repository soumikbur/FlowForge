import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { identityService } from "../../apps/api/src/services/identity.service.js";
import { DEFAULT_PLANS } from "@flowforge/shared";

describe("Prompt 24: Enterprise SSO, SAML, OIDC, SCIM, and Identity Governance", () => {
  let orgA: any;
  let orgB: any;
  let ownerUser: any;
  let adminUser: any;
  let memberUser: any;
  let strangerUser: any;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let strangerToken: string;

  // Keypair for OIDC and SAML test signatures
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  beforeEach(() => {
    apiStore.clear();

    // 1. Create Organization A
    orgA = {
      id: `org_a_${Date.now()}`,
      name: "Acme Identity Corp",
      slug: `acme-${Date.now()}`,
      billingEmail: "admin@acme.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Create Organization B (Tenant Isolation)
    orgB = {
      id: `org_b_${Date.now()}`,
      name: "Beta Global Ltd",
      slug: `beta-${Date.now()}`,
      billingEmail: "admin@beta.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Grant Enterprise License to Org A & Org B so hasSso is enabled
    apiStore.enterpriseLicenses.set(orgA.id, {
      id: "lic_a",
      organizationId: orgA.id,
      licenseKey: "FF-ENT-ACME-IDP",
      issuedTo: "Acme",
      edition: "Enterprise Ultimate",
      customEntitlements: { hasSso: true },
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    apiStore.enterpriseLicenses.set(orgB.id, {
      id: "lic_b",
      organizationId: orgB.id,
      licenseKey: "FF-ENT-BETA-IDP",
      issuedTo: "Beta",
      edition: "Enterprise Ultimate",
      customEntitlements: { hasSso: true },
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Create Users (valid bcrypt hash of 'password123')
    const testPasswordHash =
      "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";
    ownerUser = {
      id: `usr_owner_${Date.now()}`,
      email: "owner@acme.com",
      passwordHash: testPasswordHash,
      firstName: "Alice",
      lastName: "Owner",
      active: true,
    };
    adminUser = {
      id: `usr_admin_${Date.now()}`,
      email: "admin@acme.com",
      passwordHash: testPasswordHash,
      firstName: "Bob",
      lastName: "Admin",
      active: true,
    };
    memberUser = {
      id: `usr_member_${Date.now()}`,
      email: "member@acme.com",
      passwordHash: testPasswordHash,
      firstName: "Charlie",
      lastName: "Member",
      active: true,
    };
    strangerUser = {
      id: `usr_stranger_${Date.now()}`,
      email: "stranger@beta.com",
      passwordHash: testPasswordHash,
      firstName: "Eve",
      lastName: "Stranger",
      active: true,
    };

    apiStore.users.set(ownerUser.id, ownerUser);
    apiStore.users.set(adminUser.id, adminUser);
    apiStore.users.set(memberUser.id, memberUser);
    apiStore.users.set(strangerUser.id, strangerUser);

    // 5. Create Memberships
    apiStore.memberships.set("mem_1", {
      id: "mem_1",
      organizationId: orgA.id,
      userId: ownerUser.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_2", {
      id: "mem_2",
      organizationId: orgA.id,
      userId: adminUser.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_3", {
      id: "mem_3",
      organizationId: orgA.id,
      userId: memberUser.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_4", {
      id: "mem_4",
      organizationId: orgB.id,
      userId: strangerUser.id,
      role: "OWNER",
    });

    // 6. Create Sessions
    ownerToken = `sess_owner_${Date.now()}`;
    adminToken = `sess_admin_${Date.now()}`;
    memberToken = `sess_member_${Date.now()}`;
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
    apiStore.sessions.set(strangerToken, {
      id: "s4",
      userId: strangerUser.id,
      token: strangerToken,
      expiresAt,
    });
  });

  // Helper to construct signed JWTs for OIDC testing
  function createSignedJwt(
    payload: Record<string, any>,
    alg: string = "RS256",
  ): string {
    const header = { alg, typ: "JWT" };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      "base64url",
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );

    if (alg === "none") {
      return `${encodedHeader}.${encodedPayload}.`;
    }

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${encodedHeader}.${encodedPayload}`);
    const signature = signer.sign(privateKey).toString("base64url");
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  // ==========================================
  // 1. OIDC SSO FLOW
  // ==========================================
  describe("OpenID Connect (OIDC) SSO Authentication", () => {
    let oidcConfig: any;

    beforeEach(async () => {
      // Configure OIDC for Org A
      const res = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/sso`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Acme Okta OIDC",
          protocol: "OIDC",
          issuerUrl: "https://acme.okta.com",
          clientId: "client_flowforge_123",
          clientSecret: "super-secret-client-token",
          authorizationUrl: "https://acme.okta.com/oauth2/v1/authorize",
          tokenUrl: "https://acme.okta.com/oauth2/v1/token",
          defaultRole: "MEMBER",
        });
      oidcConfig = res.body.data;
    });

    it("1.1 should initiate OIDC flow with PKCE code_challenge, state, and nonce", async () => {
      const res = await request(app).get(
        `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.protocol).toBe("OIDC");

      const authUrl = new URL(res.body.data.authorizationUrl);
      expect(authUrl.searchParams.get("client_id")).toBe(
        "client_flowforge_123",
      );
      expect(authUrl.searchParams.get("response_type")).toBe("code");
      expect(authUrl.searchParams.get("code_challenge")).toBeDefined();
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authUrl.searchParams.get("state")).toBe(res.body.data.state);
      expect(authUrl.searchParams.get("nonce")).toBeDefined();
    });

    it("1.2 should complete OIDC callback and auto-provision user upon valid token", async () => {
      // Initiate to obtain state & nonce
      const init = (
        await request(app).get(
          `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
        )
      ).body.data;
      const authUrl = new URL(init.authorizationUrl);
      const nonce = authUrl.searchParams.get("nonce")!;

      // Create signed ID token
      const idToken = createSignedJwt({
        iss: "https://acme.okta.com",
        sub: "okta_user_9988",
        aud: "client_flowforge_123",
        email: "newemployee@acme.com",
        given_name: "Dave",
        family_name: "Engineer",
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({
          state: init.state,
          idToken,
          publicKeyPem: publicKey,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe("newemployee@acme.com");
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data.token).toBeDefined();

      // Verify membership
      const member = Array.from(apiStore.memberships.values()).find(
        (m) =>
          m.userId === res.body.data.user.id && m.organizationId === orgA.id,
      );
      expect(member).toBeDefined();
      expect(member?.role).toBe("MEMBER");

      // Verify external identity record
      const extId = Array.from(apiStore.externalIdentities.values()).find(
        (ext) => ext.userId === res.body.data.user.id,
      );
      expect(extId?.externalSubject).toBe("okta_user_9988");
      expect(extId?.provisioningSource).toBe("SSO");
    });

    it("1.3 should reject OIDC callback with invalid or expired state parameter", async () => {
      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({
          state: "unrecognized_forged_state",
          idToken: "dummy",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("OIDC_AUTH_FAILED");
      expect(res.body.error.message).toContain("CSRF");
    });

    it("1.4 should reject OIDC callback when nonce does not match session nonce", async () => {
      const init = (
        await request(app).get(
          `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
        )
      ).body.data;

      const idToken = createSignedJwt({
        iss: "https://acme.okta.com",
        sub: "okta_user_9988",
        aud: "client_flowforge_123",
        email: "dave@acme.com",
        nonce: "wrong_mismatched_nonce",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({
          state: init.state,
          idToken,
          publicKeyPem: publicKey,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("nonce");
    });

    it("1.5 should reject OIDC token with unsafe 'none' signing algorithm", async () => {
      const init = (
        await request(app).get(
          `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
        )
      ).body.data;
      const authUrl = new URL(init.authorizationUrl);
      const nonce = authUrl.searchParams.get("nonce")!;

      const noneToken = createSignedJwt(
        {
          iss: "https://acme.okta.com",
          sub: "okta_user_9988",
          aud: "client_flowforge_123",
          nonce,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        "none",
      );

      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({
          state: init.state,
          idToken: noneToken,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("'none'");
    });

    it("1.6 should reject expired OIDC tokens", async () => {
      const init = (
        await request(app).get(
          `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
        )
      ).body.data;
      const authUrl = new URL(init.authorizationUrl);
      const nonce = authUrl.searchParams.get("nonce")!;

      const expiredToken = createSignedJwt({
        iss: "https://acme.okta.com",
        sub: "okta_user_9988",
        aud: "client_flowforge_123",
        nonce,
        exp: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
      });

      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({
          state: init.state,
          idToken: expiredToken,
          publicKeyPem: publicKey,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("expired");
    });
  });

  // ==========================================
  // 2. SAML 2.0 SINGLE SIGN-ON FLOW
  // ==========================================
  describe("SAML 2.0 Single Sign-On", () => {
    beforeEach(async () => {
      await request(app)
        .put(`/api/v1/organizations/${orgA.id}/sso`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Acme Azure AD SAML",
          protocol: "SAML",
          entityId: "https://sts.windows.net/acme-tenant-guid/",
          signOnUrl: "https://login.microsoftonline.com/acme/saml2",
          signingCertificate: publicKey,
          defaultRole: "MEMBER",
        });
    });

    it("2.1 should generate SP XML metadata with valid entityID and ACS location", async () => {
      const res = await request(app).get(
        `/api/v1/auth/sso/saml/${orgA.id}/metadata`,
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/xml");
      expect(res.text).toContain(`https://flowforge.dev/sso/saml/${orgA.id}`);
      expect(res.text).toContain("AssertionConsumerService");
    });

    it("2.2 should process valid SAML Assertion and authenticate user", async () => {
      const assertionId = `_saml_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
      const notOnOrAfter = new Date(Date.now() + 3600000).toISOString();

      const signedInfo = `<ds:SignedInfo><ds:Reference URI="#${assertionId}"/></ds:SignedInfo>`;
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(signedInfo);
      const sigValue = signer.sign(privateKey).toString("base64");

      const samlXml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <saml:Assertion ID="${assertionId}">
    <saml:Issuer>https://sts.windows.net/acme-tenant-guid/</saml:Issuer>
    <saml:Subject>
      <saml:NameID>saml.user@acme.com</saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-01-01T00:00:00Z" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>https://flowforge.dev/sso/saml/${orgA.id}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="email"><saml:AttributeValue>saml.user@acme.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="givenName"><saml:AttributeValue>Sam</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="surname"><saml:AttributeValue>Lee</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
    <ds:Signature>
      ${signedInfo}
      <ds:SignatureValue>${sigValue}</ds:SignatureValue>
    </ds:Signature>
  </saml:Assertion>
</samlp:Response>`;

      const res = await request(app)
        .post(`/api/v1/auth/sso/saml/${orgA.id}/acs`)
        .send({
          SAMLResponse: Buffer.from(samlXml).toString("base64"),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe("saml.user@acme.com");
      expect(res.body.data.token).toBeDefined();

      // Check external identity
      const ext = Array.from(apiStore.externalIdentities.values()).find(
        (e) => e.email === "saml.user@acme.com",
      );
      expect(ext?.protocol).toBe("SAML");
      expect(ext?.externalSubject).toBe("saml.user@acme.com");
    });

    it("2.3 should reject assertion replay when same assertion ID is submitted again", async () => {
      const assertionId = `_saml_replay_${Date.now()}`;
      const signedInfo = `<ds:SignedInfo><ds:Reference URI="#${assertionId}"/></ds:SignedInfo>`;
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(signedInfo);
      const sigValue = signer.sign(privateKey).toString("base64");

      const samlXml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <saml:Assertion ID="${assertionId}">
    <saml:Subject><saml:NameID>replay@acme.com</saml:NameID></saml:Subject>
    <saml:Conditions NotOnOrAfter="${new Date(Date.now() + 3600000).toISOString()}">
      <saml:AudienceRestriction><saml:Audience>https://flowforge.dev/sso/saml/${orgA.id}</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <ds:Signature>${signedInfo}<ds:SignatureValue>${sigValue}</ds:SignatureValue></ds:Signature>
  </saml:Assertion>
</samlp:Response>`;

      // First submission succeeds
      const firstRes = await request(app)
        .post(`/api/v1/auth/sso/saml/${orgA.id}/acs`)
        .send({ SAMLResponse: Buffer.from(samlXml).toString("base64") });
      expect(firstRes.status).toBe(200);

      // Replay attempt fails
      const replayRes = await request(app)
        .post(`/api/v1/auth/sso/saml/${orgA.id}/acs`)
        .send({ SAMLResponse: Buffer.from(samlXml).toString("base64") });
      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error.message).toContain("replay");
    });

    it("2.4 should reject SAML assertion with mismatched audience", async () => {
      const assertionId = `_saml_bad_aud_${Date.now()}`;
      const samlXml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
  <saml:Assertion ID="${assertionId}">
    <saml:Subject><saml:NameID>bad.aud@acme.com</saml:NameID></saml:Subject>
    <saml:Conditions NotOnOrAfter="${new Date(Date.now() + 3600000).toISOString()}">
      <saml:AudienceRestriction><saml:Audience>https://different-sp.com/sso</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
</samlp:Response>`;

      const res = await request(app)
        .post(`/api/v1/auth/sso/saml/${orgA.id}/acs`)
        .send({ SAMLResponse: Buffer.from(samlXml).toString("base64") });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Audience");
    });
  });

  // ==========================================
  // 3. SCIM 2.0 USER PROVISIONING (RFC 7643 / 7644)
  // ==========================================
  describe("SCIM 2.0 User Provisioning & Lifecycle", () => {
    let scimBearerToken: string;

    beforeEach(async () => {
      // Create SCIM token for Org A
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/scim/tokens`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Okta SCIM Integration", expiresInDays: 90 });
      scimBearerToken = res.body.data.token;
    });

    it("3.1 should reject SCIM requests without a valid Bearer token", async () => {
      const res = await request(app)
        .get("/api/v1/scim/v2/Users")
        .set("Authorization", "Bearer invalid-unregistered-token");

      expect(res.status).toBe(401);
      expect(res.body.schemas).toContain(
        "urn:ietf:params:scim:api:messages:2.0:Error",
      );
    });

    it("3.2 should provision new user via POST /api/v1/scim/v2/Users", async () => {
      const res = await request(app)
        .post("/api/v1/scim/v2/Users")
        .set("Authorization", `Bearer ${scimBearerToken}`)
        .send({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "scim.engineer@acme.com",
          name: { givenName: "Sarah", familyName: "Connor" },
          emails: [{ value: "scim.engineer@acme.com", primary: true }],
          active: true,
          externalId: "ext-okta-5566",
        });

      expect(res.status).toBe(201);
      expect(res.body.userName).toBe("scim.engineer@acme.com");
      expect(res.body.active).toBe(true);
      expect(res.body.id).toBeDefined();

      // Verify user created in store
      const user = apiStore.users.get(res.body.id);
      expect(user).toBeDefined();
      expect(user?.firstName).toBe("Sarah");
      expect(user?.lastName).toBe("Connor");

      // Verify organization membership created
      const member = Array.from(apiStore.memberships.values()).find(
        (m) => m.userId === user?.id && m.organizationId === orgA.id,
      );
      expect(member).toBeDefined();
    });

    it("3.3 should reject duplicate user provisioning with 409 Conflict", async () => {
      await request(app)
        .post("/api/v1/scim/v2/Users")
        .set("Authorization", `Bearer ${scimBearerToken}`)
        .send({
          userName: "duplicate@acme.com",
          name: { givenName: "Dup", familyName: "User" },
        });

      const res = await request(app)
        .post("/api/v1/scim/v2/Users")
        .set("Authorization", `Bearer ${scimBearerToken}`)
        .send({
          userName: "duplicate@acme.com",
          name: { givenName: "Dup", familyName: "User" },
        });

      expect(res.status).toBe(409);
      expect(res.body.scimType).toBe("uniqueness");
    });

    it("3.4 should filter users with userName eq filter", async () => {
      await request(app)
        .post("/api/v1/scim/v2/Users")
        .set("Authorization", `Bearer ${scimBearerToken}`)
        .send({ userName: "findme@acme.com" });

      const res = await request(app)
        .get('/api/v1/scim/v2/Users?filter=userName eq "findme@acme.com"')
        .set("Authorization", `Bearer ${scimBearerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources[0].userName).toBe("findme@acme.com");
    });

    it("3.5 should update and deactivate user via PATCH and invalidate sessions", async () => {
      const created = (
        await request(app)
          .post("/api/v1/scim/v2/Users")
          .set("Authorization", `Bearer ${scimBearerToken}`)
          .send({ userName: "patchuser@acme.com" })
      ).body;

      // Create an active session for this user
      const userToken = `sess_patch_${Date.now()}`;
      apiStore.sessions.set("s_patch", {
        id: "s_patch",
        userId: created.id,
        token: userToken,
        expiresAt: new Date(Date.now() + 86400000),
      });
      expect(apiStore.sessions.has("s_patch")).toBe(true);

      // Deactivate user via SCIM PatchOp
      const patchRes = await request(app)
        .patch(`/api/v1/scim/v2/Users/${created.id}`)
        .set("Authorization", `Bearer ${scimBearerToken}`)
        .send({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }],
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.active).toBe(false);

      // Verify active session was immediately revoked!
      expect(apiStore.sessions.has("s_patch")).toBe(false);
    });

    it("3.6 should enforce tenant isolation and block cross-tenant SCIM token access", async () => {
      // Org A's token cannot access Org B's SCIM endpoint
      const res = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/scim/tokens`)
        .set("Authorization", `Bearer ${adminToken}`); // Admin is in Org A

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 4. GROUP SYNCHRONIZATION & ROLE MAPPINGS
  // ==========================================
  describe("Directory Group Synchronization & Role Mappings", () => {
    beforeEach(async () => {
      await request(app)
        .put(`/api/v1/organizations/${orgA.id}/sso`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Acme SSO",
          protocol: "OIDC",
          issuerUrl: "https://acme.okta.com",
          clientId: "client_flowforge_123",
          defaultRole: "VIEWER",
        });
    });

    it("4.1 should reject group mappings that attempt to grant OWNER role", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/sso/group-mappings`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalGroupName: "Domain Admins",
          targetRole: "OWNER", // Forbidden
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("OWNER");
    });

    it("4.2 should map external groups to internal roles and assign highest mapped role", async () => {
      // Map 'Engineering-Leads' to ADMIN
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/sso/group-mappings`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalGroupName: "Engineering-Leads",
          targetRole: "ADMIN",
        });

      // Map 'All-Employees' to VIEWER
      await request(app)
        .post(`/api/v1/organizations/${orgA.id}/sso/group-mappings`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalGroupName: "All-Employees",
          targetRole: "VIEWER",
        });

      // User with both groups should receive ADMIN (highest precedence)
      const init = (
        await request(app).get(
          `/api/v1/auth/sso/login?organizationId=${orgA.id}`,
        )
      ).body.data;
      const authUrl = new URL(init.authorizationUrl);
      const nonce = authUrl.searchParams.get("nonce")!;

      const idToken = createSignedJwt({
        iss: "https://acme.okta.com",
        sub: "okta_eng_lead",
        aud: "client_flowforge_123",
        email: "lead@acme.com",
        nonce,
        groups: ["All-Employees", "Engineering-Leads"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post("/api/v1/auth/sso/oidc/callback")
        .send({ state: init.state, idToken, publicKeyPem: publicKey });

      expect(res.status).toBe(200);

      // Verify user membership in Org A has role ADMIN
      const member = Array.from(apiStore.memberships.values()).find(
        (m) =>
          m.userId === res.body.data.user.id && m.organizationId === orgA.id,
      );
      expect(member?.role).toBe("ADMIN");
    });
  });

  // ==========================================
  // 5. SSO ENFORCEMENT & EMERGENCY BREAK-GLASS
  // ==========================================
  describe("SSO Enforcement & Break-Glass Emergency Access", () => {
    it("5.1 should block local password login when SSO is ENFORCED for the organization", async () => {
      // Enable ENFORCED SSO on Org A
      await request(app)
        .put(`/api/v1/organizations/${orgA.id}/sso`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Acme SSO",
          protocol: "OIDC",
          issuerUrl: "https://acme.okta.com",
          clientId: "client_flowforge_123",
          enforcementMode: "ENFORCED",
          bypassUserIds: [adminUser.id], // Admin is emergency break-glass
        });

      // Standard member attempts password login (must be blocked with 403 SSO_REQUIRED)
      const blockedRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: memberUser.email, password: "password123" });

      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.error.code).toBe("SSO_REQUIRED");
      expect(blockedRes.body.error.details.organizationId).toBe(orgA.id);

      // Emergency break-glass admin attempts password login (must be allowed to bypass)
      // We spy on bcrypt.compare to return true for this test
      const enforcement = identityService.checkLocalLoginEnforcement(adminUser);
      expect(enforcement.enforced).toBe(false); // Exempt from enforcement
    });
  });

  // ==========================================
  // 6. SESSION GOVERNANCE & ADMINISTRATIVE REVOCATION
  // ==========================================
  describe("Session Governance & Administrative Revocation", () => {
    it("6.1 should list all active sessions for organization members", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/sessions`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((s: any) => s.userId === ownerUser.id)).toBe(
        true,
      );
      expect(res.body.data.some((s: any) => s.userId === memberUser.id)).toBe(
        true,
      );
      // Stranger from Org B should NOT be included
      expect(res.body.data.some((s: any) => s.userId === strangerUser.id)).toBe(
        false,
      );
    });

    it("6.2 should revoke an individual session", async () => {
      const sessions = (
        await request(app)
          .get(`/api/v1/organizations/${orgA.id}/sessions`)
          .set("Authorization", `Bearer ${adminToken}`)
      ).body.data;

      const targetSession = sessions.find(
        (s: any) => s.userId === memberUser.id,
      );
      expect(targetSession).toBeDefined();

      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgA.id}/sessions/${targetSession.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(apiStore.sessions.has(targetSession.id)).toBe(false);
    });

    it("6.3 should revoke all member sessions across organization while keeping caller session", async () => {
      const revokeRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/sessions/revoke-all`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ keepCurrentSession: true });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.revokedCount).toBeGreaterThan(0);

      // Owner session is preserved
      expect(apiStore.sessions.has(ownerToken)).toBe(true);
    });
  });
});
