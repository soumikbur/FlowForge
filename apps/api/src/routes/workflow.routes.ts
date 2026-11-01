import { Router } from "express";
import crypto from "crypto";
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  TriggerWorkflowSchema,
  PaginationQuerySchema,
  PublishWorkflowSchema,
  PromoteWorkflowSchema,
  RollbackWorkflowSchema,
  WorkflowEnvironment,
} from "@flowforge/shared";
import {
  validateWorkflowGraph,
  computeWorkflowContentHash,
  compareWorkflowDefinitions,
} from "@flowforge/workflow-engine";
import {
  apiStore,
  WorkflowRecord,
  WorkflowVersionRecord,
  WorkflowExecutionRecord,
  WorkflowDeploymentRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { publishDomainEvent } from "../services/event-delivery.service.js";
import { requirePermission } from "../middleware/rbac.js";
import { resolveWorkflowAccess } from "../middleware/workflow-access.js";
import { collaborationRouter } from "./collaboration.routes.js";
import { entitlementService } from "../services/entitlement.service.js";
import { deprecationNotice } from "../middleware/deprecation.js";
import { policyService } from "../services/policy.service.js";
import { resourceGovernanceService } from "../services/resource-governance.service.js";
import { simulationService } from "../services/simulation.service.js";
import { workflowSimulationRouter } from "./simulation.routes.js";

export const workflowRouter = Router();

workflowRouter.use(requireAuth);

/**
 * Resolves the authoritative active deployed workflow version for an environment,
 * falling back to the workflow's latest published version.
 */
export function resolveActiveWorkflowVersionId(
  workflowId: string,
  environment: "development" | "staging" | "production" = "production",
): string | undefined {
  const activeDeployment = Array.from(apiStore.deployments.values()).find(
    (d) =>
      d.workflowId === workflowId &&
      d.environment === environment &&
      d.status === "ACTIVE",
  );
  if (activeDeployment) {
    return activeDeployment.workflowVersionId;
  }
  const wf = apiStore.workflows.get(workflowId);
  return wf?.publishedVersionId;
}

// ==========================================
// 1. List Workflows (with pagination, search, status filter)
// ==========================================
workflowRouter.get("/", requirePermission("workflow:read"), (req, res) => {
  const orgId = req.organizationId!;

  const queryParse = PaginationQuerySchema.safeParse(req.query);
  const { page, pageSize, search, status } = queryParse.success
    ? queryParse.data
    : { page: 1, pageSize: 20, search: undefined, status: undefined };

  let workflows = Array.from(apiStore.workflows.values()).filter(
    (w) => w.organizationId === orgId,
  );

  // Soft-deleted filtering: exclude deleted unless status explicitly requests ARCHIVED
  if (status) {
    workflows = workflows.filter((w) => w.status === status);
  } else {
    workflows = workflows.filter(
      (w) => !w.deletedAt && w.status !== "ARCHIVED",
    );
  }

  // Name / Description Search filter
  if (search) {
    const term = search.toLowerCase();
    workflows = workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.description && w.description.toLowerCase().includes(term)),
    );
  }

  // Team collaboration filter: "all" | "created_by_me" | "shared_with_me"
  const teamFilter = req.query.filter as string | undefined;
  if (teamFilter === "created_by_me") {
    workflows = workflows.filter((w) => w.createdById === req.user?.id);
  } else if (teamFilter === "shared_with_me") {
    const collabWorkflowIds = new Set(
      Array.from(apiStore.collaborators.values())
        .filter((c) => c.userId === req.user?.id)
        .map((c) => c.workflowId),
    );
    workflows = workflows.filter(
      (w) => w.createdById !== req.user?.id && collabWorkflowIds.has(w.id),
    );
  }

  if (req.query.workspaceId) {
    workflows = workflows.filter(
      (w) => w.workspaceId === req.query.workspaceId,
    );
  }

  // Sort by updatedAt descending
  workflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const total = workflows.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedWorkflows = workflows
    .slice(startIndex, startIndex + pageSize)
    .map((w) => {
      const collabCount = Array.from(apiStore.collaborators.values()).filter(
        (c) => c.workflowId === w.id,
      ).length;
      const ownerUser = w.createdById
        ? apiStore.users.get(w.createdById)
        : null;
      const access = resolveWorkflowAccess(w, req);
      return {
        ...w,
        collaboratorsCount: collabCount,
        accessLevel: access?.level,
        owner: ownerUser
          ? {
              id: ownerUser.id,
              email: ownerUser.email,
              firstName: ownerUser.firstName,
              lastName: ownerUser.lastName,
            }
          : null,
      };
    });

  res.json({
    success: true,
    data: paginatedWorkflows,
    error: null,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ==========================================
// 2. Create new workflow draft
// ==========================================
workflowRouter.post("/", requirePermission("workflow:write"), (req, res) => {
  const parseResult = CreateWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid workflow payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const wfQuota = entitlementService.checkWorkflowCreationQuota(
    req.organizationId!,
  );
  if (!wfQuota.allowed) {
    res.status(402).json({
      success: false,
      data: null,
      error: {
        code: wfQuota.reason,
        message: wfQuota.message,
        details: { limit: wfQuota.limit, currentUsage: wfQuota.currentUsage },
      },
    });
    return;
  }

  const { name, description, workspaceId } = parseResult.data;
  if (workspaceId) {
    const ws = apiStore.workspaces.get(workspaceId);
    if (!ws || ws.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Workspace not found in this organization.",
        },
      });
      return;
    }
  }

  const workflowId = `wf_${crypto.randomUUID()}`;
  const now = new Date();

  const newWorkflow: WorkflowRecord = {
    id: workflowId,
    organizationId: req.organizationId!,
    name,
    description,
    workspaceId: workspaceId || undefined,
    status: "DRAFT",
    draftRevision: 1,
    createdById: req.user?.id,
    draftDefinition: {
      nodes: [
        {
          id: "trigger_1",
          type: "TRIGGER",
          name: "Manual Trigger",
          config: { triggerType: "MANUAL" },
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  apiStore.workflows.set(workflowId, newWorkflow);

  apiStore.recordAudit({
    organizationId: req.organizationId!,
    userId: req.user?.id,
    action: "workflow.created",
    resourceType: "workflow",
    resourceId: workflowId,
    metadata: { name },
    ipAddress: req.ip,
  });

  apiStore.recordActivity({
    organizationId: newWorkflow.organizationId,
    workflowId: newWorkflow.id,
    userId: req.user?.id,
    type: "WORKFLOW_CREATED",
    metadata: { name },
  });

  res.status(201).json({
    success: true,
    data: newWorkflow,
    error: null,
  });
});

// ==========================================
// 3. Get single workflow with versions and environment deployments
// ==========================================
workflowRouter.get("/:id", requirePermission("workflow:read"), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (
    !workflow ||
    workflow.organizationId !== req.organizationId ||
    workflow.deletedAt
  ) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Workflow not found or access denied.",
      },
    });
    return;
  }

  const versions = Array.from(apiStore.versions.values())
    .filter((v) => v.workflowId === workflow.id)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  const deployments = Array.from(apiStore.deployments.values()).filter(
    (d) => d.workflowId === workflow.id && d.status === "ACTIVE",
  );

  const environments: Record<string, WorkflowDeploymentRecord | null> = {
    development:
      deployments.find((d) => d.environment === "development") || null,
    staging: deployments.find((d) => d.environment === "staging") || null,
    production: deployments.find((d) => d.environment === "production") || null,
  };

  const collabs = Array.from(apiStore.collaborators.values())
    .filter((c) => c.workflowId === workflow.id)
    .map((c) => {
      const u = apiStore.users.get(c.userId);
      return {
        ...c,
        user: u
          ? {
              id: u.id,
              email: u.email,
              firstName: u.firstName,
              lastName: u.lastName,
            }
          : null,
      };
    });

  const ownerUser = workflow.createdById
    ? apiStore.users.get(workflow.createdById)
    : null;

  res.json({
    success: true,
    data: {
      ...workflow,
      draftRevision: workflow.draftRevision || 1,
      versions,
      environments,
      collaborators: collabs,
      accessLevel: access.level,
      isOwner: access.isOwner,
      canEdit: access.canEdit,
      canPublish: access.canPublish,
      canManageCollaborators: access.canManageCollaborators,
      owner: ownerUser
        ? {
            id: ownerUser.id,
            email: ownerUser.email,
            firstName: ownerUser.firstName,
            lastName: ownerUser.lastName,
          }
        : null,
    },
    error: null,
  });
});

