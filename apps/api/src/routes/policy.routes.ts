import { Router, Request, Response } from "express";
import { requirePermission } from "../middleware/rbac.js";
import { policyService } from "../services/policy.service.js";
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  CreatePolicyExceptionSchema,
  SimulatePolicySchema,
  PolicyEvaluationContext,
} from "@flowforge/shared";

export const policyRouter = Router({ mergeParams: true });

// Helper to extract organizationId
function getOrgId(req: Request): string {
  const orgId = req.params.organizationId || (req as any).organizationId;
  if (!orgId) throw new Error("ORGANIZATION_REQUIRED");
  return orgId;
}

// ==========================================
// 1. Policy Catalog & Creation (Static/Collection Routes)
// ==========================================

// GET / - List policies
policyRouter.get(
  "/",
  requirePermission("policy:read"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const { category, status, workspaceId } = req.query;

      const policies = policyService.listPolicies(organizationId, {
        category: category as string,
        status: status as string,
        workspaceId: workspaceId as string,
      });

      res.json({
        success: true,
        data: policies,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "POLICY_ERROR", message: err.message },
      });
    }
  },
);

// POST / - Create draft policy
policyRouter.post(
  "/",
  requirePermission("policy:write"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const parseResult = CreatePolicySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid policy definition",
            details: parseResult.error.flatten(),
          },
        });
        return;
      }

      const policy = policyService.createPolicy(
        organizationId,
        parseResult.data,
        (req as any).user?.id || "usr_anonymous",
      );

      res.status(201).json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "POLICY_CREATE_FAILED", message: err.message },
      });
    }
  },
);

// ==========================================
// 2. Evaluation & Simulation Endpoints
// ==========================================

// POST /evaluate - Authoritative server-side policy evaluation
policyRouter.post(
  "/evaluate",
  requirePermission("policy:evaluate"),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const callerUser = (req as any).user;
      const callerRole = (req as any).membership?.role || "MEMBER";

      const context: PolicyEvaluationContext = {
        organizationId,
        workspaceId: req.body?.workspaceId,
        principal: {
          id: callerUser?.id || "usr_system",
          role: callerRole,
          email: callerUser?.email,
          ip: req.ip,
        },
        resourceType: req.body?.resourceType,
        resourceId: req.body?.resourceId,
        operation: req.body?.operation,
        environment: req.body?.environment,
        attributes: req.body?.attributes || {},
        correlationId: req.headers["x-correlation-id"] as string,
      };

      const decision = await policyService.evaluate(context);

      res.json({
        success: true,
        data: decision,
        error: null,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        data: null,
        error: { code: "EVALUATION_ERROR", message: err.message },
      });
    }
  },
);

// POST /simulate - Preview evaluation without state change
policyRouter.post(
  "/simulate",
  requirePermission("policy:read"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const parseResult = SimulatePolicySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid simulation payload",
            details: parseResult.error.flatten(),
          },
        });
        return;
      }

      const result = policyService.simulate(organizationId, parseResult.data);

      res.json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "SIMULATION_FAILED", message: err.message },
      });
    }
  },
);

// ==========================================
// 3. Exceptions & Overrides Sub-routes
// ==========================================

// GET /exceptions - List exceptions
policyRouter.get(
  "/exceptions",
  requirePermission("policy:read"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const exceptions = policyService.listExceptions(organizationId);

      res.json({
        success: true,
        data: exceptions,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "EXCEPTIONS_FETCH_FAILED", message: err.message },
      });
    }
  },
);

// POST /exceptions - Request time-limited exception
policyRouter.post(
  "/exceptions",
  requirePermission("policy:write"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const parseResult = CreatePolicyExceptionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid exception request",
            details: parseResult.error.flatten(),
          },
        });
        return;
      }

      const exception = policyService.requestException(
        organizationId,
        parseResult.data,
        (req as any).user?.id || "usr_anonymous",
      );

      res.status(201).json({
        success: true,
        data: exception,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "EXCEPTION_REQUEST_FAILED", message: err.message },
      });
    }
  },
);

// POST /exceptions/:id/decide - Decide exception (Approve / Reject)
policyRouter.post(
  "/exceptions/:id/decide",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const { decision } = req.body;
      if (decision !== "APPROVED" && decision !== "REJECTED") {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "INVALID_DECISION",
            message: "Decision must be APPROVED or REJECTED",
          },
        });
        return;
      }

      const decided = policyService.decideException(
        organizationId,
        req.params.id,
        decision,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: decided,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "DECISION_FAILED", message: err.message },
      });
    }
  },
);

