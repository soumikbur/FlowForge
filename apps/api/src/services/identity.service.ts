import crypto from "crypto";
import {
  SsoConfigurationRecord,
  ExternalIdentityRecord,
  GroupRoleMappingRecord,
  ScimTokenRecord,
  ScimUserRequest,
  ScimPatchOpRequest,
  Role,
  WorkspaceRole,
} from "@flowforge/shared";
import { apiStore, UserRecord, SessionRecord } from "../store.js";

export interface OidcAuthSession {
  state: string;
  nonce: string;
  codeVerifier: string;
  organizationId: string;
  redirectUri: string;
  expiresAt: Date;
}

export interface SamlAuthSession {
  requestId: string;
  relayState: string;
  organizationId: string;
  expiresAt: Date;
}

export class IdentityService {
  // In-memory replay & CSRF tracking caches (with TTL pruning)
  private oidcSessions = new Map<string, OidcAuthSession>();
  private samlSessions = new Map<string, SamlAuthSession>();
  private processedSamlAssertions = new Map<string, Date>();

  // ==========================================
  // 1. OIDC Flow
  // ==========================================

  public initiateOidc(ssoConfig: SsoConfigurationRecord, redirectUri: string) {
    const state = crypto.randomBytes(24).toString("base64url");
    const nonce = crypto.randomBytes(24).toString("base64url");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    this.oidcSessions.set(state, {
      state,
      nonce,
      codeVerifier,
      organizationId: ssoConfig.organizationId,
      redirectUri,
      expiresAt,
    });

    const authUrl = new URL(
      ssoConfig.authorizationUrl ||
        `${ssoConfig.issuerUrl}/oauth2/v1/authorize`,
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", ssoConfig.clientId || "");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set(
      "scope",
      (ssoConfig.scopes || ["openid", "profile", "email"]).join(" "),
    );
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return {
      authorizationUrl: authUrl.toString(),
      state,
      nonce,
      codeVerifier,
    };
  }

  public async handleOidcCallback(params: {
    state: string;
    code?: string;
    idToken?: string;
    claims?: Record<string, any>;
    publicKeyPem?: string;
    clientIp?: string;
  }): Promise<{
    user: UserRecord;
    session: SessionRecord;
    isNewUser: boolean;
  }> {
    const session = this.oidcSessions.get(params.state);
    if (!session || new Date() > session.expiresAt) {
      throw new Error(
        "Invalid or expired OIDC state parameter. Potential CSRF detected.",
      );
    }
    this.oidcSessions.delete(params.state);

    const ssoConfig = apiStore.ssoConfigurations.get(session.organizationId);
    if (!ssoConfig || !ssoConfig.enabled) {
      throw new Error(
        "SSO configuration not found or disabled for this organization.",
      );
    }

    let claims = params.claims;

    // If a JWT id_token is provided, validate header, payload, and claims
    if (params.idToken) {
      claims = this.verifyJwtToken(
        params.idToken,
        ssoConfig,
        session.nonce,
        params.publicKeyPem,
      );
    }

    if (!claims || !claims.sub) {
      throw new Error(
        "OIDC token claims missing required 'sub' (subject) identifier.",
      );
    }

    const externalSubject = String(claims.sub);
    const email = String(
      claims.email || `${externalSubject}@sso.flowforge.dev`,
    ).toLowerCase();
    const firstName =
      claims.given_name || claims.firstName || email.split("@")[0];
    const lastName = claims.family_name || claims.lastName || "";

    const result = this.resolveOrCreateSsoUser({
      organizationId: ssoConfig.organizationId,
      providerId: ssoConfig.id,
      protocol: "OIDC",
      externalSubject,
      externalIssuer: ssoConfig.issuerUrl || "https://issuer.flowforge.dev",
      email,
      firstName,
      lastName,
      claims,
      groups: claims.groups || [],
      defaultRole: ssoConfig.defaultRole || "MEMBER",
    });

    apiStore.recordAudit({
      organizationId: ssoConfig.organizationId,
      userId: result.user.id,
      action: "auth.sso.login_success",
      resourceType: "user",
      resourceId: result.user.id,
      metadata: {
        protocol: "OIDC",
        externalSubject,
        providerId: ssoConfig.id,
        isNewUser: result.isNewUser,
      },
      ipAddress: params.clientIp,
    });

    const userSession = this.createSession(result.user.id, params.clientIp);
    return {
      user: result.user,
      session: userSession,
      isNewUser: result.isNewUser,
    };
  }