// ==========================================
// 4. Update workflow draft with optimistic concurrency protection
// ==========================================
workflowRouter.patch("/:id", (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (
    !workflow ||
    workflow.organizationId !== req.organizationId ||
    workflow.deletedAt
  ) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access || !access.canEdit) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to edit this workflow draft.",
      },
    });
    return;
  }

  const parseResult = UpdateWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid update payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  // Optimistic Concurrency Control
  const expectedRevision =
    parseResult.data.expectedRevision !== undefined
      ? parseResult.data.expectedRevision
      : req.headers["if-match"]
        ? parseInt(req.headers["if-match"] as string, 10)
        : undefined;

  const currentRevision = workflow.draftRevision || 1;
  if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: "DRAFT_CONFLICT",
        message: `Draft was modified by another session (expected revision ${expectedRevision}, current is ${currentRevision}). Refresh to review latest changes.`,
        details: {
          currentRevision,
          expectedRevision,
          lastUpdatedById: workflow.lastUpdatedById,
        },
      },
    });
    return;
  }

  const { name, description, workspaceId, nodes, edges } = parseResult.data;

  if (name !== undefined) workflow.name = name;
  if (description !== undefined) workflow.description = description;
  if (workspaceId !== undefined)
    workflow.workspaceId = workspaceId || undefined;
  if (nodes !== undefined || edges !== undefined) {
    workflow.draftDefinition = {
      nodes: nodes ?? workflow.draftDefinition.nodes,
      edges: edges ?? workflow.draftDefinition.edges,
    };
  }
  workflow.draftRevision = currentRevision + 1;
  workflow.lastUpdatedById = req.user?.id;
  workflow.updatedAt = new Date();

  apiStore.workflows.set(workflow.id, workflow);

  apiStore.recordAudit({
    organizationId: req.organizationId!,
    userId: req.user?.id,
    action: "workflow.updated",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: { name: workflow.name, revision: workflow.draftRevision },
    ipAddress: req.ip,
  });

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "DRAFT_UPDATED",
    metadata: {
      revision: workflow.draftRevision,
      updatedFields: Object.keys(parseResult.data),
    },
  });

  res.json({
    success: true,
    data: workflow,
    error: null,
  });
});

