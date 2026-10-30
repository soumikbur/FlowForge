import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  AddCollaboratorSchema,
  UpdateCollaboratorSchema,
  TransferWorkflowOwnershipSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
  ResolveCommentSchema,
  ActivityFilterQuerySchema,
} from "@flowforge/shared";
import {
  apiStore,
  WorkflowCollaboratorRecord,
  WorkflowCommentRecord,
} from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveWorkflowAccess } from "../middleware/workflow-access.js";

// Router with mergeParams: true to inherit :id from parent router
export const collaborationRouter = Router({ mergeParams: true });

collaborationRouter.use(requireAuth);

/**
 * Helper to retrieve user profile for actor references.
 */
function getUserProfile(userId?: string | null) {
  if (!userId) return null;
  const u = apiStore.users.get(userId);
  if (!u) return { id: userId, email: "unknown@flowforge.dev" };
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName || null,
    lastName: u.lastName || null,
  };
}

// ==========================================
// 1. COLLABORATORS MANAGEMENT
// ==========================================

/**
 * GET /api/v1/workflows/:id/collaborators
 * List all collaborators for a workflow.
 */
collaborationRouter.get("/collaborators", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
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
      error: { code: "NOT_FOUND", message: "Workflow not found or access denied." },
    });
    return;
  }

  const collabs = Array.from(apiStore.collaborators.values())
    .filter((c) => c.workflowId === workflow.id)
    .map((c) => ({
      ...c,
      user: getUserProfile(c.userId),
    }));

  const ownerProfile = getUserProfile(workflow.createdById);

  res.json({
    success: true,
    data: collabs,
    meta: {
      owner: ownerProfile,
      total: collabs.length,
      callerLevel: access.level,
      canManageCollaborators: access.canManageCollaborators,
    },
    error: null,
  });
});

/**
 * POST /api/v1/workflows/:id/collaborators
 * Add a collaborator to a workflow.
 */
