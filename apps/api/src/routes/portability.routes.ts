import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  ConfirmImportWorkflowSchema,
  FlowForgeWorkflowPackageSchema,
  FlowForgeBackupPackageSchema,
} from "@flowforge/shared";
import {
  createWorkflowExportPackage,
  createOrganizationBackupPackage,
  analyzeWorkflowPackageCompatibility,
  applyImportConnectorMappings,
  verifyPackageIntegrity,
} from "@flowforge/workflow-engine";
import { defaultConnectorRegistry } from "@flowforge/integrations";
import { apiStore, WorkflowRecord, WorkflowImportRecord } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { resolveWorkflowAccess } from "../middleware/workflow-access.js";

export const portabilityRouter = Router({ mergeParams: true });

portabilityRouter.use(requireAuth);

/**
 * Helper to get available connector IDs from registry.
 */
function getAvailableConnectorIds(): string[] {
  return defaultConnectorRegistry.list().map((c) => c.id);
}

// ==========================================
// 1. WORKFLOW IMPORT PREVIEW & DRY-RUN
// ==========================================
portabilityRouter.post(
  "/import/preview",
  requirePermission("workflow:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    // Max body size guard (5MB limit check)
    const rawBodyLength = req.headers["content-length"]
      ? parseInt(req.headers["content-length"], 10)
      : 0;
    if (rawBodyLength > 5 * 1024 * 1024) {
      res.status(413).json({
        success: false,
        data: null,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Package file exceeds maximum limit of 5MB.",
        },
      });
      return;
    }

    const packageData = req.body?.package || req.body;
    if (!packageData || typeof packageData !== "object") {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PACKAGE",
          message: "Request body must contain a valid workflow package object.",
        },
      });
      return;
    }

    const availableConnectors = getAvailableConnectorIds();
    const orgConnections = Array.from(apiStore.connections.values())
      .filter((c) => c.organizationId === orgId && c.status === "ACTIVE")
      .map((c) => ({ id: c.id, name: c.name, connectorId: c.connectorId }));

    const existingWorkflows = Array.from(apiStore.workflows.values())
      .filter((w) => w.organizationId === orgId && !w.deletedAt)
      .map((w) => ({
        id: w.id,
        name: w.name,
        draftRevision: w.draftRevision || 1,
      }));

    const preview = analyzeWorkflowPackageCompatibility({
      packageData,
      availableConnectors,
      orgConnections,
      existingWorkflows,
    });

    res.json({
      success: true,
      data: preview,
      error: null,
    });
  },
);