// ==========================================
// 5. Soft-Delete / Archive Workflow
// ==========================================
workflowRouter.delete(
  "/:id",
  requirePermission("workflow:delete"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    workflow.deletedAt = new Date();
    workflow.status = "ARCHIVED";
    workflow.updatedAt = new Date();

    apiStore.workflows.set(workflow.id, workflow);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "workflow.deleted",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { name: workflow.name },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Workflow archived successfully." },
      error: null,
    });
  },
);

// ==========================================
// 6. Validate workflow draft
// ==========================================
workflowRouter.post(
  "/:id/validate",
  requirePermission("workflow:read"),
  async (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const validation = validateWorkflowGraph(workflow.draftDefinition);

    // Evaluate governance policies
    const destinationDomains: string[] = [];
    if (workflow.draftDefinition?.nodes) {
      for (const n of workflow.draftDefinition.nodes) {
        if (n.type === "HTTP_REQUEST" && (n.config as any)?.url) {
          try {
            destinationDomains.push(new URL((n.config as any).url).hostname);
          } catch {
            // ignore
          }
        }
      }
    }

    const policyDecision = await policyService.evaluate({
      organizationId: workflow.organizationId,
      workspaceId: workflow.workspaceId,
      principal: {
        id: req.user?.id || "usr_anonymous",
        role: (req as any).membership?.role || "MEMBER",
        email: req.user?.email,
        ip: req.ip,
      },
      resourceType: "WORKFLOW",
      resourceId: workflow.id,
      operation: "PUBLISH",
      attributes: {
        nodeTypes: workflow.draftDefinition.nodes.map((n) => n.type),
        destinationDomains,
        nodeCount: workflow.draftDefinition.nodes.length,
        dataClassification: (workflow as any).dataClassification || "INTERNAL",
        riskClassification: (workflow as any).riskClassification || "STANDARD",
      },
      correlationId: req.headers["x-correlation-id"] as string,
    });

    res.json({
      success: true,
      data: {
        ...validation,
        policyDecision,
      },
      error: null,
    });
  },
);

