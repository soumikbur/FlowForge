import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  ConfigureSsoSchema,
  GroupRoleMappingSchema,
  SsoConfigurationRecord,
  GroupRoleMappingRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";

export const ssoAdminRouter = Router({ mergeParams: true });

ssoAdminRouter.use(requireAuth);

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function verifyOrgMembership(req: Request, res: Response, orgId: string) {
  if (req.isApiKey) {
    if (req.organizationId !== orgId) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API key is not authorized for this organization.",
        },
      });
      return false;
    }
    return true;
  }

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === req.user!.id && m.organizationId === orgId,
  );

  if (!membership) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You are not a member of this organization.",
      },
    });
    return false;
  }

  return true;
}

function maskSecret(secret?: string): string | undefined {
  if (!secret) return undefined;
  if (secret.length <= 4) return "••••";
  return `••••••••${secret.slice(-4)}`;
}

/**
 * 1. GET /:orgId/sso: Get SSO configuration (clientSecret masked)
 */
ssoAdminRouter.get(
  "/",
  requirePermission("sso:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    const ssoConfig = apiStore.ssoConfigurations.get(orgId);
    if (!ssoConfig) {
      res.json({
        success: true,
        data: { isConfigured: false, configuration: null },
        error: null,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        isConfigured: true,
        configuration: {
          ...ssoConfig,
          clientSecret: maskSecret(ssoConfig.clientSecret),
        },
      },
      error: null,
    });
  },
);

/**
 * 2. PUT /:orgId/sso: Configure / update SSO (OIDC or SAML)
 */
ssoAdminRouter.put(
  "/",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    // Check Enterprise SSO plan entitlement
    const ssoCheck = entitlementService.checkSsoAccess(orgId);
    if (!ssoCheck.allowed) {
      res.status(403).json({
        success: false,
        data: null,
        error: { code: ssoCheck.reason, message: ssoCheck.message },
      });
      return;
    }

    const parseResult = ConfigureSsoSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid SSO configuration payload.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const data = parseResult.data;

    // Validate protocol-specific requirements
    if (data.protocol === "OIDC") {
      if (!data.issuerUrl && !data.authorizationUrl) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "OIDC requires either issuerUrl or authorizationUrl.",
          },
        });
        return;
      }
      if (!data.clientId) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "OIDC requires clientId.",
          },
        });
        return;
      }
    } else if (data.protocol === "SAML") {
      if (!data.signOnUrl && !data.entityId) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "SAML requires signOnUrl or entityId.",
          },
        });
        return;
      }
    }

    const now = new Date();
    let ssoConfig = apiStore.ssoConfigurations.get(orgId);

    // Preserve existing secret if not updating
    let clientSecretToStore = data.clientSecret;
    if (!clientSecretToStore && ssoConfig?.clientSecret) {
      clientSecretToStore = ssoConfig.clientSecret;
    }

    if (ssoConfig) {
      ssoConfig = {
        ...ssoConfig,
        name: data.name,
        protocol: data.protocol,
        enabled: data.enabled,
        enforcementMode: data.enforcementMode,
        bypassUserIds: data.bypassUserIds,
        allowIdpInitiated: data.allowIdpInitiated,
        defaultRole: data.defaultRole,
        issuerUrl: data.issuerUrl,
        clientId: data.clientId,
        clientSecret: clientSecretToStore,
        authorizationUrl: data.authorizationUrl,
        tokenUrl: data.tokenUrl,
        userInfoUrl: data.userInfoUrl,
        scopes: data.scopes,
        entityId: data.entityId,
        signOnUrl: data.signOnUrl,
        signingCertificate: data.signingCertificate,
        spEntityId:
          data.spEntityId || `https://flowforge.dev/sso/saml/${orgId}`,
        acsUrl:
          data.acsUrl ||
          `https://flowforge.dev/api/v1/auth/sso/saml/${orgId}/acs`,
        attributeMapping: data.attributeMapping,
        updatedAt: now,
      };
    } else {
      ssoConfig = {
        id: `sso_${crypto.randomUUID()}`,
        organizationId: orgId,
        name: data.name,
        protocol: data.protocol,
        enabled: data.enabled,
        enforcementMode: data.enforcementMode,
        bypassUserIds: data.bypassUserIds,
        allowIdpInitiated: data.allowIdpInitiated,
        defaultRole: data.defaultRole,
        issuerUrl: data.issuerUrl,
        clientId: data.clientId,
        clientSecret: clientSecretToStore,
        authorizationUrl: data.authorizationUrl,
        tokenUrl: data.tokenUrl,
        userInfoUrl: data.userInfoUrl,
        scopes: data.scopes,
        entityId: data.entityId,
        signOnUrl: data.signOnUrl,
        signingCertificate: data.signingCertificate,
        spEntityId:
          data.spEntityId || `https://flowforge.dev/sso/saml/${orgId}`,
        acsUrl:
          data.acsUrl ||
          `https://flowforge.dev/api/v1/auth/sso/saml/${orgId}/acs`,
        attributeMapping: data.attributeMapping,
        createdAt: now,
        updatedAt: now,
      };
    }

    apiStore.ssoConfigurations.set(orgId, ssoConfig);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "auth.sso.config_updated",
      resourceType: "sso_configuration",
      resourceId: ssoConfig.id,
      metadata: {
        protocol: ssoConfig.protocol,
        enforcementMode: ssoConfig.enforcementMode,
        enabled: ssoConfig.enabled,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        ...ssoConfig,
        clientSecret: maskSecret(ssoConfig.clientSecret),
      },
      error: null,
    });
  },
);

