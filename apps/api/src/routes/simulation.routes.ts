import { Router, Request, Response } from "express";
import {
  CreateTestCaseSchema,
  UpdateTestCaseSchema,
  RunSimulationSchema,
  CreateTestFixtureSchema,
  CreateDebugSessionSchema,
  CompareWorkflowVersionsSchema,
  UpdatePublishingGateConfigSchema,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { simulationService } from "../services/simulation.service.js";
import { apiStore } from "../store.js";

export const workflowSimulationRouter = Router({ mergeParams: true });
export const testingGlobalRouter = Router();

workflowSimulationRouter.use(requireAuth);
testingGlobalRouter.use(requireAuth);

function getOrgId(req: Request): string {
  return (req.params.organizationId as string) || req.organizationId!;
}

function getWorkflowId(req: Request): string {
  return req.params.workflowId || req.params.id;
}

// ==========================================
// 1. WORKFLOW SIMULATION RUNNER
// ==========================================
workflowSimulationRouter.post(
  ["/simulate", "/simulation"],
  requirePermission("workflow:simulate"),
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const parseResult = RunSimulationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PARAMETERS",
          message: "Invalid simulation parameters",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    // Verify tenant ownership of workflow
    const wf = apiStore.workflows.get(workflowId);
    if (!wf || wf.organizationId !== orgId || wf.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    // Check authorization for real integration testing if requested
    const mode = parseResult.data.mode;
    const isRealAuthorized =
      parseResult.data.authorizedForRealIntegration &&
      (req as any).user &&
      ((req as any).role === "OWNER" ||
        (req as any).role === "ADMIN" ||
        (req as any).membership?.role === "OWNER" ||
        (req as any).membership?.role === "ADMIN");

    if (mode === "ISOLATED_REAL_INTEGRATION" && !isRealAuthorized) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "REAL_INTEGRATION_NOT_AUTHORIZED",
          message:
            "ISOLATED_REAL_INTEGRATION requires explicit authorization and OWNER or ADMIN privileges.",
        },
      });
      return;
    }

    try {
      const result = await simulationService.simulateWorkflow({
        organizationId: orgId,
        workflowId,
        workflowVersionId: parseResult.data.workflowVersionId,
        mode,
        inputData: parseResult.data.inputData,
        mockFixtures: parseResult.data.mockFixtures,
        failureInjections: parseResult.data.failureInjections,
        approvalDecisions: parseResult.data.approvalDecisions,
        authorizedForRealIntegration: isRealAuthorized,
      });

      res.json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: "SIMULATION_FAILED",
          message: err.message,
        },
      });
    }
  },
);

// ==========================================
// 2. WORKFLOW TEST CASES CRUD
// ==========================================
workflowSimulationRouter.post(
  "/tests",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const parseResult = CreateTestCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_TEST_CASE",
          message: "Invalid test case configuration",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const wf = apiStore.workflows.get(workflowId);
    if (!wf || wf.organizationId !== orgId || wf.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const record = simulationService.createTestCase(
      orgId,
      workflowId,
      parseResult.data,
      req.user?.id,
    );

    res.status(201).json({
      success: true,
      data: record,
      error: null,
    });
  },
);

workflowSimulationRouter.get(
  "/tests",
  requirePermission("workflow:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const testCases = simulationService.listTestCases(orgId, workflowId);
    res.json({
      success: true,
      data: testCases,
      error: null,
    });
  },
);

workflowSimulationRouter.get(
  "/tests/:testId",
  requirePermission("workflow:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const tc = simulationService.getTestCase(orgId, req.params.testId);

    if (!tc) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "TEST_CASE_NOT_FOUND", message: "Test case not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: tc,
      error: null,
    });
  },
);

workflowSimulationRouter.patch(
  "/tests/:testId",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const parseResult = UpdateTestCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PARAMETERS",
          message: "Invalid test case updates",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const updated = simulationService.updateTestCase(
      orgId,
      req.params.testId,
      parseResult.data,
    );

    if (!updated) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "TEST_CASE_NOT_FOUND", message: "Test case not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: updated,
      error: null,
    });
  },
);

workflowSimulationRouter.delete(
  "/tests/:testId",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const deleted = simulationService.deleteTestCase(orgId, req.params.testId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "TEST_CASE_NOT_FOUND", message: "Test case not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: { deleted: true },
      error: null,
    });
  },
);

// ==========================================
// 3. RUN TEST CASE & TEST SUITE
// ==========================================
workflowSimulationRouter.post(
  "/tests/:testId/run",
  requirePermission("workflow:test"),
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    try {
      const run = await simulationService.runTestCase(
        orgId,
        req.params.testId,
        req.body,
        req.user?.id,
      );

      res.json({
        success: true,
        data: run,
        error: null,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "TEST_RUN_FAILED", message: err.message },
      });
    }
  },
);