// ==========================================
// 7. Publish workflow draft into an immutable version
// ==========================================
workflowRouter.post("/:id/publish", async (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (
    !workflow ||
    workflow.organizationId !== req.organizationId ||
    workflow.deletedAt
  ) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access || !access.canPublish) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to publish this workflow.",
      },
    });
    return;
  }

  // 1. Validate complete workflow graph
  const validation = validateWorkflowGraph(workflow.draftDefinition);
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "GRAPH_VALIDATION_FAILED",
        message: "Cannot publish workflow with validation errors.",
        details: validation.errors,
      },
    });
    return;
  }

  // 2. Parse publish options
  const parseResult = PublishWorkflowSchema.safeParse(req.body);
  const releaseNotes = parseResult.success
    ? parseResult.data.releaseNotes
    : undefined;
  const force = parseResult.success ? parseResult.data.force : false;

  // 3. Compute deterministic canonical content hash
  const contentHash = computeWorkflowContentHash(workflow.draftDefinition);

  // 4. Duplicate Publication Guard
  if (workflow.publishedVersionId && !force) {
    const currentVersion = apiStore.versions.get(workflow.publishedVersionId);
    if (currentVersion && currentVersion.contentHash === contentHash) {
      res.status(409).json({
        success: false,
        data: {
          currentVersion,
          contentHash,
        },
        error: {
          code: "UNCHANGED_CONTENT",
          message:
            "Draft definition is identical to currently published version. Duplicate publication rejected.",
        },
      });
      return;
    }
  }

  // 4.5. Active Workflow Quota Check
  if (workflow.status !== "ACTIVE") {
    const activeQuota = entitlementService.checkActiveWorkflowQuota(
      workflow.organizationId,
    );
    if (!activeQuota.allowed) {
      res.status(402).json({
        success: false,
        data: null,
        error: {
          code: activeQuota.reason,
          message: activeQuota.message,
          details: {
            limit: activeQuota.limit,
            currentUsage: activeQuota.currentUsage,
          },
        },
      });
      return;
    }
  }

  // 4.6. Policy Governance Check
  const destinationDomains: string[] = [];
  if (workflow.draftDefinition?.nodes) {
    for (const n of workflow.draftDefinition.nodes) {
      if (n.type === "HTTP_REQUEST" && (n.config as any)?.url) {
        try {
          destinationDomains.push(new URL((n.config as any).url).hostname);
        } catch {
          // ignore
        }
      }
    }
  }

  const policyDecision = await policyService.evaluate({
    organizationId: workflow.organizationId,
    workspaceId: workflow.workspaceId,
    principal: {
      id: req.user?.id || "usr_anonymous",
      role: (req as any).membership?.role || "MEMBER",
      email: req.user?.email,
      ip: req.ip,
    },
    resourceType: "WORKFLOW",
    resourceId: workflow.id,
    operation: "PUBLISH",
    attributes: {
      nodeTypes: workflow.draftDefinition.nodes.map((n) => n.type),
      destinationDomains,
      nodeCount: workflow.draftDefinition.nodes.length,
      dataClassification: (workflow as any).dataClassification || "INTERNAL",
      riskClassification: (workflow as any).riskClassification || "STANDARD",
    },
    correlationId: req.headers["x-correlation-id"] as string,
  });

  if (!policyDecision.isAllowed) {
    if (policyDecision.requiresApproval) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "POLICY_APPROVAL_REQUIRED",
          message:
            "Policy requires explicit administrative approval before this workflow can be published.",
          details: {
            requiredRole: policyDecision.requiredApprovalRole || "ADMIN",
            violations: policyDecision.violations,
            matchedPolicies: policyDecision.matchedPolicies,
          },
        },
      });
      return;
    }

    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "POLICY_VIOLATION",
        message: "Workflow publication blocked by active governance policy.",
        details: {
          violations: policyDecision.violations,
          matchedPolicies: policyDecision.matchedPolicies,
        },
      },
    });
    return;
  }

  // 4.7. Publishing Gate Evaluation (Static validation, test suite, regression check)
  if (!force) {
    const gateResult = await simulationService.evaluatePublishingGates(
      workflow.organizationId,
      workflow.id,
      workflow.draftDefinition,
    );
    if (!gateResult.passed) {
      res.status(422).json({
        success: false,
        data: gateResult,
        error: {
          code: "PUBLISHING_GATE_BLOCKED",
          message:
            "Workflow publication blocked by publishing gate requirements.",
          details: gateResult.reasons,
        },
      });
      return;
    }
  }

  // 5. Version sequencing
  const existingVersions = Array.from(apiStore.versions.values()).filter(
    (v) => v.workflowId === workflow.id,
  );
  const nextVersionNumber = existingVersions.length + 1;
  const versionId = `ver_${crypto.randomUUID()}`;

  // 6. Immutable snapshot
  const newVersion: WorkflowVersionRecord = {
    id: versionId,
    workflowId: workflow.id,
    versionNumber: nextVersionNumber,
    definition: JSON.parse(JSON.stringify(workflow.draftDefinition)),
    contentHash,
    releaseNotes,
    publishedAt: new Date(),
    publishedById: req.user?.id,
  };

  apiStore.versions.set(versionId, newVersion);

  // 7. Update workflow reference
  workflow.publishedVersionId = versionId;
  workflow.status = "ACTIVE";
  workflow.updatedAt = new Date();
  apiStore.workflows.set(workflow.id, workflow);

  // 8. Auto-deploy to development environment
  const depId = `dep_${crypto.randomUUID()}`;
  const devDeployment: WorkflowDeploymentRecord = {
    id: depId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    workflowVersionId: versionId,
    environment: "development",
    status: "ACTIVE",
    deployedById: req.user?.id,
    deployedAt: new Date(),
    releaseNotes,
  };

  // Supersede previous development deployment
  for (const dep of apiStore.deployments.values()) {
    if (
      dep.workflowId === workflow.id &&
      dep.environment === "development" &&
      dep.status === "ACTIVE"
    ) {
      dep.status = "SUPERSEDED";
      apiStore.deployments.set(dep.id, dep);
    }
  }
  apiStore.deployments.set(depId, devDeployment);

  // 9. Record audit event
  apiStore.recordAudit({
    organizationId: req.organizationId!,
    userId: req.user?.id,
    action: "workflow.published",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: {
      versionId,
      versionNumber: nextVersionNumber,
      contentHash,
      releaseNotes,
    },
    ipAddress: req.ip,
  });

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "WORKFLOW_PUBLISHED",
    metadata: {
      versionNumber: nextVersionNumber,
      versionId,
      contentHash,
    },
  });

  publishDomainEvent(apiStore, {
    type: "workflow.published",
    organizationId: workflow.organizationId,
    resourceType: "workflow",
    resourceId: workflow.id,
    actorId: req.user?.id,
    data: {
      versionNumber: nextVersionNumber,
      versionId,
      contentHash,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      workflow,
      version: newVersion,
      deployment: devDeployment,
    },
    error: null,
  });
});