// ==========================================
// 4. Violations & Drift Sub-routes
// ==========================================

// GET /violations - List violations
policyRouter.get(
  "/violations",
  requirePermission("policy:read"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const { status, severity, resourceType } = req.query;

      const violations = policyService.listViolations(organizationId, {
        status: status as string,
        severity: severity as string,
        resourceType: resourceType as string,
      });

      res.json({
        success: true,
        data: violations,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "VIOLATIONS_FETCH_FAILED", message: err.message },
      });
    }
  },
);

// PATCH /violations/:id - Update violation status / assignment
policyRouter.patch(
  "/violations/:id",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const { status, assignedToId, remediationNotes } = req.body;

      const updated = policyService.updateViolation(
        organizationId,
        req.params.id,
        { status, assignedToId, remediationNotes },
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: updated,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "VIOLATION_UPDATE_FAILED", message: err.message },
      });
    }
  },
);

// ==========================================
// 5. Parameterized Policy By ID & Lifecycle Routes
// ==========================================

// GET /:id - Get policy by ID
policyRouter.get(
  "/:id",
  requirePermission("policy:read"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const policy = policyService.getPolicy(organizationId, req.params.id);

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "POLICY_NOT_FOUND", message: err.message },
      });
    }
  },
);

// PATCH /:id - Update draft policy
policyRouter.patch(
  "/:id",
  requirePermission("policy:write"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const parseResult = UpdatePolicySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid policy update payload",
            details: parseResult.error.flatten(),
          },
        });
        return;
      }

      const updated = policyService.updatePolicy(
        organizationId,
        req.params.id,
        parseResult.data,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: updated,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "POLICY_UPDATE_FAILED", message: err.message },
      });
    }
  },
);

// POST /:id/review - Submit for review
policyRouter.post(
  "/:id/review",
  requirePermission("policy:write"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const policy = policyService.submitForReview(
        organizationId,
        req.params.id,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "REVIEW_SUBMISSION_FAILED", message: err.message },
      });
    }
  },
);

// POST /:id/approve - Approve policy (dual control)
policyRouter.post(
  "/:id/approve",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const callerUser = (req as any).user;
      const callerRole = (req as any).membership?.role || "ADMIN";

      const policy = policyService.approvePolicy(
        organizationId,
        req.params.id,
        callerUser?.id || "usr_anonymous",
        callerRole,
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      const isConflict = err.message === "DUAL_CONTROL_VIOLATION";
      res.status(isConflict ? 403 : 400).json({
        success: false,
        data: null,
        error: {
          code: isConflict ? "DUAL_CONTROL_VIOLATION" : "APPROVAL_FAILED",
          message: err.message,
        },
      });
    }
  },
);

// POST /:id/activate - Activate approved policy
policyRouter.post(
  "/:id/activate",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const policy = policyService.activatePolicy(
        organizationId,
        req.params.id,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "ACTIVATION_FAILED", message: err.message },
      });
    }
  },
);

// POST /:id/suspend - Suspend active policy
policyRouter.post(
  "/:id/suspend",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const reason = req.body?.reason;
      const policy = policyService.suspendPolicy(
        organizationId,
        req.params.id,
        (req as any).user?.id || "usr_anonymous",
        reason,
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "SUSPENSION_FAILED", message: err.message },
      });
    }
  },
);

// POST /:id/rollback - Roll back to earlier version
policyRouter.post(
  "/:id/rollback",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const targetVersion = Number(req.body?.targetVersion);
      if (!targetVersion || isNaN(targetVersion)) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "INVALID_TARGET_VERSION",
            message: "targetVersion is required",
          },
        });
        return;
      }

      const policy = policyService.rollbackPolicy(
        organizationId,
        req.params.id,
        targetVersion,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "ROLLBACK_FAILED", message: err.message },
      });
    }
  },
);

// POST /:id/retire - Retire policy
policyRouter.post(
  "/:id/retire",
  requirePermission("policy:admin"),
  (req: Request, res: Response) => {
    try {
      const organizationId = getOrgId(req);
      const policy = policyService.retirePolicy(
        organizationId,
        req.params.id,
        (req as any).user?.id || "usr_anonymous",
      );

      res.json({
        success: true,
        data: policy,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "RETIRE_FAILED", message: err.message },
      });
    }
  },
);