collaborationRouter.post("/collaborators", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access || !access.canManageCollaborators) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to manage collaborators on this workflow.",
      },
    });
    return;
  }

  const parseResult = AddCollaboratorSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid collaborator payload.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { userId, role } = parseResult.data;

  // 1. Verify user exists
  const targetUser = apiStore.users.get(userId);
  if (!targetUser) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "USER_NOT_FOUND", message: "Target user not found." },
    });
    return;
  }

  // 2. Verify target user is a member of the organization
  const isMember = Array.from(apiStore.memberships.values()).some(
    (m) => m.organizationId === workflow.organizationId && m.userId === userId
  );
  if (!isMember) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_COLLABORATOR",
        message: "User must be a member of this organization to be added as a collaborator.",
      },
    });
    return;
  }

  // 3. Verify user is not already the workflow owner
  if (workflow.createdById === userId) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ALREADY_OWNER",
        message: "User is already the workflow owner.",
      },
    });
    return;
  }

  // 4. Verify user is not already a collaborator
  const existingCollab = Array.from(apiStore.collaborators.values()).find(
    (c) => c.workflowId === workflow.id && c.userId === userId
  );
  if (existingCollab) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: "COLLABORATOR_EXISTS",
        message: "User is already a collaborator on this workflow.",
      },
    });
    return;
  }

  const collabId = `collab_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  const newCollab: WorkflowCollaboratorRecord = {
    id: collabId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId,
    role,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.collaborators.set(collabId, newCollab);

  // Record audit log
  apiStore.recordAudit({
    organizationId: workflow.organizationId,
    userId: req.user?.id,
    action: "collaborator:add",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: { collaboratorUserId: userId, role },
  });

  // Record team activity
  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COLLABORATOR_ADDED",
    metadata: { collaboratorUserId: userId, role, userEmail: targetUser.email },
  });

  res.status(201).json({
    success: true,
    data: {
      ...newCollab,
      user: getUserProfile(userId),
    },
    error: null,
  });
});

/**
 * PATCH /api/v1/workflows/:id/collaborators/:userId
 * Update a collaborator's role.
 */
collaborationRouter.patch("/collaborators/:userId", (req: Request, res: Response) => {
  const { id: workflowId, userId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access || !access.canManageCollaborators) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to update collaborators on this workflow.",
      },
    });
    return;
  }

  const parseResult = UpdateCollaboratorSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid update payload.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const collab = Array.from(apiStore.collaborators.values()).find(
    (c) => c.workflowId === workflow.id && c.userId === userId
  );
  if (!collab) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "COLLABORATOR_NOT_FOUND", message: "Collaborator record not found." },
    });
    return;
  }

  const oldRole = collab.role;
  collab.role = parseResult.data.role;
  collab.updatedAt = new Date();
  apiStore.collaborators.set(collab.id, collab);

  apiStore.recordAudit({
    organizationId: workflow.organizationId,
    userId: req.user?.id,
    action: "collaborator:update",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: { collaboratorUserId: userId, oldRole, newRole: collab.role },
  });

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COLLABORATOR_ROLE_UPDATED",
    metadata: { collaboratorUserId: userId, oldRole, newRole: collab.role },
  });

  res.json({
    success: true,
    data: {
      ...collab,
      user: getUserProfile(userId),
    },
    error: null,
  });
});

/**
 * DELETE /api/v1/workflows/:id/collaborators/:userId
 * Remove a collaborator from a workflow.
 */
collaborationRouter.delete("/collaborators/:userId", (req: Request, res: Response) => {
  const { id: workflowId, userId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  const isSelf = req.user?.id === userId;

  // Caller must either be authorized to manage collaborators OR removing themselves
  if (!access || (!access.canManageCollaborators && !isSelf)) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You lack permission to remove collaborators from this workflow.",
      },
    });
    return;
  }

  const collab = Array.from(apiStore.collaborators.values()).find(
    (c) => c.workflowId === workflow.id && c.userId === userId
  );
  if (!collab) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "COLLABORATOR_NOT_FOUND", message: "Collaborator record not found." },
    });
    return;
  }

  apiStore.collaborators.delete(collab.id);

  apiStore.recordAudit({
    organizationId: workflow.organizationId,
    userId: req.user?.id,
    action: "collaborator:remove",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: { removedUserId: userId },
  });

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COLLABORATOR_REMOVED",
    metadata: { removedUserId: userId },
  });

  res.json({
    success: true,
    data: { message: "Collaborator removed successfully." },
    error: null,
  });
});

/**
 * POST /api/v1/workflows/:id/transfer-ownership
 * Transfer primary workflow ownership to another organization member.
 */
collaborationRouter.post("/transfer-ownership", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  if (!access || !access.isOwner) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Only the workflow owner or organization administrator can transfer ownership.",
      },
    });
    return;
  }

  const parseResult = TransferWorkflowOwnershipSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid ownership transfer payload.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { newOwnerId } = parseResult.data;

  // Verify target user is in the organization
  const isMember = Array.from(apiStore.memberships.values()).some(
    (m) => m.organizationId === workflow.organizationId && m.userId === newOwnerId
  );
  if (!isMember) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_NEW_OWNER",
        message: "New owner must be a member of this organization.",
      },
    });
    return;
  }

  const previousOwnerId = workflow.createdById;
  workflow.createdById = newOwnerId;
  workflow.updatedAt = new Date();
  apiStore.workflows.set(workflow.id, workflow);

  // If new owner had a collaborator record, remove it since they are now the owner
  const collabOfNewOwner = Array.from(apiStore.collaborators.values()).find(
    (c) => c.workflowId === workflow.id && c.userId === newOwnerId
  );
  if (collabOfNewOwner) {
    apiStore.collaborators.delete(collabOfNewOwner.id);
  }

  // Preserve previous owner as a MAINTAINER collaborator if they are not org admin
  if (previousOwnerId && previousOwnerId !== newOwnerId) {
    const existingPrevCollab = Array.from(apiStore.collaborators.values()).find(
      (c) => c.workflowId === workflow.id && c.userId === previousOwnerId
    );
    if (!existingPrevCollab) {
      const prevCollabId = `collab_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      apiStore.collaborators.set(prevCollabId, {
        id: prevCollabId,
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        userId: previousOwnerId,
        role: "MAINTAINER",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  apiStore.recordAudit({
    organizationId: workflow.organizationId,
    userId: req.user?.id,
    action: "workflow:transfer_ownership",
    resourceType: "workflow",
    resourceId: workflow.id,
    metadata: { previousOwnerId, newOwnerId },
  });

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "OWNERSHIP_TRANSFERRED",
    metadata: { previousOwnerId, newOwnerId },
  });

  res.json({
    success: true,
    data: workflow,
    error: null,
  });
});

// ==========================================
// 2. WORKFLOW COMMENTS & DISCUSSIONS
// ==========================================