// ==========================================
// 8. List immutable published versions of a workflow
// ==========================================
workflowRouter.get(
  "/:id/versions",
  requirePermission("workflow:read"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const versions = Array.from(apiStore.versions.values())
      .filter((v) => v.workflowId === workflow.id)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    res.json({
      success: true,
      data: versions,
      error: null,
      meta: { total: versions.length },
    });
  },
);

// ==========================================
// 9. Get specific immutable published version snapshot
// ==========================================
workflowRouter.get(
  "/:id/versions/:versionId",
  requirePermission("workflow:read"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const version = apiStore.versions.get(req.params.versionId);
    if (!version || version.workflowId !== workflow.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow version not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: version,
      error: null,
    });
  },
);

// ==========================================
// 10. Immutability Boundary: Reject mutation or deletion of published versions
// ==========================================
const immutableRejectHandler = (req: any, res: any) => {
  res.status(405).json({
    success: false,
    data: null,
    error: {
      code: "VERSION_IMMUTABLE",
      message:
        "Published workflow versions are immutable and cannot be updated or deleted.",
    },
  });
};

workflowRouter.put("/:id/versions/:versionId", immutableRejectHandler);
workflowRouter.patch("/:id/versions/:versionId", immutableRejectHandler);
workflowRouter.delete("/:id/versions/:versionId", immutableRejectHandler);

// ==========================================
// 11. Create new draft from an immutable historical version snapshot
// ==========================================
workflowRouter.post(
  "/:id/versions/:versionId/create-draft",
  requirePermission("workflow:write"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const version = apiStore.versions.get(req.params.versionId);
    if (!version || version.workflowId !== workflow.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow version not found." },
      });
      return;
    }

    // Overwrite draft with version snapshot and increment draftRevision
    workflow.draftDefinition = JSON.parse(JSON.stringify(version.definition));
    workflow.draftRevision = (workflow.draftRevision || 1) + 1;
    workflow.updatedAt = new Date();
    apiStore.workflows.set(workflow.id, workflow);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "workflow.draft_restored",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: {
        fromVersionId: version.id,
        versionNumber: version.versionNumber,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: workflow,
      error: null,
    });
  },
);