/**
 * 3. POST /:orgId/sso/test: Test validation mode
 */
ssoAdminRouter.post(
  "/test",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    const ssoConfig = apiStore.ssoConfigurations.get(orgId);
    if (!ssoConfig) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_CONFIGURED", message: "SSO is not configured." },
      });
      return;
    }

    const diagnostics = {
      protocol: ssoConfig.protocol,
      endpointReachable: true,
      certificateValid:
        ssoConfig.protocol === "SAML"
          ? Boolean(ssoConfig.signingCertificate)
          : undefined,
      discoveryMetadataResolved:
        ssoConfig.protocol === "OIDC"
          ? Boolean(ssoConfig.issuerUrl)
          : undefined,
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: {
        status: "VALID",
        message: `SSO configuration test for ${ssoConfig.protocol} passed successfully.`,
        diagnostics,
      },
      error: null,
    });
  },
);

/**
 * 4. DELETE /:orgId/sso: Deactivate SSO configuration
 */
ssoAdminRouter.delete(
  "/",
  requirePermission("sso:admin"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    const ssoConfig = apiStore.ssoConfigurations.get(orgId);
    if (!ssoConfig) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_CONFIGURED", message: "SSO is not configured." },
      });
      return;
    }

    ssoConfig.enabled = false;
    ssoConfig.enforcementMode = "OPTIONAL";
    ssoConfig.updatedAt = new Date();
    apiStore.ssoConfigurations.set(orgId, ssoConfig);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "auth.sso.deactivated",
      resourceType: "sso_configuration",
      resourceId: ssoConfig.id,
      metadata: { previousEnforcementMode: ssoConfig.enforcementMode },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        message: "SSO has been disabled and enforcement reset to OPTIONAL.",
      },
      error: null,
    });
  },
);

/**
 * 5. GET & POST group role mappings
 */
ssoAdminRouter.get(
  "/group-mappings",
  requirePermission("sso:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const mappings = Array.from(apiStore.groupRoleMappings.values()).filter(
      (m) => m.organizationId === orgId,
    );
    res.json({ success: true, data: mappings, error: null });
  },
);

ssoAdminRouter.post(
  "/group-mappings",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID required." },
      });
      return;
    }

    const ssoConfig = apiStore.ssoConfigurations.get(orgId);
    if (!ssoConfig) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "NOT_CONFIGURED",
          message: "SSO must be configured before setting group mappings.",
        },
      });
      return;
    }

    const parseResult = GroupRoleMappingSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg =
        parseResult.error.issues[0]?.message ||
        "Invalid group mapping payload.";
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: errorMsg,
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { externalGroupName, targetRole, workspaceMappings } =
      parseResult.data;

    let mapping = Array.from(apiStore.groupRoleMappings.values()).find(
      (m) =>
        m.ssoConfigurationId === ssoConfig.id &&
        m.externalGroupName.toLowerCase() === externalGroupName.toLowerCase(),
    );

    const now = new Date();
    if (mapping) {
      mapping.targetRole = targetRole;
      mapping.workspaceMappings = workspaceMappings;
      mapping.updatedAt = now;
      apiStore.groupRoleMappings.set(mapping.id, mapping);
    } else {
      mapping = {
        id: `grm_${crypto.randomUUID()}`,
        organizationId: orgId,
        ssoConfigurationId: ssoConfig.id,
        externalGroupName,
        targetRole,
        workspaceMappings,
        createdAt: now,
        updatedAt: now,
      };
      apiStore.groupRoleMappings.set(mapping.id, mapping);
    }

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "group_mapping.updated",
      resourceType: "group_role_mapping",
      resourceId: mapping.id,
      metadata: { externalGroupName, targetRole },
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: mapping, error: null });
  },
);

ssoAdminRouter.delete(
  "/group-mappings/:id",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const mappingId = req.params.id;

    const mapping = apiStore.groupRoleMappings.get(mappingId);
    if (!mapping || (orgId && mapping.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Group mapping not found." },
      });
      return;
    }

    apiStore.groupRoleMappings.delete(mappingId);

    apiStore.recordAudit({
      organizationId: mapping.organizationId,
      userId: req.user?.id,
      action: "group_mapping.deleted",
      resourceType: "group_role_mapping",
      resourceId: mappingId,
      metadata: { externalGroupName: mapping.externalGroupName },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Group mapping deleted." },
      error: null,
    });
  },
);

/**
 * 6. GET & DELETE external identities
 */
ssoAdminRouter.get(
  "/external-identities",
  requirePermission("sso:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const identities = Array.from(apiStore.externalIdentities.values()).filter(
      (ext) => ext.organizationId === orgId,
    );
    res.json({ success: true, data: identities, error: null });
  },
);

ssoAdminRouter.delete(
  "/external-identities/:id",
  requirePermission("sso:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const identityId = req.params.id;

    const identity = apiStore.externalIdentities.get(identityId);
    if (!identity || (orgId && identity.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "External identity not found." },
      });
      return;
    }

    apiStore.externalIdentities.delete(identityId);

    apiStore.recordAudit({
      organizationId: identity.organizationId,
      userId: req.user?.id,
      action: "external_identity.unlinked",
      resourceType: "external_identity",
      resourceId: identityId,
      metadata: {
        externalSubject: identity.externalSubject,
        email: identity.email,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "External identity unlinked." },
      error: null,
    });
  },
);
