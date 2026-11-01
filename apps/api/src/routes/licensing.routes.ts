import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  ApplyEnterpriseLicenseSchema,
  EnterpriseLicenseRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";

export const licensingRouter = Router({ mergeParams: true });

licensingRouter.use(requireAuth);

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
 * 1. GET /:orgId/license: Get current organization enterprise license
 */
licensingRouter.get(
  "/",
  requirePermission("licensing:read"),
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

    const license = apiStore.enterpriseLicenses.get(orgId);
    const effectivePlan = entitlementService.getEffectivePlan(orgId);

    res.json({
      success: true,
      data: {
        hasActiveLicense: Boolean(license && license.status === "ACTIVE"),
        license: license || null,
        effectivePlan: {
          id: effectivePlan.id,
          name: effectivePlan.name,
          entitlements: effectivePlan.entitlements,
        },
      },
      error: null,
    });
  },
);

/**
 * 2. POST /:orgId/license: Apply Enterprise license key
 */
licensingRouter.post(
  "/",
  requirePermission("licensing:write"),
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

    const parseResult = ApplyEnterpriseLicenseSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid enterprise license payload.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { licenseKey, issuedTo, edition, customEntitlements, expiresAt } =
      parseResult.data;

    // Basic license key validation (e.g. must start with FF-ENT- or format check)
    if (!licenseKey.startsWith("FF-ENT-") && licenseKey.length < 16) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_LICENSE_KEY",
          message: "Invalid Enterprise License Key signature format.",
        },
      });
      return;
    }

    // Prevent duplicate license key used across different organizations
    const duplicate = Array.from(apiStore.enterpriseLicenses.values()).find(
      (l) => l.licenseKey === licenseKey && l.organizationId !== orgId,
    );
    if (duplicate) {
      res.status(409).json({
        success: false,
        data: null,
        error: {
          code: "LICENSE_KEY_IN_USE",
          message:
            "This enterprise license key is already assigned to another organization.",
        },
      });
      return;
    }

    const now = new Date();
    const licenseRecord: EnterpriseLicenseRecord = {
      id: `lic_${crypto.randomUUID()}`,
      organizationId: orgId,
      licenseKey,
      issuedTo,
      edition,
      customEntitlements: customEntitlements || {},
      status: "ACTIVE",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.enterpriseLicenses.set(orgId, licenseRecord);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "enterprise_license.applied",
      resourceType: "enterprise_license",
      resourceId: licenseRecord.id,
      metadata: {
        licenseKeyMasked: `${licenseKey.slice(0, 8)}...`,
        issuedTo,
        edition,
      },
      ipAddress: req.ip,
    });

    const updatedPlan = entitlementService.getEffectivePlan(orgId);

    res.status(201).json({
      success: true,
      data: {
        license: licenseRecord,
        effectiveEntitlements: updatedPlan.entitlements,
      },
      error: null,
    });
  },
);