workflowSimulationRouter.post(
  "/tests/run-all",
  requirePermission("workflow:test"),
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const summary = await simulationService.runAllTests(
      orgId,
      workflowId,
      req.user?.id,
    );

    res.json({
      success: true,
      data: summary,
      error: null,
    });
  },
);

// ==========================================
// 4. REGRESSION COMPARISON
// ==========================================
workflowSimulationRouter.post(
  "/compare",
  requirePermission("workflow:test"),
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const parseResult = CompareWorkflowVersionsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PARAMETERS",
          message: "Invalid comparison parameters",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    try {
      const diff = await simulationService.compareVersions(
        orgId,
        workflowId,
        parseResult.data,
      );

      res.json({
        success: true,
        data: diff,
        error: null,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: "COMPARISON_FAILED", message: err.message },
      });
    }
  },
);

// ==========================================
// 5. STEPWISE DEBUGGING & BREAKPOINTS
// ==========================================
workflowSimulationRouter.post(
  "/debug/session",
  requirePermission("workflow:simulate"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const parseResult = CreateDebugSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PARAMETERS",
          message: "Invalid debug session parameters",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const session = simulationService.createDebugSession(
      orgId,
      workflowId,
      parseResult.data,
    );

    res.status(201).json({
      success: true,
      data: session,
      error: null,
    });
  },
);

workflowSimulationRouter.post(
  "/debug/session/:sessionId/step",
  requirePermission("workflow:simulate"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    try {
      const session = simulationService.stepDebugSession(
        orgId,
        req.params.sessionId,
      );
      res.json({
        success: true,
        data: session,
        error: null,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "DEBUG_STEP_FAILED", message: err.message },
      });
    }
  },
);

workflowSimulationRouter.post(
  "/debug/session/:sessionId/resume",
  requirePermission("workflow:simulate"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    try {
      const session = simulationService.resumeDebugSession(
        orgId,
        req.params.sessionId,
      );
      res.json({
        success: true,
        data: session,
        error: null,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "DEBUG_RESUME_FAILED", message: err.message },
      });
    }
  },
);

workflowSimulationRouter.delete(
  "/debug/session/:sessionId",
  requirePermission("workflow:simulate"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const cancelled = simulationService.cancelDebugSession(
      orgId,
      req.params.sessionId,
    );
    res.json({
      success: true,
      data: { cancelled },
      error: null,
    });
  },
);

// ==========================================
// 6. PUBLISHING GATES & GATE STATUS
// ==========================================
workflowSimulationRouter.get(
  "/gate-status",
  requirePermission("workflow:read"),
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const wf = apiStore.workflows.get(workflowId);
    if (!wf || wf.organizationId !== orgId || wf.deletedAt) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Workflow not found." },
      });
      return;
    }

    const evaluation = await simulationService.evaluatePublishingGates(
      orgId,
      workflowId,
      wf.draftDefinition,
    );

    res.json({
      success: true,
      data: evaluation,
      error: null,
    });
  },
);

workflowSimulationRouter.get(
  "/gate-config",
  requirePermission("workflow:read"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);
    const config = simulationService.getPublishingGateConfig(orgId, workflowId);

    res.json({
      success: true,
      data: config,
      error: null,
    });
  },
);

workflowSimulationRouter.put(
  "/gate-config",
  requirePermission("workflow:write"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const workflowId = getWorkflowId(req);

    const parseResult = UpdatePublishingGateConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_PARAMETERS",
          message: "Invalid gate config parameters",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const updated = simulationService.updatePublishingGateConfig(
      orgId,
      workflowId,
      parseResult.data,
    );

    res.json({
      success: true,
      data: updated,
      error: null,
    });
  },
);

// ==========================================
// 7. GLOBAL TESTING & FIXTURES ROUTER
// ==========================================
testingGlobalRouter.post(
  "/fixtures",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const parseResult = CreateTestFixtureSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_FIXTURE",
          message: "Invalid test fixture configuration",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const fixture = simulationService.createTestFixture(
      orgId,
      parseResult.data,
    );
    res.status(201).json({
      success: true,
      data: fixture,
      error: null,
    });
  },
);

testingGlobalRouter.get(
  "/fixtures",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const connectorType = req.query.connectorType as string | undefined;
    const fixtures = simulationService.listTestFixtures(orgId, connectorType);

    res.json({
      success: true,
      data: fixtures,
      error: null,
    });
  },
);

testingGlobalRouter.delete(
  "/fixtures/:fixtureId",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const deleted = simulationService.deleteTestFixture(
      orgId,
      req.params.fixtureId,
    );

    if (!deleted) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "FIXTURE_NOT_FOUND", message: "Fixture not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: { deleted: true },
      error: null,
    });
  },
);

testingGlobalRouter.post(
  "/contracts/validate",
  requirePermission("workflow:test"),
  (req: Request, res: Response) => {
    const { connectorType, operation, payload } = req.body;
    const validation = simulationService.validateConnectorContract(
      connectorType,
      operation,
      payload || {},
    );

    res.json({
      success: true,
      data: validation,
      error: null,
    });
  },
);