/**
 * GET /api/v1/workflows/:id/comments
 * List threaded discussions on a workflow.
 */
collaborationRouter.get("/comments", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
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
      error: { code: "NOT_FOUND", message: "Workflow not found or access denied." },
    });
    return;
  }

  const { isResolved, status, draftRevision } = req.query as {
    isResolved?: string;
    status?: string;
    draftRevision?: string;
  };

  const allComments = Array.from(apiStore.comments.values()).filter(
    (c) => c.workflowId === workflow.id
  );

  let filtered = allComments;
  if (status === "open") {
    filtered = filtered.filter((c) => !c.isResolved);
  } else if (status === "resolved") {
    filtered = filtered.filter((c) => c.isResolved);
  } else if (isResolved !== undefined) {
    const resolvedBool = isResolved === "true";
    filtered = filtered.filter((c) => c.isResolved === resolvedBool);
  }
  if (draftRevision !== undefined) {
    const revNum = parseInt(draftRevision, 10);
    if (!isNaN(revNum)) {
      filtered = filtered.filter((c) => c.draftRevision === revNum);
    }
  }

  // Build threaded tree: root comments with replies
  const rootComments = filtered
    .filter((c) => !c.parentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const threaded = rootComments.map((root) => {
    const rootProfile = getUserProfile(root.userId);
    const replies = filtered
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((r) => {
        const replyProfile = getUserProfile(r.userId);
        return {
          ...r,
          user: replyProfile,
          author: replyProfile,
        };
      });

    return {
      ...root,
      user: rootProfile,
      author: rootProfile,
      replies,
    };
  });

  res.json({
    success: true,
    data: threaded,
    meta: {
      total: threaded.length,
      totalCommentsAndReplies: filtered.length,
    },
    error: null,
  });
});

/**
 * POST /api/v1/workflows/:id/comments
 * Add a new comment or reply.
 */