// ==========================================
// 2. CONFIRM & PERSIST WORKFLOW IMPORT
// ==========================================
portabilityRouter.post(
  "/import",
  requirePermission("workflow:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const parseResult = ConfirmImportWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const isFormatVersion = issue?.path.includes("formatVersion");
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: isFormatVersion
            ? "UNSUPPORTED_PACKAGE_FORMAT"
            : "VALIDATION_FAILED",
          message: isFormatVersion
            ? "Unsupported package format version."
            : "Invalid import confirmation request payload.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const {
      package: pkg,
      conflictStrategy,
      targetWorkflowName,
      targetWorkflowId,
      connectorMappings,
    } = parseResult.data;

    // Verify package integrity
    const isIntegrityValid = verifyPackageIntegrity(pkg);
    if (!isIntegrityValid) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INTEGRITY_VERIFICATION_FAILED",
          message:
            "Package cryptographic hash does not match content. The package may have been corrupted or modified.",
        },
      });
      return;
    }

    // Tenant Safety on Connector Mappings:
    // Validate that every mapped connection actually belongs to caller's organization and is active
    for (const [sourceKey, targetConnId] of Object.entries(connectorMappings)) {
      const conn = apiStore.connections.get(targetConnId);
      if (!conn || conn.organizationId !== orgId) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "CROSS_TENANT_MAPPING_FORBIDDEN",
            message: `Mapped connection '${targetConnId}' does not belong to your organization.`,
          },
        });
        return;
      }
      if (conn.status !== "ACTIVE") {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "INACTIVE_CONNECTION",
            message: `Mapped connection '${conn.name}' is disabled or revoked.`,
          },
        });
        return;
      }
    }

    const now = new Date();
    let targetWorkflow: WorkflowRecord;

    if (conflictStrategy === "REPLACE_DRAFT") {
      if (!targetWorkflowId) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "TARGET_WORKFLOW_REQUIRED",
            message:
              "targetWorkflowId is required when conflict strategy is REPLACE_DRAFT.",
          },
        });
        return;
      }

      const existingWf = apiStore.workflows.get(targetWorkflowId);
      if (
        !existingWf ||
        existingWf.organizationId !== orgId ||
        existingWf.deletedAt
      ) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "WORKFLOW_NOT_FOUND",
            message: "Target workflow for draft replacement does not exist.",
          },
        });
        return;
      }

      const access = resolveWorkflowAccess(existingWf, req);
      if (!access || !access.canEdit) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "FORBIDDEN",
            message:
              "You lack permission to edit or replace the draft of this workflow.",
          },
        });
        return;
      }

      // Apply connector mappings to graph
      const mappedDefinition = applyImportConnectorMappings(
        pkg.definition,
        connectorMappings,
      );

      existingWf.draftDefinition = mappedDefinition;
      existingWf.draftRevision = (existingWf.draftRevision || 1) + 1;
      existingWf.lastUpdatedById = req.user?.id;
      existingWf.updatedAt = now;

      apiStore.workflows.set(existingWf.id, existingWf);
      targetWorkflow = existingWf;

      apiStore.recordAudit({
        organizationId: orgId,
        userId: req.user?.id,
        action: "workflow.draft_replaced_from_import",
        resourceType: "workflow",
        resourceId: existingWf.id,
        metadata: {
          packageHash: pkg.integrity.hash,
          conflictStrategy,
          sourceWorkflowId: pkg.metadata.sourceWorkflowId,
        },
        ipAddress: req.ip,
      });

      apiStore.recordActivity({
        organizationId: orgId,
        workflowId: existingWf.id,
        userId: req.user?.id,
        type: "DRAFT_UPDATED",
        metadata: {
          imported: true,
          packageHash: pkg.integrity.hash,
          draftRevision: existingWf.draftRevision,
        },
      });
    } else {
      // CREATE_NEW or RENAME
      let workflowName = (targetWorkflowName || pkg.metadata.name).trim();

      if (conflictStrategy === "RENAME" || conflictStrategy === "CREATE_NEW") {
        const existingWithSameName = Array.from(
          apiStore.workflows.values(),
        ).some(
          (w) =>
            w.organizationId === orgId &&
            !w.deletedAt &&
            w.name.toLowerCase() === workflowName.toLowerCase(),
        );

        if (existingWithSameName && !targetWorkflowName) {
          let suffix = 1;
          while (
            Array.from(apiStore.workflows.values()).some(
              (w) =>
                w.organizationId === orgId &&
                !w.deletedAt &&
                w.name.toLowerCase() ===
                  `${workflowName} (Imported ${suffix})`.toLowerCase(),
            )
          ) {
            suffix++;
          }
          workflowName = `${workflowName} (Imported ${suffix})`;
        }
      }

      const mappedDefinition = applyImportConnectorMappings(
        pkg.definition,
        connectorMappings,
      );

      const newWfId = `wf_${crypto.randomUUID()}`;
      targetWorkflow = {
        id: newWfId,
        organizationId: orgId,
        name: workflowName,
        description: pkg.metadata.description,
        status: "DRAFT",
        draftRevision: 1,
        createdById: req.user?.id,
        lastUpdatedById: req.user?.id,
        draftDefinition: mappedDefinition,
        createdAt: now,
        updatedAt: now,
      };

      apiStore.workflows.set(newWfId, targetWorkflow);

      apiStore.recordAudit({
        organizationId: orgId,
        userId: req.user?.id,
        action: "workflow.imported",
        resourceType: "workflow",
        resourceId: newWfId,
        metadata: {
          workflowName,
          packageHash: pkg.integrity.hash,
          conflictStrategy,
          sourceWorkflowId: pkg.metadata.sourceWorkflowId,
        },
        ipAddress: req.ip,
      });

      apiStore.recordActivity({
        organizationId: orgId,
        workflowId: newWfId,
        userId: req.user?.id,
        type: "WORKFLOW_CREATED",
        metadata: {
          imported: true,
          packageHash: pkg.integrity.hash,
          workflowName,
        },
      });
    }

    // Persist Import Provenance Record
    const importId = `wfi_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const provenanceRecord: WorkflowImportRecord = {
      id: importId,
      organizationId: orgId,
      workflowId: targetWorkflow.id,
      sourceWorkflowId: pkg.metadata.sourceWorkflowId || null,
      sourceRevision: pkg.metadata.sourceRevision || null,
      packageHash: pkg.integrity.hash,
      packageFormatVersion: pkg.formatVersion,
      conflictStrategy,
      strategy: conflictStrategy,
      connectorMappings,
      compatibilityStatus: "COMPATIBLE",
      importedById: req.user?.id || null,
      createdAt: now,
    };
    apiStore.workflowImports.set(importId, provenanceRecord);

    const statusCode = conflictStrategy === "REPLACE_DRAFT" ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: {
        ...targetWorkflow,
        workflow: targetWorkflow,
        importId,
        packageHash: pkg.integrity.hash,
        provenance: provenanceRecord,
      },
      error: null,
    });
  },
);

// ==========================================
// 3. EXPORT WORKFLOW (Draft, Version, or Published)
// ==========================================
portabilityRouter.get(
  "/:id/export",
  requirePermission("workflow:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const { target = "draft", versionId } = req.query;

    const workflow = apiStore.workflows.get(id);
    if (!workflow || workflow.organizationId !== orgId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const access = resolveWorkflowAccess(workflow, req);
    if (!access) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "You lack permission to access this workflow.",
        },
      });
      return;
    }

    let definition = workflow.draftDefinition;
    let sourceRevision = workflow.draftRevision || 1;
    let sourceVersionNumber: number | undefined;

    if (target === "published") {
      if (!workflow.publishedVersionId) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "WORKFLOW_NOT_PUBLISHED",
            message: "Workflow has no published version to export.",
          },
        });
        return;
      }
      const pubVersion = apiStore.versions.get(workflow.publishedVersionId);
      if (!pubVersion) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "VERSION_NOT_FOUND",
            message: "Published version snapshot not found.",
          },
        });
        return;
      }
      definition = pubVersion.definition;
      sourceVersionNumber = pubVersion.versionNumber;
      sourceRevision = pubVersion.versionNumber;
    } else if (target === "version") {
      let specificVersion;
      if (versionId && typeof versionId === "string") {
        specificVersion = apiStore.versions.get(versionId);
      } else if (req.query.versionNumber) {
        const num = parseInt(String(req.query.versionNumber), 10);
        specificVersion = Array.from(apiStore.versions.values()).find(
          (v) => v.workflowId === workflow.id && v.versionNumber === num,
        );
      }
      if (!specificVersion || specificVersion.workflowId !== workflow.id) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "VERSION_NOT_FOUND",
            message: "Specified workflow version snapshot not found.",
          },
        });
        return;
      }
      definition = specificVersion.definition;
      sourceVersionNumber = specificVersion.versionNumber;
      sourceRevision = specificVersion.versionNumber;
    }

    const pkg = createWorkflowExportPackage({
      name: workflow.name,
      description: workflow.description,
      sourceWorkflowId: workflow.id,
      sourceRevision,
      sourceVersionNumber,
      definition,
      sourceAppVersion: "1.0.0",
    });

    const safeSlug = workflow.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const targetLabel =
      target === "draft"
        ? `draft-rev${sourceRevision}`
        : `v${sourceVersionNumber || 1}`;
    const filename = `workflow-${safeSlug}-${targetLabel}.flowforge.json`;

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "workflow.exported",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: {
        target,
        sourceRevision,
        sourceVersionNumber,
        packageHash: pkg.integrity.hash,
      },
      ipAddress: req.ip,
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );

    res.json(pkg);
  },
);

// ==========================================
// 4. WORKFLOW IMPORT PROVENANCE HISTORY
// ==========================================
portabilityRouter.get(
  "/:id/imports",
  requirePermission("workflow:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const { id } = req.params;

    const workflow = apiStore.workflows.get(id);
    if (!workflow || workflow.organizationId !== orgId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const imports = Array.from(apiStore.workflowImports.values())
      .filter((i) => i.workflowId === id && i.organizationId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((i) => {
        const u = i.importedById ? apiStore.users.get(i.importedById) : null;
        return {
          ...i,
          importedBy: u
            ? {
                id: u.id,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
              }
            : null,
        };
      });

    res.json({
      success: true,
      data: imports,
      error: null,
    });
  },
);
