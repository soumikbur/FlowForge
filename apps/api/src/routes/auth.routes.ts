import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ROLE_PERMISSIONS,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { identityService } from "../services/identity.service.js";

export const authRouter = Router();

// Register new user & primary organization
authRouter.post("/register", async (req, res) => {
  const parseResult = RegisterRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid registration details",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { email, password, firstName, lastName, organizationName } =
    parseResult.data;

  // Check existing user
  const existingUser = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (existingUser) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: "USER_EXISTS",
        message: "A user with this email address already exists.",
      },
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = `usr_${crypto.randomUUID()}`;
  const orgId = `org_${crypto.randomUUID()}`;

  apiStore.users.set(userId, {
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
  });

  const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  apiStore.organizations.set(orgId, {
    id: orgId,
    name: organizationName,
    slug,
  });

  const membershipId = `mem_${crypto.randomUUID()}`;
  apiStore.memberships.set(membershipId, {
    id: membershipId,
    organizationId: orgId,
    userId,
    role: "OWNER",
  });

  // Create session
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  apiStore.sessions.set(sessionId, {
    id: sessionId,
    userId,
    token,
    expiresAt,
  });

  res.cookie("flowforge_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });

  res.status(201).json({
    success: true,
    data: {
      user: { id: userId, email, firstName, lastName },
      organization: { id: orgId, name: organizationName, slug, role: "OWNER" },
      token,
    },
    error: null,
  });
});

// Login
authRouter.post("/login", async (req, res) => {
  const parseResult = LoginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid credentials provided",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { email, password } = parseResult.data;
  const user = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });
    return;
  }

  // Check SSO enforcement policy & account deactivation
  try {
    const enforcement = identityService.checkLocalLoginEnforcement(user);
    if (enforcement.enforced) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "SSO_REQUIRED",
          message: `Single Sign-On is enforced for your organization (${enforcement.organizationName}). Please sign in through your identity provider.`,
          details: {
            organizationId: enforcement.organizationId,
            ssoUrl: enforcement.ssoUrl,
          },
        },
      });
      return;
    }
  } catch (err: any) {
    if (err.code === "ACCOUNT_DISABLED") {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "ACCOUNT_DISABLED",
          message: err.message,
        },
      });
      return;
    }
    throw err;
  }

  // Create session
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  apiStore.sessions.set(sessionId, {
    id: sessionId,
    userId: user.id,
    token,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] as string,
    lastActivityAt: new Date(),
    expiresAt,
  });

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === user.id,
  );
  const org = membership
    ? apiStore.organizations.get(membership.organizationId)
    : null;

  res.cookie("flowforge_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: org
        ? { id: org.id, name: org.name, slug: org.slug, role: membership?.role }
        : null,
      token,
    },
    error: null,
  });
});

// Logout
authRouter.post("/logout", requireAuth, (req, res) => {
  const token =
    req.cookies?.flowforge_session ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token) {
    const session = Array.from(apiStore.sessions.values()).find(
      (s) => s.token === token,
    );
    if (session) {
      apiStore.sessions.delete(session.id);
    }
  }

  res.clearCookie("flowforge_session");
  res.json({
    success: true,
    data: { message: "Logged out successfully." },
    error: null,
  });
});

// Current User & Active Organization
authRouter.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  const org = req.organizationId
    ? apiStore.organizations.get(req.organizationId)
    : null;
  const role = req.role;
  const permissions = role ? ROLE_PERMISSIONS[role] : [];

  res.json({
    success: true,
    data: {
      user,
      organization: org
        ? { id: org.id, name: org.name, slug: org.slug, role }
        : null,
      permissions,
    },
    error: null,
  });
});

// ==========================================
// ENTERPRISE SSO AUTHENTICATION FLOWS
// ==========================================

/**
 * 1. SSO Discovery: Find organization SSO config by user email or domain
 */
authRouter.get("/sso/discover", (req, res) => {
  const email = ((req.query.email as string) || "").toLowerCase().trim();
  const domain = email.includes("@") ? email.split("@")[1] : email;

  if (!domain) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Email or domain required." },
    });
    return;
  }

  // Look for verified custom domain or organization with matching SSO
  const customDomain = Array.from(apiStore.customDomains.values()).find(
    (cd) =>
      cd.domain.toLowerCase() === domain &&
      cd.verificationStatus === "VERIFIED",
  );

  let targetOrgId = customDomain?.organizationId;
  if (!targetOrgId) {
    // Try matching user email domain against registered organization members
    const matchingUser = Array.from(apiStore.users.values()).find((u) =>
      u.email.endsWith(`@${domain}`),
    );
    if (matchingUser) {
      const mem = Array.from(apiStore.memberships.values()).find(
        (m) => m.userId === matchingUser.id,
      );
      if (mem) targetOrgId = mem.organizationId;
    }
  }

  if (!targetOrgId) {
    res.json({ success: true, data: { ssoAvailable: false }, error: null });
    return;
  }

  const ssoConfig = apiStore.ssoConfigurations.get(targetOrgId);
  if (!ssoConfig || !ssoConfig.enabled) {
    res.json({ success: true, data: { ssoAvailable: false }, error: null });
    return;
  }

  res.json({
    success: true,
    data: {
      ssoAvailable: true,
      organizationId: targetOrgId,
      protocol: ssoConfig.protocol,
      enforcementMode: ssoConfig.enforcementMode,
      loginUrl: `/api/v1/auth/sso/login?organizationId=${targetOrgId}`,
    },
    error: null,
  });
});

