import { Router, Request, Response } from "express";
import {
  SearchQuerySchema,
  CreateSavedSearchSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { searchService } from "../services/search.service.js";
import { apiStore } from "../store.js";

export const searchRouter = Router({ mergeParams: true });

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

searchRouter.use(requireAuth);

// ==========================================
// 1. Unified Search Endpoint
// ==========================================
const handleSearch = async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Organization ID is required for search operations.",
      },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "User is not a member of this organization.",
      },
    });
  }

  const queryParams: Record<string, unknown> = { ...req.query };
  if (typeof queryParams.types === "string") {
    queryParams.types = queryParams.types
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const parseResult = SearchQuerySchema.safeParse(queryParams);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid search parameters.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const searchResponse = await searchService.search({
      ...parseResult.data,
      organizationId: orgId,
      callerRole: caller.role,
      callerUserId: caller.userId,
    });

    res.json({
      success: true,
      data: searchResponse,
      error: null,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "SEARCH_FAILED",
        message: err.message || "Failed to execute search.",
      },
    });
  }
};

searchRouter.get("/", handleSearch);
searchRouter.get("/query", handleSearch);

// ==========================================
// 2. Saved Searches Management
// ==========================================
searchRouter.post("/saved", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Organization ID required.",
      },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "search:saved:write")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires search:saved:write permission.",
      },
    });
  }

  const parseResult = CreateSavedSearchSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid saved search payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const savedSearch = searchService.createSavedSearch({
    ...parseResult.data,
    organizationId: orgId,
    userId: caller.userId,
  });

  res.status(201).json({
    success: true,
    data: savedSearch,
    error: null,
  });
});

searchRouter.get("/saved", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Organization ID required.",
      },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "User is not a member of this organization.",
      },
    });
  }

  const list = searchService.listSavedSearches(orgId, caller.userId);
  res.json({
    success: true,
    data: list,
    error: null,
  });
});

searchRouter.delete("/saved/:id", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Organization ID required.",
      },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "User is not a member of this organization.",
      },
    });
  }

  const deleted = searchService.deleteSavedSearch(
    req.params.id,
    orgId,
    caller.userId,
    caller.role,
  );

  if (!deleted) {
    return res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Saved search not found or unauthorized to delete.",
      },
    });
  }

  res.json({
    success: true,
    data: { deleted: true, id: req.params.id },
    error: null,
  });
});

// ==========================================
// 3. Search Observability & Metrics
// ==========================================
searchRouter.get("/metrics", (req: Request, res: Response) => {
  const metrics = searchService.getMetrics();
  res.json({
    success: true,
    data: metrics,
    error: null,
  });
});
