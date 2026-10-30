import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  PublishTemplateVersionSchema,
  InstantiateTemplateSchema,
  TemplateFilterQuerySchema,
  hasPermission,
  WorkflowDefinition,
} from "@flowforge/shared";
import {
  sanitizeWorkflowForTemplate,
  instantiateGraphFromTemplate,
  computeWorkflowContentHash,
  compareWorkflowDefinitions,
} from "@flowforge/workflow-engine";
import {
  apiStore,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord,
  WorkflowRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";

export const templateRouter = Router();

templateRouter.use(requireAuth);

/**
 * Helper to check whether a template is visible to the current request context.
 */
function isTemplateVisible(template: WorkflowTemplateRecord, req: Request): boolean {
  if (template.visibility === "PLATFORM") {
    return true;
  }
  if (template.visibility === "ORGANIZATION") {
    return !!req.organizationId && template.organizationId === req.organizationId;
  }
  if (template.visibility === "PRIVATE") {
    return !!req.user && template.createdById === req.user.id;
  }
  return false;
}

/**
 * GET /api/v1/templates
 * Discoverable templates catalog with filtering, search, and tenant isolation.
 */
templateRouter.get("/", (req: Request, res: Response) => {
  const queryResult = TemplateFilterQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters.",
        details: queryResult.error.format(),
      },
    });
    return;
  }

  const { category, tag, search, visibility, status, page, pageSize } = queryResult.data;

  const allTemplates = Array.from(apiStore.templates.values());

  const filtered = allTemplates.filter((t) => {
    // 1. Strict multi-tenant isolation check
    if (!isTemplateVisible(t, req)) {
      return false;
    }

    // 2. Status filter: default to PUBLISHED unless explicitly requesting DRAFT/ARCHIVED
    if (status) {
      if (t.status !== status) return false;
    } else {
      // By default, show published templates + user's own draft templates
      const isOwner = req.user && t.createdById === req.user.id;
      if (t.status === "ARCHIVED") return false;
      if (t.status === "DRAFT" && !isOwner) return false;
    }

    // 3. Category filter
    if (category && t.category.toLowerCase() !== category.toLowerCase()) {
      return false;
    }

    // 4. Tag filter
    if (tag && !t.tags.some((tg) => tg.toLowerCase() === tag.toLowerCase())) {
      return false;
    }

    // 5. Visibility filter
    if (visibility && t.visibility !== visibility) {
      return false;
    }

    // 6. Search query
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchDesc = t.shortDescription.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
      const matchTag = t.tags.some((tg) => tg.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTag) return false;
    }

    return true;
  });

  // Sort: featured first, then most used, then newest
  filtered.sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  // Attach latest published version info if available
  const items = paginated.map((tmpl) => {
    let publishedVersion: WorkflowTemplateVersionRecord | undefined;
    if (tmpl.publishedVersionId) {
      publishedVersion = apiStore.templateVersions.get(tmpl.publishedVersionId);
    }
    return {
      ...tmpl,
      publishedVersion,
    };
  });

  res.json({
    success: true,
    data: items,
    error: null,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  });
});

/**
 * GET /api/v1/templates/:templateId
 * Retrieve detailed template metadata and definition.
 */
templateRouter.get("/:templateId", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found or access is restricted.",
      },
    });
    return;
  }

  let publishedVersion: WorkflowTemplateVersionRecord | undefined;
  if (template.publishedVersionId) {
    publishedVersion = apiStore.templateVersions.get(template.publishedVersionId);
  }

  res.json({
    success: true,
    data: {
      ...template,
      publishedVersion,
    },
    error: null,
  });
});

/**
 * POST /api/v1/templates
 * Create a new template draft from scratch or from an existing workflow.
 */