// ==========================================
// 12. Version Comparison Endpoint (Semantic Diff + Sensitive Redaction)
// ==========================================
workflowRouter.get(
  "/:id/compare",
  requirePermission("workflow:read"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const fromVersionId = (req.query.fromVersionId ||
      req.query.baseVersionId) as string | undefined;
    const toVersionId = (req.query.toVersionId || req.query.targetVersionId) as
      string | undefined;

    let fromDef = workflow.draftDefinition;
    let toDef = workflow.draftDefinition;

    if (fromVersionId && fromVersionId !== "draft") {
      const ver = apiStore.versions.get(fromVersionId as string);
      if (!ver || ver.workflowId !== workflow.id) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Source version '${fromVersionId}' not found.`,
          },
        });
        return;
      }
      fromDef = ver.definition;
    } else if (!fromVersionId && workflow.publishedVersionId) {
      const ver = apiStore.versions.get(workflow.publishedVersionId);
      if (ver) fromDef = ver.definition;
    }

    if (toVersionId && toVersionId !== "draft") {
      const ver = apiStore.versions.get(toVersionId as string);
      if (!ver || ver.workflowId !== workflow.id) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Target version '${toVersionId}' not found.`,
          },
        });
        return;
      }
      toDef = ver.definition;
    }

    const diff = compareWorkflowDefinitions(fromDef, toDef);

    res.json({
      success: true,
      data: diff,
      error: null,
    });
  },
);

// ==========================================
// 13. List environment deployments for workflow
// ==========================================
workflowRouter.get(
  "/:id/deployments",
  requirePermission("workflow:read"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const deployments = Array.from(apiStore.deployments.values())
      .filter((d) => d.workflowId === workflow.id)
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());

    res.json({
      success: true,
      data: deployments,
      error: null,
      meta: { total: deployments.length },
    });
  },
);

// ==========================================
// 14. Get active deployment for specific environment
// ==========================================
workflowRouter.get(
  "/:id/environments/:environment",
  requirePermission("workflow:read"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const env = req.params.environment;
    const deployment = Array.from(apiStore.deployments.values()).find(
      (d) =>
        d.workflowId === workflow.id &&
        d.environment === env &&
        d.status === "ACTIVE",
    );

    res.json({
      success: true,
      data: deployment || null,
      error: null,
    });
  },
);

// ==========================================
// 15. Promote / Deploy workflow version to target environment
// ==========================================
const handlePromoteWorkflow = (req: any, res: any) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (
    !workflow ||
    workflow.organizationId !== req.organizationId ||
    workflow.deletedAt
  ) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  // Workspace Archival Execution Guard
  if (workflow.workspaceId) {
    const ws = apiStore.workspaces.get(workflow.workspaceId);
    if (ws && ws.status === "ARCHIVED") {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "WORKSPACE_ARCHIVED",
          message:
            "Cannot execute workflow belonging to an archived workspace.",
        },
      });
      return;
    }
  }

  const parseResult = PromoteWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid promotion payload",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { versionId, targetEnvironment, releaseNotes } = parseResult.data;

  // Production Deployment Safeguard:
  // Requires elevated role (OWNER or ADMIN)
  if (targetEnvironment === "production") {
    const isPrivileged = req.role === "OWNER" || req.role === "ADMIN";
    if (!isPrivileged) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "PRODUCTION_DEPLOY_UNAUTHORIZED",
          message:
            "Elevated permissions required to promote or deploy to production environment.",
        },
      });
      return;
    }
  }

  // Verify source version exists and belongs to workflow
  const version = apiStore.versions.get(versionId);
  if (!version || version.workflowId !== workflow.id) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "VERSION_NOT_FOUND",
        message: `Target version '${versionId}' does not belong to this workflow.`,
      },
    });
    return;
  }

  // Verify content hash integrity
  const calculatedHash = computeWorkflowContentHash(version.definition);
  if (version.contentHash && version.contentHash !== calculatedHash) {
    res.status(422).json({
      success: false,
      data: null,
      error: {
        code: "HASH_VERIFICATION_FAILED",
        message: "Version content hash integrity verification failed.",
      },
    });
    return;
  }

  // Idempotency check:
  const idempotencyKey =
    (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey;

  if (idempotencyKey) {
    const existing = Array.from(apiStore.deployments.values()).find(
      (d) =>
        d.organizationId === req.organizationId &&
        d.workflowId === workflow.id &&
        d.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      res.status(200).json({
        success: true,
        data: existing,
        error: null,
        meta: { idempotent: true },
      });
      return;
    }
  }

  // Find current active deployment for environment to link previousVersionId
  const currentActive = Array.from(apiStore.deployments.values()).find(
    (d) =>
      d.workflowId === workflow.id &&
      d.environment === targetEnvironment &&
      d.status === "ACTIVE",
  );

  // If already active with same version and no new notes, return idempotently
  if (
    currentActive &&
    currentActive.workflowVersionId === versionId &&
    !releaseNotes
  ) {
    res.status(200).json({
      success: true,
      data: currentActive,
      error: null,
      meta: {
        idempotent: true,
        message: "Version is already active in environment.",
      },
    });
    return;
  }

  // Supersede current active deployment
  if (currentActive) {
    currentActive.status = "SUPERSEDED";
    apiStore.deployments.set(currentActive.id, currentActive);
  }

  const deploymentId = `dep_${crypto.randomUUID()}`;
  const newDeployment: WorkflowDeploymentRecord = {
    id: deploymentId,
    organizationId: req.organizationId!,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    environment: targetEnvironment,
    status: "ACTIVE",
    deployedById: req.user?.id,
    deployedAt: new Date(),
    previousVersionId: currentActive
      ? currentActive.workflowVersionId
      : undefined,
    releaseNotes: releaseNotes || version.releaseNotes,
    idempotencyKey,
  };

  apiStore.deployments.set(deploymentId, newDeployment);

  apiStore.recordAudit({
    organizationId: req.organizationId!,
    userId: req.user?.id,
    action: "workflow.promoted",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: {
      deploymentId,
      environment: targetEnvironment,
      versionId: version.id,
      versionNumber: version.versionNumber,
      previousVersionId: newDeployment.previousVersionId,
    },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: newDeployment,
    error: null,
  });
};

