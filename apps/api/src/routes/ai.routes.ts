import { Router, Request, Response } from "express";
import {
  UpdateAiConfigSchema,
  GenerateWorkflowSchema,
  EditWorkflowSchema,
  ExplainWorkflowSchema,
  AnalyzeFailureSchema,
  AssistExpressionSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { aiService } from "../services/ai/ai.service.js";
import { apiStore } from "../store.js";

export const aiRouter = Router({ mergeParams: true });

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
  orgId: string,
): { userId: string; role: Role } | null {
  if (!req.user) return null;
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

// All AI endpoints require authentication
aiRouter.use(requireAuth);

/**
 * 1. GET /config: Get organization AI configuration (redacted)
 */
aiRouter.get("/config", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:read permission." },
    });
  }

  const config = aiService.getAiConfig(orgId, true);
  return res.json({ success: true, data: config, error: null });
});

/**
 * 2. PUT /config: Update organization AI configuration
 */
aiRouter.put("/config", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:admin")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:admin permission." },
    });
  }

  const parseResult = UpdateAiConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid AI configuration payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const updated = aiService.updateAiConfig(
      orgId,
      parseResult.data,
      caller.userId,
    );
    return res.json({ success: true, data: updated, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 3. POST /test: Test AI provider connectivity
 */
aiRouter.post("/test", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:admin")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:admin permission." },
    });
  }

  try {
    const result = await aiService.testConnectivity(orgId);
    return res.json({ success: true, data: result, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 4. POST /generate-workflow: AI-assisted workflow generation
 */
aiRouter.post("/generate-workflow", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:generate")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:generate permission." },
    });
  }

  const parseResult = GenerateWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid workflow generation prompt.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const result = await aiService.generateWorkflow(
      orgId,
      parseResult.data,
      caller,
    );
    return res.json({ success: true, data: result, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 5. POST /edit-workflow: Conversational workflow editing
 */
aiRouter.post("/edit-workflow", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:generate")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:generate permission." },
    });
  }

  const parseResult = EditWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid workflow edit payload.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const result = await aiService.editWorkflow(
      orgId,
      parseResult.data,
      caller,
    );
    return res.json({ success: true, data: result, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 6. POST /explain-workflow: Workflow topology and risk explanation
 */
aiRouter.post("/explain-workflow", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:read permission." },
    });
  }

  const parseResult = ExplainWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid workflow explanation request.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const explanation = await aiService.explainWorkflow(
      orgId,
      parseResult.data,
      caller,
    );
    return res.json({ success: true, data: explanation, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 7. POST /analyze-failure: Read-only execution failure analysis
 */
aiRouter.post("/analyze-failure", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:read permission." },
    });
  }

  const parseResult = AnalyzeFailureSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid failure analysis request.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const analysis = await aiService.analyzeExecutionFailure(
      orgId,
      parseResult.data.executionId,
      caller,
    );
    return res.json({ success: true, data: analysis, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});

/**
 * 8. POST /assist-expression: Safe expression synthesis and validation
 */
aiRouter.post("/assist-expression", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "ai:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires ai:read permission." },
    });
  }

  const parseResult = AssistExpressionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid expression assistance request.",
        details: parseResult.error.flatten(),
      },
    });
  }

  try {
    const result = await aiService.assistExpression(
      orgId,
      parseResult.data,
      caller,
    );
    return res.json({ success: true, data: result, error: null });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  }
});