templateRouter.post("/", (req: Request, res: Response) => {
  const parseResult = CreateTemplateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid template creation request.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const {
    name,
    shortDescription,
    description,
    category,
    tags,
    visibility,
    workflowId,
    definition,
  } = parseResult.data;

  // Organization-level visibility check: requires organization context & permissions
  if (visibility === "ORGANIZATION") {
    if (!req.organizationId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "ORGANIZATION_REQUIRED",
          message: "Organization context required to publish templates at the organization level.",
        },
      });
      return;
    }
    if (req.role && !hasPermission(req.role, "templates:write") && !hasPermission(req.role, "workflow:write")) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "You lack permission to create organization templates.",
        },
      });
      return;
    }
  }

  let rawDefinition: WorkflowDefinition;

  if (workflowId) {
    // Look up existing workflow
    const sourceWf = apiStore.workflows.get(workflowId);
    if (!sourceWf || sourceWf.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Source workflow could not be found in active organization.",
        },
      });
      return;
    }
    rawDefinition = sourceWf.draftDefinition;
  } else if (definition) {
    rawDefinition = definition;
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_REQUEST",
        message: "Must provide either workflowId or definition.",
      },
    });
    return;
  }

  // Sanitize graph for template storage: strips secrets, connections, runtime state, deactivates triggers
  const { sanitizedDefinition, requiredConnections, requiredInputs } =
    sanitizeWorkflowForTemplate(rawDefinition);

  const templateId = `tmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  const newTemplate: WorkflowTemplateRecord = {
    id: templateId,
    organizationId: visibility === "PLATFORM" ? null : req.organizationId || null,
    name,
    shortDescription,
    description: description || null,
    category: category || "General",
    tags: tags || [],
    visibility,
    status: "DRAFT",
    draftDefinition: sanitizedDefinition,
    requiredConnections,
    requiredInputs,
    usageCount: 0,
    isFeatured: false,
    isVerified: false,
    createdById: req.user?.id || null,
    publishedVersionId: null,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.templates.set(templateId, newTemplate);

  apiStore.recordAudit({
    organizationId: req.organizationId || "platform",
    userId: req.user?.id,
    action: "template:create",
    resourceType: "workflow_template",
    resourceId: templateId,
    metadata: {
      name,
      visibility,
      sourceWorkflowId: workflowId || null,
      requiredConnections,
    },
  });

  res.status(201).json({
    success: true,
    data: newTemplate,
    error: null,
  });
});

/**
 * PATCH /api/v1/templates/:templateId
 * Update template metadata or draft definition.
 */
templateRouter.patch("/:templateId", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  // Only creator or org admin can update template
  const isCreator = req.user && template.createdById === req.user.id;
  const isOrgAdmin = req.role === "OWNER" || req.role === "ADMIN";
  if (!isCreator && !isOrgAdmin) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions to update this template.",
      },
    });
    return;
  }

  const parseResult = UpdateTemplateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid update request.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const data = parseResult.data;

  if (data.name !== undefined) template.name = data.name;
  if (data.shortDescription !== undefined) template.shortDescription = data.shortDescription;
  if (data.description !== undefined) template.description = data.description;
  if (data.category !== undefined) template.category = data.category;
  if (data.tags !== undefined) template.tags = data.tags;
  if (data.visibility !== undefined) template.visibility = data.visibility;
  if (data.status !== undefined) template.status = data.status;

  if (data.definition !== undefined) {
    const { sanitizedDefinition, requiredConnections, requiredInputs } =
      sanitizeWorkflowForTemplate(data.definition);
    template.draftDefinition = sanitizedDefinition;
    template.requiredConnections = requiredConnections;
    template.requiredInputs = requiredInputs;
  }

  template.updatedAt = new Date();
  apiStore.templates.set(template.id, template);

  apiStore.recordAudit({
    organizationId: template.organizationId || "platform",
    userId: req.user?.id,
    action: "template:update",
    resourceType: "workflow_template",
    resourceId: template.id,
    metadata: {
      updatedFields: Object.keys(data),
    },
  });

  res.json({
    success: true,
    data: template,
    error: null,
  });
});

/**
 * POST /api/v1/templates/:templateId/publish
 * Publish an immutable template version from the draft definition.
 */
templateRouter.post("/:templateId/publish", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  // Check publish permissions
  const isCreator = req.user && template.createdById === req.user.id;
  const canPublish = isCreator || (req.role && (hasPermission(req.role, "templates:publish") || hasPermission(req.role, "workflow:publish")));
  if (!canPublish) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to publish template versions.",
      },
    });
    return;
  }

  const parseResult = PublishTemplateVersionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid publish request.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  // Find all existing versions for this template to calculate next version number
  const existingVersions = Array.from(apiStore.templateVersions.values())
    .filter((v) => v.templateId === template.id);
  const nextVersionNumber = existingVersions.length > 0
    ? Math.max(...existingVersions.map((v) => v.versionNumber)) + 1
    : 1;

  // Compute deterministic SHA-256 content hash
  const contentHash = computeWorkflowContentHash(template.draftDefinition);

  const versionId = `tmpl_ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  const newVersion: WorkflowTemplateVersionRecord = {
    id: versionId,
    templateId: template.id,
    versionNumber: nextVersionNumber,
    definition: JSON.parse(JSON.stringify(template.draftDefinition)),
    requiredConnections: [...template.requiredConnections],
    requiredInputs: { ...template.requiredInputs },
    contentHash,
    releaseNotes: parseResult.data.releaseNotes || null,
    publishedById: req.user?.id || null,
    publishedAt: now,
  };

  apiStore.templateVersions.set(versionId, newVersion);

  // Update template state
  template.status = "PUBLISHED";
  template.publishedVersionId = versionId;
  template.updatedAt = now;
  apiStore.templates.set(template.id, template);

  apiStore.recordAudit({
    organizationId: template.organizationId || "platform",
    userId: req.user?.id,
    action: "template:publish",
    resourceType: "workflow_template",
    resourceId: template.id,
    metadata: {
      versionId,
      versionNumber: nextVersionNumber,
      contentHash,
    },
  });

  res.status(201).json({
    success: true,
    data: newVersion,
    error: null,
  });
});