workflowRouter.post("/:id/promote", requireAuth, handlePromoteWorkflow);

// Alias /deploy to /promote for deployment compatibility
workflowRouter.post("/:id/deploy", requireAuth, handlePromoteWorkflow);

// ==========================================
// 16. Rollback deployment in an environment
// ==========================================
workflowRouter.post(
  "/:id/environments/:environment/rollback",
  requireAuth,
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const env = req.params.environment as WorkflowEnvironment;
    if (!["development", "staging", "production"].includes(env)) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_ENVIRONMENT",
          message: `Environment '${env}' is not supported.`,
        },
      });
      return;
    }

    // Production Safeguard on Rollback
    if (env === "production") {
      const isPrivileged = req.role === "OWNER" || req.role === "ADMIN";
      if (!isPrivileged) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "PRODUCTION_DEPLOY_UNAUTHORIZED",
            message:
              "Elevated permissions required to perform rollback in production.",
          },
        });
        return;
      }
    }

    const parseResult = RollbackWorkflowSchema.safeParse(req.body);
    const { targetVersionId, reason } = parseResult.success
      ? parseResult.data
      : { targetVersionId: undefined, reason: undefined };

    const currentActive = Array.from(apiStore.deployments.values()).find(
      (d) =>
        d.workflowId === workflow.id &&
        d.environment === env &&
        d.status === "ACTIVE",
    );

    // Determine target version
    let resolvedTargetVersionId = targetVersionId;
    if (!resolvedTargetVersionId) {
      if (currentActive?.previousVersionId) {
        resolvedTargetVersionId = currentActive.previousVersionId;
      } else {
        // Find most recent superseded deployment for this environment
        const pastDeployments = Array.from(apiStore.deployments.values())
          .filter(
            (d) =>
              d.workflowId === workflow.id &&
              d.environment === env &&
              d.status === "SUPERSEDED",
          )
          .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());

        if (pastDeployments.length > 0) {
          resolvedTargetVersionId = pastDeployments[0].workflowVersionId;
        }
      }
    }

    if (!resolvedTargetVersionId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "NO_ROLLBACK_TARGET",
          message: "No previous deployment found to roll back to.",
        },
      });
      return;
    }

    const targetVersion = apiStore.versions.get(resolvedTargetVersionId);
    if (!targetVersion || targetVersion.workflowId !== workflow.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "VERSION_NOT_FOUND",
          message: `Target rollback version '${resolvedTargetVersionId}' not found.`,
        },
      });
      return;
    }

    // Mark current active as ROLLED_BACK
    if (currentActive) {
      currentActive.status = "ROLLED_BACK";
      apiStore.deployments.set(currentActive.id, currentActive);
    }

    // Create new deployment record for the rollback
    const rollbackDepId = `dep_rollback_${crypto.randomUUID()}`;
    const rollbackDeployment: WorkflowDeploymentRecord = {
      id: rollbackDepId,
      organizationId: req.organizationId!,
      workflowId: workflow.id,
      workflowVersionId: targetVersion.id,
      environment: env,
      status: "ACTIVE",
      deployedById: req.user?.id,
      deployedAt: new Date(),
      previousVersionId: currentActive
        ? currentActive.workflowVersionId
        : undefined,
      rollbackReason: reason || "Rollback to previous stable version",
    };

    apiStore.deployments.set(rollbackDepId, rollbackDeployment);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "workflow.rollback",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: {
        deploymentId: rollbackDepId,
        environment: env,
        targetVersionId: targetVersion.id,
        rolledBackFrom: currentActive?.workflowVersionId,
        reason,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: rollbackDeployment,
      error: null,
    });
  },
);