  // ==========================================
  // 2. SAML 2.0 Flow
  // ==========================================

  public generateSpMetadata(ssoConfig: SsoConfigurationRecord): string {
    const entityId =
      ssoConfig.spEntityId ||
      `https://flowforge.dev/sso/saml/${ssoConfig.organizationId}`;
    const acsUrl =
      ssoConfig.acsUrl ||
      `https://flowforge.dev/api/v1/auth/sso/saml/${ssoConfig.organizationId}/acs`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="1" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  public initiateSaml(ssoConfig: SsoConfigurationRecord, relayState?: string) {
    const requestId = `_${crypto.randomUUID()}`;
    const state = relayState || crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    this.samlSessions.set(requestId, {
      requestId,
      relayState: state,
      organizationId: ssoConfig.organizationId,
      expiresAt,
    });

    const signOnUrl = new URL(
      ssoConfig.signOnUrl || "https://idp.flowforge.dev/saml/sso",
    );
    signOnUrl.searchParams.set("RelayState", state);
    signOnUrl.searchParams.set(
      "SAMLRequest",
      Buffer.from(
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="${requestId}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${signOnUrl.origin}" AssertionConsumerServiceURL="${ssoConfig.acsUrl}"/>`,
      ).toString("base64"),
    );

    return {
      signOnUrl: signOnUrl.toString(),
      requestId,
      relayState: state,
    };
  }

  public async handleSamlAcs(params: {
    samlResponseXmlOrBase64: string;
    organizationId: string;
    relayState?: string;
    clientIp?: string;
  }): Promise<{
    user: UserRecord;
    session: SessionRecord;
    isNewUser: boolean;
  }> {
    let xmlString = params.samlResponseXmlOrBase64;
    // Decode base64 if not starting with <
    if (!xmlString.trim().startsWith("<")) {
      xmlString = Buffer.from(xmlString, "base64").toString("utf8");
    }

    const ssoConfig = apiStore.ssoConfigurations.get(params.organizationId);
    if (!ssoConfig || !ssoConfig.enabled) {
      throw new Error(
        "SSO configuration not found or disabled for this organization.",
      );
    }

    // 1. Extract Assertion ID & Replay check
    const assertionIdMatch =
      xmlString.match(/<saml:Assertion[^>]*ID="([^"]+)"/) ||
      xmlString.match(/<Assertion[^>]*ID="([^"]+)"/);
    if (!assertionIdMatch) {
      throw new Error("Missing SAML Assertion element in response.");
    }
    const assertionId = assertionIdMatch[1];
    if (this.processedSamlAssertions.has(assertionId)) {
      throw new Error(
        "SAML Assertion replay detected. Assertion has already been processed.",
      );
    }
    this.processedSamlAssertions.set(assertionId, new Date());

    // 2. Audience Restriction check
    const expectedAudience =
      ssoConfig.spEntityId ||
      `https://flowforge.dev/sso/saml/${ssoConfig.organizationId}`;
    const audienceMatch =
      xmlString.match(/<saml:Audience>([^<]+)<\/saml:Audience>/) ||
      xmlString.match(/<Audience>([^<]+)<\/Audience>/);
    if (audienceMatch && audienceMatch[1].trim() !== expectedAudience) {
      throw new Error(
        `Invalid SAML Audience: expected '${expectedAudience}', got '${audienceMatch[1].trim()}'.`,
      );
    }

    // 3. Expiration / Time Condition check
    const notOnOrAfterMatch = xmlString.match(/NotOnOrAfter="([^"]+)"/);
    if (notOnOrAfterMatch) {
      const notOnOrAfter = new Date(notOnOrAfterMatch[1]);
      // Allow 2-minute clock skew
      if (new Date().getTime() > notOnOrAfter.getTime() + 120000) {
        throw new Error(
          "SAML Assertion has expired (NotOnOrAfter constraint violated).",
        );
      }
    }

    // 4. XML Signature validation if certificate is configured
    if (ssoConfig.signingCertificate) {
      this.verifySamlXmlSignature(xmlString, ssoConfig.signingCertificate);
    }

    // 5. Subject / NameID extraction
    const nameIdMatch =
      xmlString.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/) ||
      xmlString.match(/<NameID[^>]*>([^<]+)<\/NameID>/);
    if (!nameIdMatch) {
      throw new Error("Missing SAML NameID in Assertion.");
    }
    const nameId = nameIdMatch[1].trim();

    // 6. Attribute statements (email, givenName, surname, groups)
    const attributes = this.extractSamlAttributes(xmlString);
    const email = (
      attributes["email"] ||
      attributes["mail"] ||
      nameId
    ).toLowerCase();
    const firstName =
      attributes["givenName"] || attributes["firstName"] || email.split("@")[0];
    const lastName = attributes["surname"] || attributes["lastName"] || "";
    const groups = attributes["groups"]
      ? Array.isArray(attributes["groups"])
        ? attributes["groups"]
        : [attributes["groups"]]
      : [];

    const result = this.resolveOrCreateSsoUser({
      organizationId: ssoConfig.organizationId,
      providerId: ssoConfig.id,
      protocol: "SAML",
      externalSubject: nameId,
      externalIssuer: ssoConfig.entityId || "https://idp.flowforge.dev",
      email,
      firstName,
      lastName,
      claims: attributes,
      groups,
      defaultRole: ssoConfig.defaultRole || "MEMBER",
    });

    apiStore.recordAudit({
      organizationId: ssoConfig.organizationId,
      userId: result.user.id,
      action: "auth.sso.login_success",
      resourceType: "user",
      resourceId: result.user.id,
      metadata: {
        protocol: "SAML",
        nameId,
        assertionId,
        providerId: ssoConfig.id,
        isNewUser: result.isNewUser,
      },
      ipAddress: params.clientIp,
    });

    const userSession = this.createSession(result.user.id, params.clientIp);
    return {
      user: result.user,
      session: userSession,
      isNewUser: result.isNewUser,
    };
  }

  // ==========================================
  // 3. SCIM 2.0 User Provisioning
  // ==========================================

  public authenticateScimBearerToken(
    authHeader?: string,
    targetOrgId?: string,
  ): ScimTokenRecord {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error(
        "SCIM request requires a Bearer token in the Authorization header.",
      );
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const scimToken = Array.from(apiStore.scimTokens.values()).find(
      (t) => t.tokenHash === tokenHash,
    );

    if (!scimToken) {
      throw new Error("Invalid SCIM Bearer token.");
    }

    if (scimToken.revokedAt) {
      throw new Error("SCIM Bearer token has been revoked.");
    }

    if (scimToken.expiresAt && new Date() > scimToken.expiresAt) {
      throw new Error("SCIM Bearer token has expired.");
    }

    if (targetOrgId && scimToken.organizationId !== targetOrgId) {
      throw new Error(
        "SCIM Bearer token is not authorized for this organization (cross-tenant access denied).",
      );
    }

    // Update last used timestamp
    scimToken.lastUsedAt = new Date();
    apiStore.scimTokens.set(scimToken.id, scimToken);

    return scimToken;
  }

  public scimCreateUser(
    orgId: string,
    scimData: ScimUserRequest,
    actorId?: string,
  ): any {
    const email = scimData.userName.toLowerCase().trim();

    // Check if user already exists
    let existingUser = Array.from(apiStore.users.values()).find(
      (u) => u.email.toLowerCase() === email,
    );

    let isNewUser = false;
    if (!existingUser) {
      isNewUser = true;
      existingUser = {
        id: `usr_${crypto.randomUUID()}`,
        email,
        passwordHash: "scim_managed_account",
        firstName: scimData.name?.givenName || email.split("@")[0],
        lastName: scimData.name?.familyName || "",
        active: scimData.active !== false,
      };
      apiStore.users.set(existingUser.id, existingUser);
    } else {
      // Check if user is already a member of this organization
      const existingMember = Array.from(apiStore.memberships.values()).find(
        (m) => m.organizationId === orgId && m.userId === existingUser!.id,
      );
      if (existingMember) {
        const conflictErr = new Error(
          `User '${email}' already exists in organization.`,
        );
        (conflictErr as any).status = 409;
        throw conflictErr;
      }
    }

    // Create organization membership
    const ssoConfig = apiStore.ssoConfigurations.get(orgId);
    const defaultRole = ssoConfig?.defaultRole || "MEMBER";

    const membershipId = `mem_${crypto.randomUUID()}`;
    apiStore.memberships.set(membershipId, {
      id: membershipId,
      organizationId: orgId,
      userId: existingUser.id,
      role: defaultRole,
    });

    // Create ExternalIdentity record
    const externalIdentityId = `ext_${crypto.randomUUID()}`;
    apiStore.externalIdentities.set(externalIdentityId, {
      id: externalIdentityId,
      organizationId: orgId,
      userId: existingUser.id,
      providerId: ssoConfig?.id || "scim",
      protocol: "OIDC",
      externalSubject: scimData.externalId || existingUser.id,
      externalIssuer: "scim.flowforge.dev",
      email,
      provisioningSource: "SCIM",
      claims: scimData as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    apiStore.recordAudit({
      organizationId: orgId,
      userId: actorId || existingUser.id,
      action: "scim.user.provisioned",
      resourceType: "user",
      resourceId: existingUser.id,
      metadata: { email, externalId: scimData.externalId, isNewUser },
    });

    return this.formatScimUser(existingUser, orgId);
  }

  public scimUpdateUser(
    orgId: string,
    userId: string,
    scimData: Partial<ScimUserRequest>,
    actorId?: string,
  ): any {
    const user = apiStore.users.get(userId);
    if (!user) {
      const err = new Error(`SCIM user '${userId}' not found.`);
      (err as any).status = 404;
      throw err;
    }

    if (scimData.name?.givenName !== undefined)
      user.firstName = scimData.name.givenName;
    if (scimData.name?.familyName !== undefined)
      user.lastName = scimData.name.familyName;

    if (scimData.active !== undefined) {
      user.active = scimData.active;
      // If user is deactivated, immediately purge all active sessions for this user!
      if (!user.active) {
        this.revokeAllSessionsForUser(user.id);
      }
    }

    apiStore.users.set(user.id, user);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: actorId || user.id,
      action: "scim.user.updated",
      resourceType: "user",
      resourceId: user.id,
      metadata: { active: user.active },
    });

    return this.formatScimUser(user, orgId);
  }

  public scimPatchUser(
    orgId: string,
    userId: string,
    patch: ScimPatchOpRequest,
    actorId?: string,
  ): any {
    const user = apiStore.users.get(userId);
    if (!user) {
      const err = new Error(`SCIM user '${userId}' not found.`);
      (err as any).status = 404;
      throw err;
    }

    for (const op of patch.Operations) {
      const path = (op.path || "").toLowerCase();
      const val = op.value;

      if (
        path === "active" ||
        (typeof val === "object" && val !== null && "active" in val)
      ) {
        const activeState =
          path === "active" ? Boolean(val) : Boolean((val as any).active);
        user.active = activeState;
        if (!user.active) {
          this.revokeAllSessionsForUser(user.id);
        }
      }
    }

    apiStore.users.set(user.id, user);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: actorId || user.id,
      action: "scim.user.patched",
      resourceType: "user",
      resourceId: user.id,
      metadata: { operations: patch.Operations.length, active: user.active },
    });

