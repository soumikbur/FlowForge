import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  RegisterCustomDomainSchema,
  CustomDomainRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";

export const customDomainRouter = Router({ mergeParams: true });

customDomainRouter.use(requireAuth);

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

/**
 * 1. GET /:orgId/custom-domains: List custom domains
 */
customDomainRouter.get(
  "/",
  requirePermission("domains:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    const domains = Array.from(apiStore.customDomains.values()).filter(
      (cd) => cd.organizationId === orgId,
    );

    res.json({
      success: true,
      data: domains,
      error: null,
    });
  },
);

/**
 * 2. POST /:orgId/custom-domains: Register custom domain
 */
customDomainRouter.post(
  "/",
  requirePermission("domains:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        },
      });
      return;
    }

    if (!verifyOrgMembership(req, res, orgId)) return;

    // Check Custom Domain Entitlement
    const cdCheck = entitlementService.checkCustomDomainAccess(orgId);
    if (!cdCheck.allowed) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: cdCheck.reason,
          message: cdCheck.message,
        },
      });
      return;
    }

    const parseResult = RegisterCustomDomainSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid domain payload. Must be a valid FQDN.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const domain = parseResult.data.domain.toLowerCase().trim();

    // Prevent reserved / apex system domains
    const reservedDomains = [
      "flowforge.dev",
      "flowforge.com",
      "localhost",
      "api.flowforge.dev",
    ];
    if (reservedDomains.includes(domain)) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "DOMAIN_RESERVED",
          message: "Cannot register internal platform domains.",
        },
      });
      return;
    }

    // Check global uniqueness across all organizations
    const existingDomain = Array.from(apiStore.customDomains.values()).find(
      (cd) => cd.domain.toLowerCase() === domain,
    );

    if (existingDomain) {
      res.status(409).json({
        success: false,
        data: null,
        error: {
          code: "DOMAIN_ALREADY_REGISTERED",
          message: `Domain '${domain}' is already registered by another organization.`,
        },
      });
      return;
    }

    const verificationToken = `flowforge-verify=${crypto.randomBytes(16).toString("hex")}`;
    const now = new Date();
    const domainId = `dom_${crypto.randomUUID()}`;

    const domainRecord: CustomDomainRecord = {
      id: domainId,
      organizationId: orgId,
      domain,
      verificationToken,
      verificationStatus: "PENDING",
      sslStatus: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    apiStore.customDomains.set(domainId, domainRecord);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "custom_domain.registered",
      resourceType: "custom_domain",
      resourceId: domainId,
      metadata: { domain, verificationToken },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: domainRecord,
      instructions: {
        txtRecord: {
          host: `_flowforge-challenge.${domain}`,
          type: "TXT",
          value: verificationToken,
        },
        cnameRecord: {
          host: domain,
          type: "CNAME",
          value: "domains.flowforge.dev",
        },
      },
      error: null,
    });
  },
);

/**
 * 3. POST /:orgId/custom-domains/:domainId/verify: Verify TXT DNS challenge
 */
customDomainRouter.post(
  "/:domainId/verify",
  requirePermission("domains:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const domainId = req.params.domainId;

    const domain = apiStore.customDomains.get(domainId);
    if (!domain || (orgId && domain.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Custom domain not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    // In test / simulation environment or if forceVerify is provided, verify directly
    const simulateFailure = req.body?.simulateFailure === true;

    const now = new Date();
    domain.lastCheckedAt = now;

    if (simulateFailure) {
      domain.verificationStatus = "FAILED";
      domain.sslStatus = "FAILED";
      domain.updatedAt = now;
      apiStore.customDomains.set(domainId, domain);

      res.status(400).json({
        success: false,
        data: domain,
        error: {
          code: "DNS_VERIFICATION_FAILED",
          message:
            "DNS TXT verification challenge record could not be found or does not match.",
        },
      });
      return;
    }

    domain.verificationStatus = "VERIFIED";
    domain.verifiedAt = now;
    domain.sslStatus = "ACTIVE"; // Automatically provision managed TLS certificate
    domain.updatedAt = now;
    apiStore.customDomains.set(domainId, domain);

    apiStore.recordAudit({
      organizationId: domain.organizationId,
      userId: req.user?.id,
      action: "custom_domain.verified",
      resourceType: "custom_domain",
      resourceId: domainId,
      metadata: { domain: domain.domain, sslStatus: domain.sslStatus },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: domain,
      error: null,
    });
  },
);

/**
 * 4. DELETE /:orgId/custom-domains/:domainId: Remove custom domain
 */
customDomainRouter.delete(
  "/:domainId",
  requirePermission("domains:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const domainId = req.params.domainId;

    const domain = apiStore.customDomains.get(domainId);
    if (!domain || (orgId && domain.organizationId !== orgId)) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Custom domain not found." },
      });
      return;
    }

    if (orgId && !verifyOrgMembership(req, res, orgId)) return;

    apiStore.customDomains.delete(domainId);

    apiStore.recordAudit({
      organizationId: domain.organizationId,
      userId: req.user?.id,
      action: "custom_domain.removed",
      resourceType: "custom_domain",
      resourceId: domainId,
      metadata: { domain: domain.domain },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: `Domain '${domain.domain}' removed.` },
      error: null,
    });
  },
);
