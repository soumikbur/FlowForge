import { Router, Request, Response } from "express";
import {
  SubmitExtensionPackageSchema,
  ReviewExtensionPackageSchema,
  InstallExtensionSchema,
  UpgradeExtensionSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { extensionService } from "../services/extension.service.js";
import { apiStore } from "../store.js";

export const extensionRouter = Router({ mergeParams: true });

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function getCaller(
  req: Request,
  orgId?: string,
): { userId: string; role: Role } | null {
  if (!req.user) return null;
  if (!orgId) {
    return { userId: req.user.id, role: "OWNER" };
  }
  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.organizationId === orgId && m.userId === req.user!.id,
  );
  if (membership) {
    return { userId: req.user.id, role: membership.role };
  }
  if (req.isApiKey && req.organizationId === orgId && req.role) {
    return { userId: req.user.id, role: req.role };
  }
  return null;
}

extensionRouter.use(requireAuth);

const listPackagesHandler = (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (caller && !hasPermission(caller.role, "extensions:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:read permission.",
      },
    });
  }

  const packages = extensionService.listPackages({
    status: req.query.status as any,
    orgId,
  });

  return res.json({ success: true, data: packages, error: null });
};

/**
 * 1. GET /catalog or GET /: List extension packages
 */
extensionRouter.get("/", listPackagesHandler);
extensionRouter.get("/catalog", listPackagesHandler);

/**
 * 2. GET /installed: List installed extensions for organization
 */
extensionRouter.get("/installed", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "extensions:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:read permission.",
      },
    });
  }

  const installed = extensionService.listInstalledExtensions(orgId);
  return res.json({ success: true, data: installed, error: null });
});

/**
 * 3. GET /installed/:extensionId: Get installed extension details
 */
extensionRouter.get(
  "/installed/:extensionId",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "extensions:read")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires extensions:read permission.",
        },
      });
    }

    const inst = extensionService.getInstalledExtension(
      orgId,
      req.params.extensionId,
    );
    if (!inst) {
      return res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Extension is not installed in this organization.",
        },
      });
    }

    return res.json({ success: true, data: inst, error: null });
  },
);

/**
 * 4. POST /submit: Submit extension package for review
 */
extensionRouter.post("/submit", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (
    !caller ||
    (!hasPermission(caller.role, "extensions:submit") &&
      !hasPermission(caller.role, "extensions:write"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:submit permission.",
      },
    });
  }

  const parseResult = SubmitExtensionPackageSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid extension package submission.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const pkg = await extensionService.submitPackage(
      parseResult.data,
      caller.userId,
      orgId,
    );

    return res.status(201).json({ success: true, data: pkg, error: null });
  } catch (err: any) {
    const isConflict = err.message.includes("CONFLICT");
    const isUnauthorized = err.message.includes("UNAUTHORIZED_PUBLISHER");
    const statusCode = isConflict ? 409 : isUnauthorized ? 403 : 400;

    return res.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code: isConflict
          ? "CONFLICT"
          : isUnauthorized
            ? "FORBIDDEN"
            : "SUBMISSION_ERROR",
        message: err.message,
      },
    });
  }
});

/**
 * 5. POST /:id/review: Administrative review (approve or reject)
 */
extensionRouter.post("/:id/review", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (!caller || !hasPermission(caller.role, "extensions:admin")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:admin permission.",
      },
    });
  }

  const parseResult = ReviewExtensionPackageSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid review specification.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const reviewed = await extensionService.reviewPackage(
      req.params.id,
      parseResult.data,
      caller.userId,
    );

    return res.json({ success: true, data: reviewed, error: null });
  } catch (err: any) {
    const isNotFound = err.message.includes("NOT_FOUND");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      data: null,
      error: {
        code: isNotFound ? "NOT_FOUND" : "REVIEW_ERROR",
        message: err.message,
      },
    });
  }
});

/**
 * 6. POST /:id/install: Install extension for tenant
 */