/**
 * GET /api/v1/templates/:templateId/versions
 * List all published immutable versions of a template.
 */
templateRouter.get("/:templateId/versions", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  const versions = Array.from(apiStore.templateVersions.values())
    .filter((v) => v.templateId === template.id)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  res.json({
    success: true,
    data: versions,
    error: null,
  });
});

/**
 * GET /api/v1/templates/:templateId/versions/:versionId
 * Get a specific version definition.
 */
templateRouter.get("/:templateId/versions/:versionId", (req: Request, res: Response) => {
  const { templateId, versionId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  const version = apiStore.templateVersions.get(versionId);
  if (!version || version.templateId !== template.id) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "VERSION_NOT_FOUND",
        message: "Template version not found.",
      },
    });
    return;
  }

  res.json({
    success: true,
    data: version,
    error: null,
  });
});

/**
 * GET /api/v1/templates/:templateId/compare
 * Compare two versions of a template, or compare a version with current draft.
 */
templateRouter.get("/:templateId/compare", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  const { sourceVersionId, targetVersionId } = req.query as {
    sourceVersionId?: string;
    targetVersionId?: string;
  };

  let sourceDef: WorkflowDefinition;
  let targetDef: WorkflowDefinition;

  if (sourceVersionId) {
    const sVer = apiStore.templateVersions.get(sourceVersionId);
    if (!sVer || sVer.templateId !== template.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "SOURCE_NOT_FOUND", message: "Source version not found." },
      });
      return;
    }
    sourceDef = sVer.definition;
  } else {
    sourceDef = template.draftDefinition;
  }

  if (targetVersionId) {
    const tVer = apiStore.templateVersions.get(targetVersionId);
    if (!tVer || tVer.templateId !== template.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "TARGET_NOT_FOUND", message: "Target version not found." },
      });
      return;
    }
    targetDef = tVer.definition;
  } else if (template.publishedVersionId) {
    const pVer = apiStore.templateVersions.get(template.publishedVersionId);
    targetDef = pVer ? pVer.definition : template.draftDefinition;
  } else {
    targetDef = template.draftDefinition;
  }

  const comparison = compareWorkflowDefinitions(sourceDef, targetDef);

  res.json({
    success: true,
    data: comparison,
    error: null,
  });
});

/**
 * DELETE /api/v1/templates/:templateId
 * Archive a template.
 */
templateRouter.delete("/:templateId", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found.",
      },
    });
    return;
  }

  const isCreator = req.user && template.createdById === req.user.id;
  const isOrgAdmin = req.role === "OWNER" || req.role === "ADMIN";
  if (!isCreator && !isOrgAdmin) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions to archive this template.",
      },
    });
    return;
  }

  template.status = "ARCHIVED";
  template.updatedAt = new Date();
  apiStore.templates.set(template.id, template);

  apiStore.recordAudit({
    organizationId: template.organizationId || "platform",
    userId: req.user?.id,
    action: "template:archive",
    resourceType: "workflow_template",
    resourceId: template.id,
  });

  res.json({
    success: true,
    data: { message: "Template archived successfully." },
    error: null,
  });
});