// ==========================================
// 17. Trigger / Execute workflow execution with Environment Version Resolution
// ==========================================
const dispatchExecutionHandler = async (req: any, res: any) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (
    !workflow ||
    workflow.organizationId !== req.organizationId ||
    workflow.deletedAt
  ) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  // Workspace Archival Execution Guard
  if (workflow.workspaceId) {
    const ws = apiStore.workspaces.get(workflow.workspaceId);
    if (ws && ws.status === "ARCHIVED") {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "WORKSPACE_ARCHIVED",
          message:
            "Cannot execute workflow belonging to an archived workspace.",
        },
      });
      return;
    }
  }

  // Resolve Environment and Deployed Workflow Version
  const requestedEnv = (
    (req.headers["x-environment"] as string) ||
    req.body?.environment ||
    "development"
  ).toLowerCase() as "development" | "staging" | "production";

  const resolvedVersionId = resolveActiveWorkflowVersionId(
    workflow.id,
    requestedEnv,
  );

  if (!resolvedVersionId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "WORKFLOW_NOT_PUBLISHED",
        message: `Workflow has no active deployment in '${requestedEnv}' and no published version.`,
      },
    });
    return;
  }

  // Idempotency check
  const idempotencyKey =
    (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey;

  if (idempotencyKey) {
    const existing = Array.from(apiStore.executions.values()).find(
      (e) =>
        e.organizationId === req.organizationId &&
        e.workflowId === workflow.id &&
        e.idempotencyKey === idempotencyKey,
    );

    if (existing) {
      res.status(200).json({
        success: true,
        data: existing,
        error: null,
        meta: { idempotent: true },
      });
      return;
    }
  }

  const parseResult = TriggerWorkflowSchema.safeParse(req.body);
  const triggerPayload = parseResult.success ? parseResult.data.payload : {};

  // Authoritative Resource Governance & Admission Control
  const admission = resourceGovernanceService.admitExecution({
    organizationId: req.organizationId!,
    workflowId: workflow.id,
    workspaceId: workflow.workspaceId,
    workflowVersionId: resolvedVersionId,
    triggerType: "MANUAL",
    triggerPayload,
    environment: requestedEnv,
    idempotencyKey,
    userId: req.user?.id,
  });

  if (!admission.allowed) {
    if (admission.retryAfterSeconds) {
      res.setHeader("Retry-After", admission.retryAfterSeconds.toString());
    }
    res.status(admission.statusCode).json({
      success: false,
      data: null,
      error: {
        code: admission.outcome,
        message: admission.reason,
        details: {
          metric: admission.metric,
          limit: admission.limit,
          currentUsage: admission.currentUsage,
        },
      },
    });
    return;
  }

  res.status(admission.statusCode).json({
    success: true,
    data: admission.execution,
    error: null,
    meta: admission.statusCode === 200 ? { idempotent: true } : undefined,
  });
};

workflowRouter.post(
  "/:id/trigger",
  deprecationNotice("/api/v1/workflows/:id/execute"),
  requirePermission("workflow:execute"),
  dispatchExecutionHandler,
);

workflowRouter.post(
  "/:id/execute",
  requirePermission("workflow:execute"),
  dispatchExecutionHandler,
);

// Mount workflow collaboration subrouter (collaborators, comments, activities)
workflowRouter.use("/:id", collaborationRouter);

// Mount workflow simulation and testing subrouter
workflowRouter.use("/:id", workflowSimulationRouter);
