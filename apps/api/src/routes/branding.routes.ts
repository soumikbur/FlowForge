import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  OrganizationBrandingSchema,
  OrganizationBrandingRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";

export const brandingRouter = Router({ mergeParams: true });

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

const DEFAULT_BRANDING = {
  productName: "FlowForge",
  companyName: "FlowForge Inc.",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#0d9488",
  secondaryColor: "#0f172a",
  accentColor: "#14b8a6",
  supportEmail: "",
  documentationUrl: "",
  customFooterText: "Powered by FlowForge",
  loginMessage: "Sign in to your workflow workspace",
  emailSenderName: "FlowForge Automation",
  emailSenderAddress: "notifications@flowforge.dev",
};

/**
 * 1. Public Domain / Host Resolver: GET /resolve?domain=<fqdn>
 */
brandingRouter.get("/resolve", (req: Request, res: Response) => {
  const domain = ((req.query.domain as string) || "").toLowerCase().trim();
  if (!domain) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "BAD_REQUEST",
        message: "Domain query parameter is required.",
      },
    });
    return;
  }

  // Check custom domain registry
  const customDomain = Array.from(apiStore.customDomains.values()).find(
    (cd) =>
      cd.domain.toLowerCase() === domain &&
      cd.verificationStatus === "VERIFIED",
  );

  let orgId = customDomain?.organizationId;

  // Fallback: check if domain is an org slug e.g. acme.flowforge.dev
  if (!orgId) {
    const slug = domain.split(".")[0];
    const org = Array.from(apiStore.organizations.values()).find(
      (o) => o.slug.toLowerCase() === slug,
    );
    if (org) orgId = org.id;
  }

  if (!orgId) {
    res.json({
      success: true,
      data: {
        isCustomBranded: false,
        branding: DEFAULT_BRANDING,
      },
      error: null,
    });
    return;
  }

  const branding = apiStore.brandings.get(orgId);
  res.json({
    success: true,
    data: {
      organizationId: orgId,
      isCustomBranded: Boolean(branding),
      branding: branding
        ? { ...DEFAULT_BRANDING, ...branding }
        : DEFAULT_BRANDING,
    },
    error: null,
  });
});

/**
 * 2. GET /: Get organization branding (Returns defaults if not configured)
 */
const getBrandingHandler = (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
    return;
  }

  const org = apiStore.organizations.get(orgId);
  if (!org) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Organization not found." },
    });
    return;
  }

  const branding = apiStore.brandings.get(orgId);
  res.json({
    success: true,
    data: branding || {
      id: `default_${orgId}`,
      organizationId: orgId,
      ...DEFAULT_BRANDING,
      createdAt: org.createdAt || new Date(),
      updatedAt: org.updatedAt || new Date(),
    },
    error: null,
  });
};

brandingRouter.get("/", getBrandingHandler);
brandingRouter.get("/:orgId", getBrandingHandler);
brandingRouter.get("/:orgId/branding", getBrandingHandler);

// Protect modifying routes
brandingRouter.use(requireAuth);

/**
 * 3. PUT /: Update or configure organization branding
 */
const updateBrandingHandler = (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
    return;
  }

  const org = apiStore.organizations.get(orgId);
  if (!org) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Organization not found." },
    });
    return;
  }

  // Verify Entitlement for White-Labeling
  const wlCheck = entitlementService.checkWhiteLabelAccess(orgId);
  if (!wlCheck.allowed) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: wlCheck.reason,
        message: wlCheck.message,
      },
    });
    return;
  }

  const parseResult = OrganizationBrandingSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid branding configuration payload.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  // XSS / Malicious payload sanitation
  const sanitizeText = (str?: string) => {
    if (!str) return str;
    return str.replace(/<[^>]*>?/gm, "").trim();
  };

  const data = parseResult.data;
  const now = new Date();
  let branding = apiStore.brandings.get(orgId);

  if (branding) {
    branding = {
      ...branding,
      productName:
        sanitizeText(data.productName) || DEFAULT_BRANDING.productName,
      companyName: sanitizeText(data.companyName),
      logoUrl: data.logoUrl || undefined,
      faviconUrl: data.faviconUrl || undefined,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor: data.accentColor,
      supportEmail: data.supportEmail || undefined,
      documentationUrl: data.documentationUrl || undefined,
      customFooterText: sanitizeText(data.customFooterText),
      loginMessage: sanitizeText(data.loginMessage),
      emailSenderName: sanitizeText(data.emailSenderName),
      emailSenderAddress: data.emailSenderAddress || undefined,
      updatedAt: now,
    };
  } else {
    branding = {
      id: `brd_${crypto.randomUUID()}`,
      organizationId: orgId,
      productName:
        sanitizeText(data.productName) || DEFAULT_BRANDING.productName,
      companyName: sanitizeText(data.companyName),
      logoUrl: data.logoUrl || undefined,
      faviconUrl: data.faviconUrl || undefined,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor: data.accentColor,
      supportEmail: data.supportEmail || undefined,
      documentationUrl: data.documentationUrl || undefined,
      customFooterText: sanitizeText(data.customFooterText),
      loginMessage: sanitizeText(data.loginMessage),
      emailSenderName: sanitizeText(data.emailSenderName),
      emailSenderAddress: data.emailSenderAddress || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  apiStore.brandings.set(orgId, branding);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "organization.branding.updated",
    resourceType: "branding",
    resourceId: branding.id,
    metadata: {
      productName: branding.productName,
      primaryColor: branding.primaryColor,
    },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: branding,
    error: null,
  });
};

brandingRouter.put(
  "/",
  requirePermission("branding:write"),
  updateBrandingHandler,
);
brandingRouter.put(
  "/:orgId",
  requirePermission("branding:write"),
  updateBrandingHandler,
);
brandingRouter.put(
  "/:orgId/branding",
  requirePermission("branding:write"),
  updateBrandingHandler,
);

/**
 * 4. DELETE /: Reset branding to default
 */
const deleteBrandingHandler = (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
    return;
  }

  const branding = apiStore.brandings.get(orgId);
  if (!branding) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Custom branding not configured.",
      },
    });
    return;
  }

  apiStore.brandings.delete(orgId);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "organization.branding.reset",
    resourceType: "branding",
    resourceId: branding.id,
    metadata: { previousProductName: branding.productName },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: { message: "Branding reset to default platform appearance." },
    error: null,
  });
};

brandingRouter.delete(
  "/",
  requirePermission("branding:write"),
  deleteBrandingHandler,
);
brandingRouter.delete(
  "/:orgId",
  requirePermission("branding:write"),
  deleteBrandingHandler,
);
brandingRouter.delete(
  "/:orgId/branding",
  requirePermission("branding:write"),
  deleteBrandingHandler,
);