extensionRouter.post("/:id/install", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (
    !caller ||
    (!hasPermission(caller.role, "extensions:admin") &&
      !hasPermission(caller.role, "org:write"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:admin or org:write permission.",
      },
    });
  }

  const parseResult = InstallExtensionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid installation parameters.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const installation = await extensionService.installExtension(
      orgId,
      req.params.id,
      parseResult.data,
      caller.userId,
    );

    return res
      .status(201)
      .json({ success: true, data: installation, error: null });
  } catch (err: any) {
    const isNotFound = err.message.includes("NOT_FOUND");
    const isUnavailable = err.message.includes("UNAVAILABLE");
    const isCapUndeclared = err.message.includes("CAPABILITY_NOT_DECLARED");
    const isPkgNotApproved = err.message.includes("PACKAGE_NOT_APPROVED");
    const statusCode = isNotFound ? 404 : isUnavailable ? 409 : 400;

    return res.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code: isNotFound
          ? "NOT_FOUND"
          : isUnavailable
            ? "UNAVAILABLE"
            : isCapUndeclared
              ? "CAPABILITY_NOT_DECLARED"
              : isPkgNotApproved
                ? "PACKAGE_NOT_APPROVED"
                : "INSTALLATION_ERROR",
        message: err.message,
      },
    });
  }
});

/**
 * 7. POST /installed/:extensionId/suspend: Suspend extension
 */
extensionRouter.post(
  "/installed/:extensionId/suspend",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "extensions:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires extensions:admin permission.",
        },
      });
    }

    try {
      const inst = await extensionService.suspendInstallation(
        orgId,
        req.params.extensionId,
        caller.userId,
      );

      return res.json({ success: true, data: inst, error: null });
    } catch (err: any) {
      const isNotFound = err.message.includes("NOT_FOUND");
      return res.status(isNotFound ? 404 : 500).json({
        success: false,
        data: null,
        error: {
          code: isNotFound ? "NOT_FOUND" : "SUSPENSION_ERROR",
          message: err.message,
        },
      });
    }
  },
);

/**
 * 8. POST /installed/:extensionId/reactivate: Reactivate suspended extension
 */
extensionRouter.post(
  "/installed/:extensionId/reactivate",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "extensions:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires extensions:admin permission.",
        },
      });
    }

    try {
      const inst = await extensionService.reactivateInstallation(
        orgId,
        req.params.extensionId,
        caller.userId,
      );

      return res.json({ success: true, data: inst, error: null });
    } catch (err: any) {
      const isNotFound = err.message.includes("NOT_FOUND");
      return res.status(isNotFound ? 404 : 500).json({
        success: false,
        data: null,
        error: {
          code: isNotFound ? "NOT_FOUND" : "REACTIVATION_ERROR",
          message: err.message,
        },
      });
    }
  },
);

/**
 * 9. DELETE /installed/:extensionId: Uninstall extension
 */
extensionRouter.delete(
  "/installed/:extensionId",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "extensions:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires extensions:admin permission.",
        },
      });
    }

    try {
      await extensionService.uninstallExtension(
        orgId,
        req.params.extensionId,
        caller.userId,
      );
      return res.json({
        success: true,
        data: { deleted: true, message: "Extension uninstalled successfully." },
        error: null,
      });
    } catch (err: any) {
      const isNotFound = err.message.includes("NOT_FOUND");
      return res.status(isNotFound ? 404 : 500).json({
        success: false,
        data: null,
        error: {
          code: isNotFound ? "NOT_FOUND" : "UNINSTALL_ERROR",
          message: err.message,
        },
      });
    }
  },
);

/**
 * 10. GET & POST /installed/:extensionId/upgrade-preview: Preview upgrade impact
 */
