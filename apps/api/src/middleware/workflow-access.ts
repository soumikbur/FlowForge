import { Request, Response, NextFunction } from "express";
import { apiStore, WorkflowRecord } from "../store.js";

export type WorkflowAccessLevel = "VIEWER" | "EDITOR" | "MAINTAINER" | "OWNER";

export interface WorkflowAccessContext {
  workflow: WorkflowRecord;
  level: WorkflowAccessLevel;
  isOwner: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canManageCollaborators: boolean;
  canDelete: boolean;
}

declare global {
  namespace Express {
    interface Request {
      workflowAccess?: WorkflowAccessContext;
    }
  }
}

export function resolveWorkflowAccess(
  workflow: WorkflowRecord,
  req: Request,
): WorkflowAccessContext | null {
  // 1. Strict cross-tenant check
  if (workflow.organizationId !== req.organizationId || workflow.deletedAt) {
    return null;
  }

  const userId = req.user?.id;
  const orgRole = req.role;

  // 2. Org Owner or Org Admin: full workflow ownership privileges
  if (orgRole === "OWNER" || orgRole === "ADMIN") {
    return {
      workflow,
      level: "OWNER",
      isOwner: true,
      canEdit: true,
      canPublish: true,
      canManageCollaborators: true,
      canDelete: true,
    };
  }

  // 3. Workflow Creator: full workflow ownership privileges
  if (userId && workflow.createdById === userId) {
    return {
      workflow,
      level: "OWNER",
      isOwner: true,
      canEdit: true,
      canPublish: true,
      canManageCollaborators: true,
      canDelete: true,
    };
  }

  // 4. Check explicit workflow collaborator assignment
  if (userId) {
    const collaborator = Array.from(apiStore.collaborators.values()).find(
      (c) => c.workflowId === workflow.id && c.userId === userId,
    );

    if (collaborator) {
      if (collaborator.role === "MAINTAINER") {
        return {
          workflow,
          level: "MAINTAINER",
          isOwner: false,
          canEdit: true,
          canPublish: true,
          canManageCollaborators: true,
          canDelete: false,
        };
      }
      if (collaborator.role === "EDITOR") {
        return {
          workflow,
          level: "EDITOR",
          isOwner: false,
          canEdit: true,
          canPublish: false,
          canManageCollaborators: false,
          canDelete: false,
        };
      }
      if (collaborator.role === "VIEWER") {
        return {
          workflow,
          level: "VIEWER",
          isOwner: false,
          canEdit: false,
          canPublish: false,
          canManageCollaborators: false,
          canDelete: false,
        };
      }
    }
  }

  // 5. Default Organization Member (read-only view access unless assigned as collaborator)
  if (orgRole === "MEMBER") {
    return {
      workflow,
      level: "VIEWER",
      isOwner: false,
      canEdit: false,
      canPublish: false,
      canManageCollaborators: false,
      canDelete: false,
    };
  }

  // 6. Default Organization Viewer
  if (orgRole === "VIEWER") {
    return {
      workflow,
      level: "VIEWER",
      isOwner: false,
      canEdit: false,
      canPublish: false,
      canManageCollaborators: false,
      canDelete: false,
    };
  }

  return null;
}

export function requireWorkflowAccess(
  minLevel: WorkflowAccessLevel = "VIEWER",
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const workflowId = req.params.id || req.params.workflowId;
    if (!workflowId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Workflow ID parameter required.",
        },
      });
      return;
    }

    const workflow = apiStore.workflows.get(workflowId);
    if (!workflow) {
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

    const levelRank: Record<WorkflowAccessLevel, number> = {
      VIEWER: 1,
      EDITOR: 2,
      MAINTAINER: 3,
      OWNER: 4,
    };

    if (levelRank[access.level] < levelRank[minLevel]) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: `Insufficient workflow permissions: requires '${minLevel}', you have '${access.level}'.`,
        },
      });
      return;
    }

    req.workflowAccess = access;
    next();
  };
}