    return this.formatScimUser(user, orgId);
  }

  public scimDeleteUser(orgId: string, userId: string, actorId?: string): void {
    const user = apiStore.users.get(userId);
    if (!user) {
      const err = new Error(`SCIM user '${userId}' not found.`);
      (err as any).status = 404;
      throw err;
    }

    // Deprovision user: deactivate account & purge active sessions, keeping workflows & history intact!
    user.active = false;
    apiStore.users.set(user.id, user);

    // Remove organization membership
    const membership = Array.from(apiStore.memberships.values()).find(
      (m) => m.organizationId === orgId && m.userId === userId,
    );
    if (membership) {
      apiStore.memberships.delete(membership.id);
    }

    this.revokeAllSessionsForUser(userId);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: actorId || userId,
      action: "scim.user.deprovisioned",
      resourceType: "user",
      resourceId: userId,
      metadata: { email: user.email },
    });
  }

  public formatScimUser(user: UserRecord, orgId: string): any {
    const externalIdentity = Array.from(
      apiStore.externalIdentities.values(),
    ).find((ext) => ext.organizationId === orgId && ext.userId === user.id);

    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      externalId: externalIdentity?.externalSubject || user.id,
      userName: user.email,
      name: {
        formatted: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        familyName: user.lastName || "",
        givenName: user.firstName || "",
      },
      emails: [{ value: user.email, primary: true }],
      active: user.active !== false,
      meta: {
        resourceType: "User",
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        location: `/api/v1/scim/v2/Users/${user.id}`,
      },
    };
  }

  // ==========================================
  // 4. Session Governance & SSO Enforcement
  // ==========================================

  public checkLocalLoginEnforcement(user: UserRecord): {
    enforced: boolean;
    organizationId?: string;
    organizationName?: string;
    ssoUrl?: string;
  } {
    // If account is deactivated, reject immediately
    if (user.active === false) {
      const inactiveErr = new Error(
        "Account has been disabled by an administrator or directory deprovisioning.",
      );
      (inactiveErr as any).code = "ACCOUNT_DISABLED";
      throw inactiveErr;
    }

    const memberships = Array.from(apiStore.memberships.values()).filter(
      (m) => m.userId === user.id,
    );

    for (const membership of memberships) {
      const ssoConfig = apiStore.ssoConfigurations.get(
        membership.organizationId,
      );
      if (!ssoConfig || !ssoConfig.enabled) continue;

      if (
        ssoConfig.enforcementMode === "ENFORCED" ||
        ssoConfig.enforcementMode === "STRICT"
      ) {
        // Check if user is exempt in break-glass emergency list
        const isBypass = ssoConfig.bypassUserIds?.includes(user.id);
        const isOwner = membership.role === "OWNER";

        // In ENFORCED mode, bypass list and owners can bypass; in STRICT mode, only bypass list can
        if (isBypass || (ssoConfig.enforcementMode === "ENFORCED" && isOwner)) {
          continue;
        }

        const org = apiStore.organizations.get(membership.organizationId);
        return {
          enforced: true,
          organizationId: membership.organizationId,
          organizationName: org?.name || "Organization",
          ssoUrl: `/api/v1/auth/sso/login?organizationId=${membership.organizationId}`,
        };
      }
    }

    return { enforced: false };
  }

  public createSession(
    userId: string,
    clientIp?: string,
    userAgent?: string,
  ): SessionRecord {
    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = `ses_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const sessionRecord: SessionRecord = {
      id: sessionId,
      userId,
      token,
      ipAddress: clientIp,
      userAgent,
      lastActivityAt: new Date(),
      expiresAt,
    };

    apiStore.sessions.set(sessionId, sessionRecord);
    return sessionRecord;
  }

  public revokeAllSessionsForUser(userId: string): number {
    let count = 0;
    for (const [id, s] of apiStore.sessions.entries()) {
      if (s.userId === userId) {
        apiStore.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  public revokeAllSessionsForOrganization(
    orgId: string,
    keepCurrentSessionToken?: string,
  ): number {
    const memberUserIds = new Set(
      Array.from(apiStore.memberships.values())
        .filter((m) => m.organizationId === orgId)
        .map((m) => m.userId),
    );

    let count = 0;
    for (const [id, s] of apiStore.sessions.entries()) {
      if (memberUserIds.has(s.userId) && s.token !== keepCurrentSessionToken) {
        apiStore.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  // ==========================================
  // Helper: Identity Resolution & Group Role Mapping
  // ==========================================

  private resolveOrCreateSsoUser(params: {
    organizationId: string;
    providerId: string;
    protocol: "OIDC" | "SAML";
    externalSubject: string;
    externalIssuer: string;
    email: string;
    firstName: string;
    lastName: string;
    claims: Record<string, any>;
    groups: string[];
    defaultRole: Role;
  }): { user: UserRecord; isNewUser: boolean } {
    // 1. Check existing external identity
    const existingExtId = Array.from(apiStore.externalIdentities.values()).find(
      (ext) =>
        ext.providerId === params.providerId &&
        ext.externalSubject === params.externalSubject,
    );

    let user: UserRecord | undefined;
    let isNewUser = false;

    if (existingExtId) {
      user = apiStore.users.get(existingExtId.userId);
      if (!user) {
        throw new Error("Associated internal user record missing.");
      }
      if (user.active === false) {
        throw new Error("User account has been deactivated.");
      }
      existingExtId.lastLoginAt = new Date();
      existingExtId.updatedAt = new Date();
      apiStore.externalIdentities.set(existingExtId.id, existingExtId);
    } else {
      // 2. Check if user already exists by email
      user = Array.from(apiStore.users.values()).find(
        (u) => u.email.toLowerCase() === params.email.toLowerCase(),
      );

      if (!user) {
        isNewUser = true;
        user = {
          id: `usr_${crypto.randomUUID()}`,
          email: params.email,
          passwordHash: "sso_managed_account",
          firstName: params.firstName,
          lastName: params.lastName,
          active: true,
        };
        apiStore.users.set(user.id, user);
      } else if (user.active === false) {
        throw new Error("User account has been deactivated.");
      }

      // Link external identity
      const extId = `ext_${crypto.randomUUID()}`;
      const extRecord: ExternalIdentityRecord = {
        id: extId,
        organizationId: params.organizationId,
        userId: user.id,
        providerId: params.providerId,
        protocol: params.protocol,
        externalSubject: params.externalSubject,
        externalIssuer: params.externalIssuer,
        email: params.email,
        provisioningSource: "SSO",
        claims: params.claims,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.externalIdentities.set(extId, extRecord);
    }

    // 3. Resolve role from group mappings
    const resolvedRole = this.resolveRoleFromGroups(
      params.organizationId,
      params.groups,
      params.defaultRole,
    );

    // Ensure membership exists with mapped role
    let membership = Array.from(apiStore.memberships.values()).find(
      (m) =>
        m.organizationId === params.organizationId && m.userId === user!.id,
    );

    if (!membership) {
      const memId = `mem_${crypto.randomUUID()}`;
      apiStore.memberships.set(memId, {
        id: memId,
        organizationId: params.organizationId,
        userId: user.id,
        role: resolvedRole,
      });
    } else if (membership.role !== "OWNER") {
      // Don't downgrade or override manual OWNER
      membership.role = resolvedRole;
      apiStore.memberships.set(membership.id, membership);
    }

    return { user, isNewUser };
  }

  private resolveRoleFromGroups(
    organizationId: string,
    userGroups: string[],
    defaultRole: Role,
  ): Role {
    if (!userGroups || userGroups.length === 0) return defaultRole;

    const mappings = Array.from(apiStore.groupRoleMappings.values()).filter(
      (gm) => gm.organizationId === organizationId,
    );

    const roleRank: Record<Role, number> = {
      OWNER: 4,
      ADMIN: 3,
      MEMBER: 2,
      VIEWER: 1,
    };

    let highestRole = defaultRole;

    for (const group of userGroups) {
      const match = mappings.find(
        (m) => m.externalGroupName.toLowerCase() === group.toLowerCase(),
      );
      if (match && roleRank[match.targetRole] > roleRank[highestRole]) {
        // Group mappings can never grant OWNER
        if (match.targetRole !== "OWNER") {
          highestRole = match.targetRole;
        }
      }
    }

    return highestRole;
  }

  private verifyJwtToken(
    token: string,
    ssoConfig: SsoConfigurationRecord,
    expectedNonce: string,
    publicKeyPem?: string,
  ): Record<string, any> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT token format.");
    }

    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );

    // Verify Algorithm
    if (header.alg === "none") {
      throw new Error("Unsafe JWT signing algorithm 'none' is rejected.");
    }

    // Verify Issuer
    if (ssoConfig.issuerUrl && payload.iss !== ssoConfig.issuerUrl) {
      throw new Error(
        `Invalid token issuer: expected '${ssoConfig.issuerUrl}', got '${payload.iss}'.`,
      );
    }

    // Verify Audience
    if (ssoConfig.clientId) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(ssoConfig.clientId)) {
        throw new Error(
          `Invalid token audience: client ID '${ssoConfig.clientId}' not in token audience.`,
        );
      }
    }

    // Verify Expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error("OIDC token has expired.");
    }

    // Verify Nonce
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new Error(
        "Invalid OIDC nonce. Potential replay or token substitution attack.",
      );
    }

    // If RSA public key PEM is provided, verify signature
    if (publicKeyPem && header.alg === "RS256") {
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(`${parts[0]}.${parts[1]}`);
      const valid = verifier.verify(
        publicKeyPem,
        Buffer.from(parts[2], "base64url"),
      );
      if (!valid) {
        throw new Error(
          "Invalid JWT signature. Provider key verification failed.",
        );
      }
    }

    return payload;
  }

  private verifySamlXmlSignature(xml: string, certPem: string): void {
    const sigValueMatch = xml.match(
      /<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/,
    );
    const signedInfoMatch = xml.match(
      /<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/,
    );

    if (!sigValueMatch || !signedInfoMatch) {
      throw new Error("SAML Assertion signature element missing.");
    }

    try {
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(signedInfoMatch[0]);
      const valid = verifier.verify(
        certPem,
        Buffer.from(sigValueMatch[1].replace(/\s+/g, ""), "base64"),
      );
      if (!valid) {
        throw new Error(
          "SAML XML signature verification failed against configured identity provider certificate.",
        );
      }
    } catch (err: any) {
      if (err.message.includes("signature verification failed")) throw err;
      throw new Error(`SAML signature validation error: ${err.message}`);
    }
  }

  private extractSamlAttributes(xml: string): Record<string, any> {
    const attrs: Record<string, any> = {};
    const attrRegex =
      /<saml:Attribute[^>]*Name="([^"]+)"[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>[\s\S]*?<\/saml:Attribute>/g;

    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(xml)) !== null) {
      const name = match[1];
      const val = match[2].trim();
      if (attrs[name]) {
        if (Array.isArray(attrs[name])) {
          attrs[name].push(val);
        } else {
          attrs[name] = [attrs[name], val];
        }
      } else {
        attrs[name] = val;
      }
    }

    return attrs;
  }
}

export const identityService = new IdentityService();