/**
 * 2. SSO Login Entrypoint: Routes to OIDC or SAML flow
 */
authRouter.get("/sso/login", (req, res) => {
  const orgId = req.query.organizationId as string;
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "organizationId is required." },
    });
    return;
  }

  const ssoConfig = apiStore.ssoConfigurations.get(orgId);
  if (!ssoConfig || !ssoConfig.enabled) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "SSO_NOT_CONFIGURED",
        message: "SSO is not enabled for this organization.",
      },
    });
    return;
  }

  if (ssoConfig.protocol === "OIDC") {
    const redirectUri =
      (req.query.redirectUri as string) ||
      `${req.protocol}://${req.get("host")}/api/v1/auth/sso/oidc/callback`;
    const init = identityService.initiateOidc(ssoConfig, redirectUri);
    res.json({
      success: true,
      data: {
        protocol: "OIDC",
        authorizationUrl: init.authorizationUrl,
        state: init.state,
      },
      error: null,
    });
  } else {
    const init = identityService.initiateSaml(
      ssoConfig,
      req.query.relayState as string,
    );
    res.json({
      success: true,
      data: {
        protocol: "SAML",
        signOnUrl: init.signOnUrl,
        requestId: init.requestId,
        relayState: init.relayState,
      },
      error: null,
    });
  }
});

/**
 * 3. OIDC Authorize: Direct redirect to provider
 */
authRouter.get("/sso/oidc/authorize", (req, res) => {
  const orgId = req.query.organizationId as string;
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "organizationId is required." },
    });
    return;
  }

  const ssoConfig = apiStore.ssoConfigurations.get(orgId);
  if (!ssoConfig || !ssoConfig.enabled || ssoConfig.protocol !== "OIDC") {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "OIDC_NOT_CONFIGURED",
        message: "OIDC is not enabled for this organization.",
      },
    });
    return;
  }

  const redirectUri =
    (req.query.redirectUri as string) ||
    `${req.protocol}://${req.get("host")}/api/v1/auth/sso/oidc/callback`;
  const init = identityService.initiateOidc(ssoConfig, redirectUri);
  res.redirect(init.authorizationUrl);
});

/**
 * 4. OIDC Callback: Validate state, nonce, ID token, resolve user & set session
 */
const handleOidcCallbackRoute = async (req: any, res: any) => {
  const state = req.body?.state || req.query?.state;
  const code = req.body?.code || req.query?.code;
  const idToken =
    req.body?.id_token || req.body?.idToken || req.query?.id_token;
  const claims = req.body?.claims;
  const publicKeyPem = req.body?.publicKeyPem;

  if (!state) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_STATE",
        message: "State parameter is required.",
      },
    });
    return;
  }

  try {
    const result = await identityService.handleOidcCallback({
      state,
      code,
      idToken,
      claims,
      publicKeyPem,
      clientIp: req.ip,
    });

    res.cookie("flowforge_session", result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.session.expiresAt,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
        },
        token: result.session.token,
        isNewUser: result.isNewUser,
      },
      error: null,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "OIDC_AUTH_FAILED", message: err.message },
    });
  }
};

authRouter.post("/sso/oidc/callback", handleOidcCallbackRoute);
authRouter.get("/sso/oidc/callback", handleOidcCallbackRoute);

/**
 * 5. SAML SP Metadata
 */
authRouter.get("/sso/saml/:orgId/metadata", (req, res) => {
  const orgId = req.params.orgId;
  const ssoConfig = apiStore.ssoConfigurations.get(orgId);

  if (!ssoConfig || ssoConfig.protocol !== "SAML") {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "SAML_NOT_CONFIGURED",
        message: "SAML is not configured for this organization.",
      },
    });
    return;
  }

  const xml = identityService.generateSpMetadata(ssoConfig);
  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

/**
 * 6. SAML Login: Initiates AuthnRequest
 */
authRouter.get("/sso/saml/:orgId/login", (req, res) => {
  const orgId = req.params.orgId;
  const ssoConfig = apiStore.ssoConfigurations.get(orgId);

  if (!ssoConfig || !ssoConfig.enabled || ssoConfig.protocol !== "SAML") {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "SAML_NOT_CONFIGURED",
        message: "SAML is not configured for this organization.",
      },
    });
    return;
  }

  const init = identityService.initiateSaml(
    ssoConfig,
    req.query.relayState as string,
  );
  res.redirect(init.signOnUrl);
});

/**
 * 7. SAML ACS: Process AssertionConsumerService POST
 */
authRouter.post("/sso/saml/:orgId/acs", async (req, res) => {
  const orgId = req.params.orgId;
  const samlResponse =
    req.body?.SAMLResponse || req.body?.samlResponse || req.body?.xml;
  const relayState = req.body?.RelayState || req.body?.relayState;

  if (!samlResponse) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "MISSING_SAML_RESPONSE",
        message: "SAMLResponse payload is required.",
      },
    });
    return;
  }

  try {
    const result = await identityService.handleSamlAcs({
      samlResponseXmlOrBase64: samlResponse,
      organizationId: orgId,
      relayState,
      clientIp: req.ip,
    });

    res.cookie("flowforge_session", result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.session.expiresAt,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
        },
        token: result.session.token,
        isNewUser: result.isNewUser,
      },
      error: null,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "SAML_AUTH_FAILED", message: err.message },
    });
  }
});