const upgradePreviewHandler = async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "extensions:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:read permission.",
      },
    });
  }

  const targetVersion = (req.body?.targetVersion ||
    req.query.targetVersion) as string;
  if (!targetVersion) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "targetVersion is required.",
      },
    });
  }

  try {
    const preview = await extensionService.previewUpgrade(
      orgId,
      req.params.extensionId,
      targetVersion,
    );

    return res.json({ success: true, data: preview, error: null });
  } catch (err: any) {
    const isNotFound = err.message.includes("NOT_FOUND");
    return res.status(isNotFound ? 404 : 400).json({
      success: false,
      data: null,
      error: {
        code: isNotFound ? "NOT_FOUND" : "UPGRADE_PREVIEW_ERROR",
        message: err.message,
      },
    });
  }
};

extensionRouter.get(
  "/installed/:extensionId/upgrade-preview",
  upgradePreviewHandler,
);
extensionRouter.post(
  "/installed/:extensionId/upgrade-preview",
  upgradePreviewHandler,
);

/**
 * 11. POST /installed/:extensionId/upgrade: Upgrade installed extension
 */
extensionRouter.post(
  "/installed/:extensionId/upgrade",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (!caller || !hasPermission(caller.role, "extensions:admin")) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires extensions:admin permission.",
        },
      });
    }

    const parseResult = UpgradeExtensionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid upgrade parameters.",
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const upgraded = await extensionService.upgradeInstallation(
        orgId,
        req.params.extensionId,
        parseResult.data,
        caller.userId,
      );

      return res.json({ success: true, data: upgraded, error: null });
    } catch (err: any) {
      const isNotFound = err.message.includes("NOT_FOUND");
      return res.status(isNotFound ? 404 : 400).json({
        success: false,
        data: null,
        error: {
          code: isNotFound ? "NOT_FOUND" : "UPGRADE_ERROR",
          message: err.message,
        },
      });
    }
  },
);

/**
 * 12. POST /execute/:extensionId/:nodeType: Execute custom node test
 */
extensionRouter.post(
  "/execute/:extensionId/:nodeType",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "workflow:execute") &&
        !hasPermission(caller.role, "extensions:write"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires workflow:execute or extensions:write permission.",
        },
      });
    }

    const { parameters, connectionId, timeoutSeconds } = req.body || {};

    const outcome = await extensionService.executeCustomNode(
      orgId,
      req.params.extensionId,
      req.params.nodeType,
      parameters || {},
      {
        executionId: `exec_test_${Date.now()}`,
        stepId: `step_${Date.now()}`,
        connectionId,
        timeoutSeconds,
      },
    );

    if (!outcome.success) {
      const isCapDenied = outcome.error?.includes("CAPABILITY_DENIED");
      const isSuspended = outcome.error?.includes("EXTENSION_SUSPENDED");
      const isNotInstalled = outcome.error?.includes("EXTENSION_NOT_INSTALLED");
      const statusCode =
        isCapDenied || isSuspended ? 403 : isNotInstalled ? 404 : 500;

      return res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: isCapDenied
            ? "CAPABILITY_DENIED"
            : isSuspended
              ? "EXTENSION_SUSPENDED"
              : isNotInstalled
                ? "NOT_FOUND"
                : "EXECUTION_ERROR",
          message: outcome.error,
          isRetryable: outcome.isRetryable,
        },
      });
    }

    return res.json({ success: true, data: outcome.data, error: null });
  },
);

/**
 * 13. GET /:id: Inspect extension package and declared node types
 */
extensionRouter.get("/:id", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const caller = getCaller(req, orgId);

  if (caller && !hasPermission(caller.role, "extensions:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires extensions:read permission.",
      },
    });
  }

  const pkg = extensionService.getPackage(req.params.id);
  if (!pkg) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Extension package not found." },
    });
  }

  // Tenant privacy check
  if (!pkg.isPublic && pkg.organizationId && pkg.organizationId !== orgId) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Access denied to private extension package.",
      },
    });
  }

  const versions = Array.from(apiStore.extensionVersions.values()).filter(
    (v) => v.extensionId === pkg.id,
  );

  return res.json({
    success: true,
    data: {
      ...pkg,
      versions,
    },
    error: null,
  });
});