/**
 * POST /api/v1/templates/:templateId/instantiate
 * Instantiate a new workflow from a template into the caller's active organization.
 */
templateRouter.post("/:templateId/instantiate", (req: Request, res: Response) => {
  const { templateId } = req.params;
  const template = apiStore.templates.get(templateId);

  // 1. Strict Tenant Isolation on Template Access
  if (!template || !isTemplateVisible(template, req)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        message: "Template not found or cross-tenant access denied.",
      },
    });
    return;
  }

  // 2. Target organization check
  if (!req.organizationId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Target organization context is required to instantiate workflows.",
      },
    });
    return;
  }

  // 3. User permission check in target organization: requires workflow creation right
  if (req.role && !hasPermission(req.role, "workflow:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to create workflows in this organization.",
      },
    });
    return;
  }

  const parseResult = InstantiateTemplateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid instantiation request.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { name, description, versionId, connectionMappings, inputValues } = parseResult.data;

  // 4. Resolve the version definition to instantiate
  let sourceDefinition: WorkflowDefinition;
  let usedVersionId: string | undefined = versionId;

  if (versionId) {
    const ver = apiStore.templateVersions.get(versionId);
    if (!ver || ver.templateId !== template.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "VERSION_NOT_FOUND", message: "Template version not found." },
      });
      return;
    }
    sourceDefinition = ver.definition;
  } else if (template.publishedVersionId) {
    const ver = apiStore.templateVersions.get(template.publishedVersionId);
    if (ver) {
      sourceDefinition = ver.definition;
      usedVersionId = ver.id;
    } else {
      sourceDefinition = template.draftDefinition;
    }
  } else {
    // Fall back to draft definition if template creator is instantiating draft
    sourceDefinition = template.draftDefinition;
  }

  // 5. Enforce connection security & tenant isolation on connectionMappings
  if (connectionMappings) {
    for (const [connectorKey, connectionId] of Object.entries(connectionMappings)) {
      if (!connectionId) continue;
      const conn = apiStore.connections.get(connectionId);
      if (!conn) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "CONNECTION_NOT_FOUND",
            message: `Connection '${connectionId}' mapped for '${connectorKey}' not found.`,
          },
        });
        return;
      }
      // Cross-tenant connection access check
      if (conn.organizationId !== req.organizationId) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "CROSS_TENANT_CONNECTION_FORBIDDEN",
            message: `Connection '${connectionId}' belongs to another organization and cannot be bound.`,
          },
        });
        return;
      }
    }
  }

  // 6. Instantiate fresh graph: regenerates node/edge UUIDs, maps connections, ensures inactive triggers
  let instantiatedDefinition: WorkflowDefinition;
  try {
    instantiatedDefinition = instantiateGraphFromTemplate(sourceDefinition, {
      connectionMappings,
      inputValues,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "GRAPH_INSTANTIATION_FAILED",
        message: err.message || "Failed to instantiate workflow from template.",
      },
    });
    return;
  }

  // 7. Create new Workflow in target organization in DRAFT status
  const workflowId = `wf_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  const newWorkflow: WorkflowRecord = {
    id: workflowId,
    organizationId: req.organizationId,
    name: name || `${template.name} (from Template)`,
    description: description || template.shortDescription,
    status: "DRAFT", // Always draft upon instantiation
    draftDefinition: instantiatedDefinition,
    draftRevision: 1,
    publishedVersionId: undefined, // Unpublished initially
    createdById: req.user?.id,
    sourceTemplateId: template.id,
    sourceTemplateVersionId: usedVersionId,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.workflows.set(workflowId, newWorkflow);

  // 8. Increment template usage counter
  template.usageCount = (template.usageCount || 0) + 1;
  apiStore.templates.set(template.id, template);

  // 9. Record audit event
  apiStore.recordAudit({
    organizationId: req.organizationId,
    userId: req.user?.id,
    action: "workflow:instantiate_from_template",
    resourceType: "workflow",
    resourceId: workflowId,
    metadata: {
      templateId: template.id,
      templateVersionId: usedVersionId || null,
      templateName: template.name,
      connectionMappings: connectionMappings || {},
    },
  });

  res.status(201).json({
    success: true,
    data: newWorkflow,
    error: null,
  });
});
