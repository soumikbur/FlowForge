import { Router } from "express";
import crypto from "crypto";
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  TriggerWorkflowSchema,
  PaginationQuerySchema,
} from "@flowforge/shared";
import { validateWorkflowGraph } from "@flowforge/workflow-engine";
import {
  apiStore,
  WorkflowRecord,
  WorkflowVersionRecord,
  WorkflowExecutionRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const workflowRouter = Router();

workflowRouter.use(requireAuth);

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
    workflows = workflows.filter((w) => !w.deletedAt && w.status !== "ARCHIVED");
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

  // Sort by updatedAt descending
  workflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const total = workflows.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedWorkflows = workflows.slice(startIndex, startIndex + pageSize);

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

  const { name, description } = parseResult.data;
  const workflowId = `wf_${crypto.randomUUID()}`;
  const now = new Date();

  const newWorkflow: WorkflowRecord = {
    id: workflowId,
    organizationId: req.organizationId!,
    name,
    description,
    status: "DRAFT",
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

  res.status(201).json({
    success: true,
    data: newWorkflow,
    error: null,
  });
});

// ==========================================
// 3. Get single workflow
// ==========================================
workflowRouter.get("/:id", requirePermission("workflow:read"), (req, res) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
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
    data: {
      ...workflow,
      versions,
    },
    error: null,
  });
});

// ==========================================
// 4. Update workflow draft
// ==========================================
workflowRouter.patch(
  "/:id",
  requirePermission("workflow:write"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
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

    const { name, description, nodes, edges } = parseResult.data;

    if (name !== undefined) workflow.name = name;
    if (description !== undefined) workflow.description = description;
    if (nodes !== undefined || edges !== undefined) {
      workflow.draftDefinition = {
        nodes: nodes ?? workflow.draftDefinition.nodes,
        edges: edges ?? workflow.draftDefinition.edges,
      };
    }
    workflow.updatedAt = new Date();

    apiStore.workflows.set(workflow.id, workflow);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "workflow.updated",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { name: workflow.name },
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
// 5. Soft-Delete / Archive Workflow
// ==========================================
workflowRouter.delete(
  "/:id",
  requirePermission("workflow:delete"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    // Invariant: Soft delete preserves execution history and immutable version snapshots
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
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const validation = validateWorkflowGraph(workflow.draftDefinition);

    res.json({
      success: true,
      data: validation,
      error: null,
    });
  },
);

// ==========================================
// 7. Publish workflow draft into an immutable version
// ==========================================
workflowRouter.post(
  "/:id/publish",
  requirePermission("workflow:publish"),
  (req, res) => {
    const workflow = apiStore.workflows.get(req.params.id);
    if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

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

    // Version sequencing: count existing published versions
    const existingVersions = Array.from(apiStore.versions.values()).filter(
      (v) => v.workflowId === workflow.id,
    );
    const nextVersionNumber = existingVersions.length + 1;
    const versionId = `ver_${crypto.randomUUID()}`;

    // Immutable snapshot
    const newVersion: WorkflowVersionRecord = {
      id: versionId,
      workflowId: workflow.id,
      versionNumber: nextVersionNumber,
      definition: JSON.parse(JSON.stringify(workflow.draftDefinition)),
      publishedAt: new Date(),
      publishedById: req.user?.id,
    };

    apiStore.versions.set(versionId, newVersion);

    workflow.publishedVersionId = versionId;
    workflow.status = "ACTIVE";
    workflow.updatedAt = new Date();
    apiStore.workflows.set(workflow.id, workflow);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "workflow.published",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { versionId, versionNumber: nextVersionNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        workflow,
        version: newVersion,
      },
      error: null,
    });
  },
);

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
// 10. Trigger / Execute workflow execution
// ==========================================
const dispatchExecutionHandler = async (req: any, res: any) => {
  const workflow = apiStore.workflows.get(req.params.id);
  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  if (!workflow.publishedVersionId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "WORKFLOW_NOT_PUBLISHED",
        message: "Workflow must have a published version before execution.",
      },
    });
    return;
  }

  // Idempotency check
  const idempotencyKey =
    (req.headers["idempotency-key"] as string) ||
    req.body?.idempotencyKey;

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

  const executionId = `exec_${crypto.randomUUID()}`;
  const now = new Date();

  const execution: WorkflowExecutionRecord = {
    id: executionId,
    organizationId: req.organizationId!,
    workflowId: workflow.id,
    workflowVersionId: workflow.publishedVersionId,
    triggerType: "MANUAL",
    triggerPayload,
    idempotencyKey,
    status: "QUEUED",
    contextData: { trigger: { payload: triggerPayload, type: "MANUAL" } },
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.executions.set(executionId, execution);

  res.status(202).json({
    success: true,
    data: execution,
    error: null,
  });
};

workflowRouter.post(
  "/:id/trigger",
  requirePermission("workflow:execute"),
  dispatchExecutionHandler,
);

workflowRouter.post(
  "/:id/execute",
  requirePermission("workflow:execute"),
  dispatchExecutionHandler,
);