collaborationRouter.post("/comments", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
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
      error: { code: "NOT_FOUND", message: "Workflow not found or access denied." },
    });
    return;
  }

  const parseResult = CreateCommentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid comment payload.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { content, nodeId, parentId, draftRevision } = parseResult.data;

  // Validate parent comment if reply
  if (parentId) {
    const parent = apiStore.comments.get(parentId);
    if (!parent || parent.workflowId !== workflow.id) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "PARENT_NOT_FOUND", message: "Parent comment not found on this workflow." },
      });
      return;
    }
  }

  const commentId = `cmt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();

  const newComment: WorkflowCommentRecord = {
    id: commentId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id || "unknown",
    content: content.trim(),
    nodeId: nodeId ? nodeId.trim() : null,
    parentId: parentId || null,
    draftRevision: draftRevision !== undefined ? draftRevision : workflow.draftRevision || 1,
    isResolved: false,
    resolvedById: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.comments.set(commentId, newComment);

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COMMENT_ADDED",
    metadata: {
      commentId,
      isReply: !!parentId,
      draftRevision: newComment.draftRevision,
    },
  });

  const commentProfile = getUserProfile(newComment.userId);
  res.status(201).json({
    success: true,
    data: {
      ...newComment,
      user: commentProfile,
      author: commentProfile,
      replies: [],
    },
    error: null,
  });
});

/**
 * PATCH /api/v1/workflows/:id/comments/:commentId
 * Edit an existing comment.
 */
collaborationRouter.patch("/comments/:commentId", (req: Request, res: Response) => {
  const { id: workflowId, commentId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const comment = apiStore.comments.get(commentId);
  if (!comment || comment.workflowId !== workflow.id) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "COMMENT_NOT_FOUND", message: "Comment not found." },
    });
    return;
  }

  // Only comment author or Org Admin can edit
  const isAuthor = req.user?.id === comment.userId;
  const isOrgAdmin = req.role === "OWNER" || req.role === "ADMIN";
  if (!isAuthor && !isOrgAdmin) {
    res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "You can only edit your own comments." },
    });
    return;
  }

  const parseResult = UpdateCommentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid comment content.",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  comment.content = parseResult.data.content.trim();
  comment.updatedAt = new Date();
  apiStore.comments.set(comment.id, comment);

  const editProfile = getUserProfile(comment.userId);
  res.json({
    success: true,
    data: {
      ...comment,
      user: editProfile,
      author: editProfile,
    },
    error: null,
  });
});

/**
 * POST /api/v1/workflows/:id/comments/:commentId/resolve
 * Resolve or reopen a comment thread.
 */
collaborationRouter.post("/comments/:commentId/resolve", (req: Request, res: Response) => {
  const { id: workflowId, commentId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const comment = apiStore.comments.get(commentId);
  if (!comment || comment.workflowId !== workflow.id) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "COMMENT_NOT_FOUND", message: "Comment not found." },
    });
    return;
  }

  const access = resolveWorkflowAccess(workflow, req);
  const isAuthor = req.user?.id === comment.userId;
  // Comment author, editor, maintainer, or owner can resolve
  if (!access || (!isAuthor && access.level === "VIEWER" && !access.isOwner)) {
    res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Insufficient permissions to resolve comments." },
    });
    return;
  }

  const parseResult = ResolveCommentSchema.safeParse(req.body);
  const shouldResolve = parseResult.success ? parseResult.data.isResolved : true;

  comment.isResolved = shouldResolve;
  comment.resolvedById = shouldResolve ? req.user?.id || null : null;
  comment.resolvedAt = shouldResolve ? new Date() : null;
  comment.updatedAt = new Date();
  apiStore.comments.set(comment.id, comment);

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COMMENT_RESOLVED",
    metadata: { commentId: comment.id, isResolved: shouldResolve },
  });

  const resolveProfile = getUserProfile(comment.userId);
  res.json({
    success: true,
    data: {
      ...comment,
      user: resolveProfile,
      author: resolveProfile,
    },
    error: null,
  });
});

/**
 * DELETE /api/v1/workflows/:id/comments/:commentId
 * Delete a comment thread or reply.
 */
collaborationRouter.delete("/comments/:commentId", (req: Request, res: Response) => {
  const { id: workflowId, commentId } = req.params;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Workflow not found." },
    });
    return;
  }

  const comment = apiStore.comments.get(commentId);
  if (!comment || comment.workflowId !== workflow.id) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "COMMENT_NOT_FOUND", message: "Comment not found." },
    });
    return;
  }

  const isAuthor = req.user?.id === comment.userId;
  const isOrgAdmin = req.role === "OWNER" || req.role === "ADMIN";
  const isWfOwner = workflow.createdById === req.user?.id;

  if (!isAuthor && !isOrgAdmin && !isWfOwner) {
    res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "You lack permission to delete this comment." },
    });
    return;
  }

  // Delete comment and any replies
  apiStore.comments.delete(comment.id);
  for (const [rId, c] of apiStore.comments.entries()) {
    if (c.parentId === comment.id) {
      apiStore.comments.delete(rId);
    }
  }

  apiStore.recordActivity({
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    userId: req.user?.id,
    type: "COMMENT_DELETED",
    metadata: { commentId },
  });

  res.json({
    success: true,
    data: { message: "Comment deleted successfully." },
    error: null,
  });
});

// ==========================================
// 3. TEAM ACTIVITY FEED (Workflow-Level)
// ==========================================

/**
 * GET /api/v1/workflows/:id/activities
 * Chronological collaboration activity feed for a workflow.
 */
collaborationRouter.get("/activities", (req: Request, res: Response) => {
  const workflowId = req.params.id;
  const workflow = apiStore.workflows.get(workflowId);

  if (!workflow || workflow.organizationId !== req.organizationId || workflow.deletedAt) {
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
      error: { code: "NOT_FOUND", message: "Workflow not found or access denied." },
    });
    return;
  }

  const queryResult = ActivityFilterQuerySchema.safeParse(req.query);
  const page = queryResult.success ? queryResult.data.page : 1;
  const pageSize = queryResult.success ? queryResult.data.pageSize : 20;
  const filterType = queryResult.success ? queryResult.data.type : undefined;
  const filterUser = queryResult.success ? queryResult.data.userId : undefined;

  let activities = apiStore.activities.filter((a) => a.workflowId === workflow.id);

  if (filterType) {
    activities = activities.filter((a) => a.type === filterType);
  }
  if (filterUser) {
    activities = activities.filter((a) => a.userId === filterUser);
  }

  // Sort newest first
  activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = activities.length;
  const startIndex = (page - 1) * pageSize;
  const paginated = activities.slice(startIndex, startIndex + pageSize).map((a) => {
    const actorProfile = getUserProfile(a.userId);
    return {
      ...a,
      user: actorProfile,
      actor: actorProfile,
    };
  });

  res.json({
    success: true,
    data: paginated,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
    error: null,
  });
});
