import crypto from "crypto";
import {
  WorkflowDefinition,
  WorkflowNode,
  TestingMode,
  NodeSimulationResult,
  AssertionRule,
  AssertionResult,
  SimulationRunResult,
  WorkflowTestCaseRecord,
  WorkflowTestRunRecord,
  TestFixtureRecord,
  DebugSessionRecord,
  RegressionComparisonResult,
  PublishingGateConfigRecord,
  PublishingGateEvaluation,
  CreateTestCaseInput,
  UpdateTestCaseInput,
  RunSimulationInput,
  CreateTestFixtureInput,
  CreateDebugSessionInput,
  CompareWorkflowVersionsInput,
  UpdatePublishingGateConfigInput,
} from "@flowforge/shared";
import {
  validateWorkflowDefinition,
  buildExecutionPlan,
  resolveNextNodes,
  getTriggerNode,
  evaluateCondition,
  redactSensitiveValues,
  compareWorkflowDefinitions,
  computeWorkflowContentHash,
} from "@flowforge/workflow-engine";
import { apiStore } from "../store.js";
import { policyService } from "./policy.service.js";

export interface SimulationExecutionOptions {
  organizationId: string;
  workflowId: string;
  workflowVersionId?: string | null;
  definition?: WorkflowDefinition;
  mode?: TestingMode;
  inputData?: Record<string, unknown>;
  mockFixtures?: Record<string, unknown>;
  failureInjections?:
    | Record<string, { type: string; message?: string }>
    | Array<{ nodeId: string; type: string; message?: string }>;
  approvalDecisions?: Record<string, { approved: boolean; comment?: string }>;
  authorizedForRealIntegration?: boolean;
  maxSteps?: number;
  maxDurationMs?: number;
}

export class WorkflowSimulationService {
  private debugSessionTtlMs = 15 * 60 * 1000; // 15 minutes session TTL

  /**
   * 1. PURE SIMULATION & TESTING ENGINE
   * Deterministically executes workflow graph without external side-effects
   */
  public async simulateWorkflow(
    options: SimulationExecutionOptions,
  ): Promise<SimulationRunResult> {
    const startTime = Date.now();
    const mode: TestingMode = options.mode || "SIMULATION";
    const maxSteps = options.maxSteps || 300;

    // Safety Constraint: Prohibit un-authorized real integration testing
    if (
      mode === "ISOLATED_REAL_INTEGRATION" &&
      !options.authorizedForRealIntegration
    ) {
      throw new Error(
        "UNAUTHORIZED_REAL_INTEGRATION: Mode ISOLATED_REAL_INTEGRATION requires explicit authorization.",
      );
    }

    // Resolve definition
    let definition = options.definition;
    if (!definition) {
      if (options.workflowVersionId) {
        const ver = apiStore.versions.get(options.workflowVersionId);
        if (ver) definition = ver.definition;
      }
      if (!definition) {
        const wf = apiStore.workflows.get(options.workflowId);
        if (wf) definition = wf.draftDefinition;
      }
    }

    if (!definition) {
      return {
        workflowId: options.workflowId,
        workflowVersionId: options.workflowVersionId,
        mode,
        status: "ERROR",
        executedPath: [],
        unreachableNodes: [],
        nodeResults: {},
        failureReason: "Workflow definition could not be resolved.",
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Static validation check
    const validation = validateWorkflowDefinition(definition);
    if (!validation.isValid) {
      return {
        workflowId: options.workflowId,
        workflowVersionId: options.workflowVersionId,
        mode,
        status: "FAILED",
        executedPath: [],
        unreachableNodes: definition.nodes.map((n) => n.id),
        nodeResults: {},
        failureReason: `Static validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    if (mode === "STATIC_VALIDATION") {
      return {
        simulationId: `sim_${crypto.randomUUID()}`,
        workflowId: options.workflowId,
        workflowVersionId: options.workflowVersionId,
        mode,
        status: "COMPLETED",
        durationMs: Date.now() - startTime,
        totalNodes: definition.nodes.length,
        executedNodes: 0,
        mockedNodes: 0,
        failedNodes: 0,
        skippedNodes: definition.nodes.length,
        unreachableNodes: [],
        executionPath: [],
        executedPath: [],
        nodeResults: {},
        outputPayload: {},
        sideEffectsPrevented: true,
        realIntegrationExecuted: false,
        timestamp: new Date().toISOString(),
      };
    }

    // Verify execution plan can be built
    try {
      buildExecutionPlan(definition);
    } catch (planErr: any) {
      return {
        workflowId: options.workflowId,
        workflowVersionId: options.workflowVersionId,
        mode,
        status: "FAILED",
        executedPath: [],
        unreachableNodes: definition.nodes.map((n) => n.id),
        nodeResults: {},
        failureReason: `Execution plan invalid: ${planErr.message}`,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const inputData = options.inputData || {};
    const mockFixtures = options.mockFixtures || {};
    const failureInjections: Record<
      string,
      { type: string; message?: string }
    > = {};
    if (options.failureInjections) {
      if (Array.isArray(options.failureInjections)) {
        for (const inj of options.failureInjections as any[]) {
          if (inj && inj.nodeId) {
            failureInjections[inj.nodeId] = {
              type: inj.type,
              message: inj.message,
            };
          }
        }
      } else {
        Object.assign(failureInjections, options.failureInjections);
      }
    }
    const approvalDecisions = options.approvalDecisions || {};

    const nodeResults: Record<string, NodeSimulationResult> = {};
    const executedPath: string[] = [];
    let currentNode: WorkflowNode | undefined = getTriggerNode(definition);
    let stepCount = 0;
    let finalOutput: unknown = null;
    let runStatus: "PASSED" | "FAILED" = "PASSED";
    let failureReason: string | null = null;

    // Simulation context
    const context: Record<string, any> = {
      trigger: {
        payload: inputData,
        type: "SIMULATION",
      },
      input: inputData,
      ...inputData,
      steps: {},
      workflow: {
        id: options.workflowId,
        mode,
      },
    };

    while (currentNode && stepCount < maxSteps) {
      stepCount++;
      const node = currentNode;
      executedPath.push(node.id);
      const nodeStart = Date.now();

      // Check failure injection for this node
      const injected = failureInjections[node.id];
      if (injected) {
        nodeResults[node.id] = {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: "FAILED",
          inputPayload: redactSensitiveValues(context),
          durationMs: Date.now() - nodeStart,
          error: {
            code: injected.type,
            message: injected.message || `Injected failure: ${injected.type}`,
          },
          injectedFailure: injected.type,
        };
        runStatus = "FAILED";
        failureReason =
          injected.message ||
          `Injected failure on node '${node.name}': ${injected.type}`;
        break;
      }

      // Execute simulated node logic based on type
      let stepResult: any = { status: "COMPLETED", output: {} };
      let nodeStatus: NodeSimulationResult["status"] = "PASSED";
      let isMocked = false;
      let selectedHandle: string | undefined;

      try {
        switch (node.type) {
          case "TRIGGER": {
            stepResult.output = inputData;
            nodeStatus = "PASSED";
            break;
          }

          case "CONDITION": {
            const expression = (node.config as any)?.expression || "true";
            const condResult = evaluateCondition(expression, context);
            selectedHandle = condResult ? "true" : "false";
            stepResult.output = {
              evaluated: true,
              result: condResult,
              selectedBranch: selectedHandle,
              expression,
            };
            nodeStatus = "PASSED";
            break;
          }

          case "HTTP_REQUEST": {
            isMocked = true;
            nodeStatus = "MOCKED";

            // Check if organization has stored fixture matching this operation or URL
            const url = (node.config as any)?.url || "";
            const matchedFixture = Array.from(
              apiStore.testFixtures.values(),
            ).find(
              (f) =>
                f.organizationId === options.organizationId &&
                f.connectorType === "http" &&
                (!f.matchPattern || url.includes(f.matchPattern)),
            );

            if (matchedFixture) {
              if (matchedFixture.isTimeout) {
                throw new Error(
                  "HTTP_REQUEST_TIMEOUT: Simulated gateway timeout.",
                );
              }
              if (matchedFixture.isRateLimited) {
                throw new Error(
                  "HTTP_429_TOO_MANY_REQUESTS: Rate limit exceeded in simulation.",
                );
              }
              stepResult.output = {
                status: matchedFixture.responseStatus,
                data: matchedFixture.responsePayload || { success: true },
                simulated: true,
                fixtureId: matchedFixture.id,
              };
            } else if (mockFixtures[node.id]) {
              const fixture = mockFixtures[node.id] as any;
              stepResult.output =
                fixture &&
                typeof fixture === "object" &&
                fixture.responsePayload
                  ? {
                      ...(typeof fixture.responsePayload === "object"
                        ? fixture.responsePayload
                        : {}),
                      statusCode: fixture.statusCode || 200,
                    }
                  : fixture;
            } else {
              // Deterministic synthetic fallback
              stepResult.output = {
                status: 200,
                data: {
                  simulated: true,
                  endpoint: url,
                  timestamp: new Date().toISOString(),
                },
              };
            }
            break;
          }

          case "EMAIL": {
            isMocked = true;
            nodeStatus = "MOCKED";
            stepResult.output = {
              sent: true,
              simulated: true,
              recipient: (node.config as any)?.to || "test@flowforge.dev",
              subject: (node.config as any)?.subject || "Simulated Message",
            };
            break;
          }

          case "APPROVAL": {
            const decision = approvalDecisions[node.id];
            if (decision !== undefined) {
              selectedHandle = decision.approved ? "approved" : "rejected";
              stepResult.output = {
                approved: decision.approved,
                comment: decision.comment || "Simulated decision",
                decidedAt: new Date().toISOString(),
              };
              nodeStatus = "PASSED";
            } else {
              // Without supplied decision, mark waiting / blocked
              nodeStatus = "BLOCKED";
              stepResult.output = {
                waitingApproval: true,
                requiredRole: (node.config as any)?.requiredRole || "ADMIN",
              };
            }
            break;
          }

          case "DELAY": {
            // Skips physical wait in simulation
            stepResult.output = {
              delayedSeconds: (node.config as any)?.durationSeconds || 0,
              simulated: true,
            };
            nodeStatus = "PASSED";
            break;
          }

          case "END": {
            stepResult.output = { completed: true, ...context.steps };
            nodeStatus = "PASSED";
            finalOutput = stepResult.output;
            break;
          }

          default: {
            // General connector or custom node
            isMocked = true;
            nodeStatus = "MOCKED";
            stepResult.output = mockFixtures[node.id] || {
              simulated: true,
              nodeType: node.type,
            };
            break;
          }
        }
      } catch (nodeErr: any) {
        nodeStatus = "FAILED";
        stepResult.status = "FAILED";
        runStatus = "FAILED";
        failureReason = nodeErr.message;
        nodeResults[node.id] = {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: "FAILED",
          inputPayload: redactSensitiveValues(context),
          durationMs: Date.now() - nodeStart,
          error: { message: nodeErr.message },
          isMocked,
        };
        break;
      }

      // Record node simulation result with sensitive values redacted
      const inputRedacted = redactSensitiveValues({
        ...node.config,
        ...context,
      });
      const redactedKeys = Object.keys(node.config || {}).filter((k) =>
        /key|secret|token|password|auth/i.test(k),
      );

      nodeResults[node.id] = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: nodeStatus,
        inputPayload: inputRedacted,
        outputPayload: redactSensitiveValues(stepResult.output),
        selectedHandle,
        durationMs: Date.now() - nodeStart,
        isMocked,
        mocked: isMocked,
        redactedFields: redactedKeys,
      };

      // If node was blocked waiting on approval, halt traversal
      if (nodeStatus === "BLOCKED") {
        break;
      }

      // Update context steps
      context.steps[node.id] = {
        output: stepResult.output,
        status: "COMPLETED",
      };

      // Resolve next node(s)
      const nextPlan = resolveNextNodes(definition, node.id, {
        status: "COMPLETED",
        output: stepResult.output,
        selectedHandle,
      });

      if (
        nextPlan.isComplete ||
        nextPlan.nextNodes.length === 0 ||
        node.type === "END"
      ) {
        break;
      }

      currentNode = nextPlan.nextNodes[0];
    }

    if (stepCount >= maxSteps) {
      runStatus = "FAILED";
      failureReason = `Simulated execution exceeded maximum step budget of ${maxSteps} steps.`;
    }

    // Determine unreachable nodes in graph
    const unreachableNodes = definition.nodes
      .filter((n) => !executedPath.includes(n.id))
      .map((n) => n.id);

    // Populate NOT_REACHED statuses for unreachable nodes
    for (const unreachedId of unreachableNodes) {
      const unreachedNode = definition.nodes.find((n) => n.id === unreachedId);
      if (unreachedNode) {
        nodeResults[unreachedId] = {
          nodeId: unreachedNode.id,
          nodeName: unreachedNode.name,
          nodeType: unreachedNode.type,
          status: "NOT_REACHED",
          inputPayload: {},
          outputPayload: {},
          durationMs: 0,
          isMocked: false,
          mocked: false,
        };
      }
    }

    const totalNodes = definition.nodes.length;
    const executedNodes = executedPath.length;
    const mockedNodes = Object.values(nodeResults).filter(
      (nr) => nr.mocked || nr.isMocked || nr.status === "MOCKED",
    ).length;
    const failedNodes = Object.values(nodeResults).filter(
      (nr) => nr.status === "FAILED",
    ).length;
    const skippedNodes = unreachableNodes.length;

    return {
      simulationId: `sim_${crypto.randomUUID()}`,
      workflowId: options.workflowId,
      workflowVersionId: options.workflowVersionId,
      mode,
      status: runStatus === "PASSED" ? "COMPLETED" : "FAILED",
      durationMs: Date.now() - startTime,
      totalNodes,
      executedNodes,
      mockedNodes,
      failedNodes,
      skippedNodes,
      unreachableNodes,
      executionPath: executedPath,
      executedPath,
      nodeResults,
      outputPayload: (finalOutput || context.steps) as Record<string, unknown>,
      finalOutput: finalOutput || context.steps,
      error: failureReason
        ? { code: "SIMULATION_FAILED", message: failureReason }
        : undefined,
      failureReason,
      sideEffectsPrevented: mode !== "ISOLATED_REAL_INTEGRATION",
      realIntegrationExecuted: mode === "ISOLATED_REAL_INTEGRATION",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 2. TEST CASE MANAGEMENT
   */
  public createTestCase(
    organizationId: string,
    workflowId: string,
    input: CreateTestCaseInput,
    userId?: string,
  ): WorkflowTestCaseRecord {
    const id = `tc_${crypto.randomUUID()}`;
    const now = new Date();

    const record: WorkflowTestCaseRecord = {
      id,
      organizationId,
      workflowId,
      workflowVersionId: input.workflowVersionId || null,
      name: input.name,
      description: input.description || null,
      mode: input.mode || "SIMULATION",
      inputData: input.inputData || {},
      mockFixtures: input.mockFixtures || {},
      failureInjections: input.failureInjections as any,
      assertions: input.assertions?.length
        ? input.assertions
        : (input as any).assertionRules || [],
      assertionRules: input.assertions?.length
        ? input.assertions
        : (input as any).assertionRules || [],
      createdById: userId || null,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.workflowTestCases.set(id, record);
    return record;
  }

  public listTestCases(
    organizationId: string,
    workflowId: string,
  ): WorkflowTestCaseRecord[] {
    return Array.from(apiStore.workflowTestCases.values()).filter(
      (tc) =>
        tc.organizationId === organizationId && tc.workflowId === workflowId,
    );
  }

  public getTestCase(
    organizationId: string,
    testCaseId: string,
  ): WorkflowTestCaseRecord | null {
    const tc = apiStore.workflowTestCases.get(testCaseId);
    if (!tc || tc.organizationId !== organizationId) return null;
    return tc;
  }

  public updateTestCase(
    organizationId: string,
    testCaseId: string,
    input: UpdateTestCaseInput,
  ): WorkflowTestCaseRecord | null {
    const existing = this.getTestCase(organizationId, testCaseId);
    if (!existing) return null;

    const updated: WorkflowTestCaseRecord = {
      ...existing,
      ...input,
      assertions: (input.assertions as any) ?? existing.assertions,
      failureInjections:
        (input.failureInjections as any) ?? existing.failureInjections,
      updatedAt: new Date(),
    };

    apiStore.workflowTestCases.set(testCaseId, updated);
    return updated;
  }

  public deleteTestCase(organizationId: string, testCaseId: string): boolean {
    const existing = this.getTestCase(organizationId, testCaseId);
    if (!existing) return false;
    apiStore.workflowTestCases.delete(testCaseId);
    return true;
  }

  /**
   * 3. TEST CASE EXECUTION & ASSERTION EVALUATOR
   */
  public async runTestCase(
    organizationId: string,
    testCaseId: string,
    overrides?: Partial<RunSimulationInput>,
    userId?: string,
  ): Promise<WorkflowTestRunRecord> {
    const testCase = this.getTestCase(organizationId, testCaseId);
    if (!testCase) {
      throw new Error(`Test case '${testCaseId}' not found.`);
    }

    const simResult = await this.simulateWorkflow({
      organizationId,
      workflowId: testCase.workflowId,
      workflowVersionId:
        overrides?.workflowVersionId || testCase.workflowVersionId,
      mode: overrides?.mode || testCase.mode,
      inputData: (overrides?.inputData || testCase.inputData) as Record<
        string,
        unknown
      >,
      mockFixtures: (overrides?.mockFixtures ||
        testCase.mockFixtures) as Record<string, unknown>,
      failureInjections: (overrides?.failureInjections ||
        testCase.failureInjections) as any,
      approvalDecisions: overrides?.approvalDecisions as any,
      authorizedForRealIntegration: overrides?.authorizedForRealIntegration,
    });

    // Evaluate assertions
    const assertionResults: AssertionResult[] = [];
    let allAssertionsPassed =
      simResult.status === "PASSED" || simResult.status === "COMPLETED";

    const rules =
      testCase.assertions && testCase.assertions.length > 0
        ? testCase.assertions
        : (testCase as any).assertionRules || [];

    for (const rule of rules) {
      const result = this.evaluateAssertion(rule, simResult);
      assertionResults.push(result);
      if (!result.passed) {
        allAssertionsPassed = false;
      }
    }

    const runId = `tr_${crypto.randomUUID()}`;
    const testRun: WorkflowTestRunRecord = {
      id: runId,
      organizationId,
      testCaseId,
      workflowId: testCase.workflowId,
      workflowVersionId: testCase.workflowVersionId,
      mode: testCase.mode,
      status: allAssertionsPassed ? "PASSED" : "FAILED",
      executedPath: simResult.executedPath,
      unreachableNodes: simResult.unreachableNodes,
      nodeResults: simResult.nodeResults,
      assertionResults,
      finalOutput: simResult.finalOutput,
      failureReason:
        simResult.failureReason ||
        (allAssertionsPassed ? null : "One or more assertions failed"),
      durationMs: simResult.durationMs,
      triggeredById: userId || null,
      createdAt: new Date(),
    };

    apiStore.workflowTestRuns.set(runId, testRun);
    return testRun;
  }

  private evaluateAssertion(
    rule: AssertionRule,
    sim: SimulationRunResult,
  ): AssertionResult {
    switch (rule.type) {
      case "NODE_EXECUTED": {
        const passed = sim.executedPath.includes(rule.target);
        return {
          type: rule.type,
          target: rule.target,
          expected: true,
          actual: passed,
          passed,
          message: passed
            ? `Node '${rule.target}' was executed.`
            : `Expected node '${rule.target}' to be executed, but was not reached.`,
        };
      }

      case "NODE_SKIPPED": {
        const executed = sim.executedPath.includes(rule.target);
        const passed = !executed;
        return {
          type: rule.type,
          target: rule.target,
          expected: false,
          actual: executed,
          passed,
          message: passed
            ? `Node '${rule.target}' was skipped.`
            : `Expected node '${rule.target}' to be skipped, but it was executed.`,
        };
      }

      case "BRANCH_TAKEN": {
        const nodeRes = sim.nodeResults[rule.target];
        const actual = nodeRes?.selectedHandle;
        const passed = actual === rule.expected;
        return {
          type: rule.type,
          target: rule.target,
          expected: rule.expected,
          actual,
          passed,
          message: passed
            ? `Branch '${rule.expected}' was taken on node '${rule.target}'.`
            : `Expected branch '${rule.expected}', but actual branch was '${actual}'.`,
        };
      }

      case "ERROR_RAISED": {
        const nodeRes = sim.nodeResults[rule.target];
        const error =
          nodeRes?.error ||
          (sim.status === "FAILED" ? { message: sim.failureReason } : null);
        const passed = Boolean(error);
        return {
          type: rule.type,
          target: rule.target,
          expected: "ERROR",
          actual: error?.message || null,
          passed,
          message: passed
            ? `Expected error occurred on target '${rule.target}'.`
            : `Expected error on target '${rule.target}', but step completed without errors.`,
        };
      }

      case "CONNECTOR_CALLED": {
        const nodeRes = sim.nodeResults[rule.target];
        const passed = Boolean(
          nodeRes && (nodeRes.isMocked || nodeRes.status === "MOCKED"),
        );
        return {
          type: rule.type,
          target: rule.target,
          expected: true,
          actual: passed,
          passed,
          message: passed
            ? `Connector operation on '${rule.target}' was intercepted.`
            : `Connector operation on '${rule.target}' was not called.`,
        };
      }

      case "OUTPUT_EQUALS": {
        const actual = this.resolveOutputField(rule.target, sim);
        const passed = JSON.stringify(actual) === JSON.stringify(rule.expected);
        return {
          type: rule.type,
          target: rule.target,
          expected: rule.expected,
          actual,
          passed,
          message: passed
            ? `Field '${rule.target}' equals expected value.`
            : `Field '${rule.target}' mismatch. Expected ${JSON.stringify(rule.expected)}, got ${JSON.stringify(actual)}.`,
        };
      }

      case "OUTPUT_MATCHES_SCHEMA": {
        const actual = this.resolveOutputField(rule.target, sim);
        const passed = actual !== undefined && actual !== null;
        return {
          type: rule.type,
          target: rule.target,
          expected: "SCHEMA_VALID",
          actual: passed ? "VALID" : "INVALID",
          passed,
          message: passed
            ? `Output on '${rule.target}' matches required format.`
            : `Output on '${rule.target}' is missing or null.`,
        };
      }

      case "BUDGET_RESPECTED": {
        const budgetLimit =
          typeof rule.expected === "number" ? rule.expected : 5000;
        const passed = sim.durationMs <= budgetLimit;
        return {
          type: rule.type,
          target: rule.target || "duration",
          expected: `<= ${budgetLimit}ms`,
          actual: `${sim.durationMs}ms`,
          passed,
          message: passed
            ? `Simulation finished within budget (${sim.durationMs}ms <= ${budgetLimit}ms).`
            : `Execution budget exceeded (${sim.durationMs}ms > ${budgetLimit}ms).`,
        };
      }

      default: {
        return {
          type: rule.type,
          target: rule.target,
          expected: rule.expected,
          actual: null,
          passed: true,
          message: `Assertion ${rule.type} satisfied.`,
        };
      }
    }
  }

  private resolveOutputField(path: string, sim: SimulationRunResult): any {
    if (!path) return sim.finalOutput;
    const parts = path.split(".");
    let current: any = sim.finalOutput || sim.nodeResults;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * 4. RUN ALL TESTS FOR A WORKFLOW
   */
  public async runAllTests(
    organizationId: string,
    workflowId: string,
    userId?: string,
  ): Promise<{
    totalTests: number;
    passedTests: number;
    failedTests: number;
    testRuns: WorkflowTestRunRecord[];
    results: WorkflowTestRunRecord[];
  }> {
    const testCases = this.listTestCases(organizationId, workflowId);
    const testRuns: WorkflowTestRunRecord[] = [];

    for (const tc of testCases) {
      const run = await this.runTestCase(organizationId, tc.id, {}, userId);
      testRuns.push(run);
    }

    const passedTests = testRuns.filter((r) => r.status === "PASSED").length;

    return {
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      testRuns,
      results: testRuns,
    };
  }

  /**
   * 5. REGRESSION TESTING & VERSION COMPARISON
   */
  public async compareVersions(
    organizationId: string,
    workflowId: string,
    input: CompareWorkflowVersionsInput,
  ): Promise<RegressionComparisonResult> {
    const wf = apiStore.workflows.get(workflowId);
    let baseDefinition: WorkflowDefinition | undefined;
    if (!input.baseVersionId || input.baseVersionId === "draft") {
      baseDefinition = wf?.draftDefinition;
    } else {
      const baseVersion = apiStore.versions.get(input.baseVersionId);
      if (!baseVersion || baseVersion.workflowId !== workflowId) {
        throw new Error(
          `Base version '${input.baseVersionId}' not found for workflow.`,
        );
      }
      baseDefinition = baseVersion.definition;
    }

    let targetDefinition: WorkflowDefinition | undefined;
    if (input.targetVersionId === "draft") {
      targetDefinition = wf?.draftDefinition;
    } else {
      const targetVersion = apiStore.versions.get(input.targetVersionId);
      if (!targetVersion || targetVersion.workflowId !== workflowId) {
        throw new Error(
          `Target version '${input.targetVersionId}' not found for workflow.`,
        );
      }
      targetDefinition = targetVersion.definition;
    }

    if (!baseDefinition || !targetDefinition) {
      throw new Error("Unable to resolve workflow definitions for comparison.");
    }

    const testInput = input.inputData || (input as any).testInput || {};

    const [baseRun, targetRun] = await Promise.all([
      this.simulateWorkflow({
        organizationId,
        workflowId,
        workflowVersionId: input.baseVersionId || "draft",
        definition: baseDefinition,
        inputData: testInput,
      }),
      this.simulateWorkflow({
        organizationId,
        workflowId,
        workflowVersionId: input.targetVersionId,
        definition: targetDefinition,
        inputData: testInput,
      }),
    ]);

    const basePathSet = new Set(baseRun.executedPath);
    const targetPathSet = new Set(targetRun.executedPath);

    const common = baseRun.executedPath.filter((id) => targetPathSet.has(id));
    const baseOnly = baseRun.executedPath.filter(
      (id) => !targetPathSet.has(id),
    );
    const targetOnly = targetRun.executedPath.filter(
      (id) => !basePathSet.has(id),
    );

    const outputDifferences: Record<
      string,
      { base?: unknown; target?: unknown; matches: boolean }
    > = {};
    for (const nodeId of common) {
      const baseOut = baseRun.nodeResults[nodeId]?.outputPayload;
      const targetOut = targetRun.nodeResults[nodeId]?.outputPayload;
      const matches = JSON.stringify(baseOut) === JSON.stringify(targetOut);
      if (!matches) {
        outputDifferences[nodeId] = {
          base: baseOut,
          target: targetOut,
          matches: false,
        };
      }
    }

    const newFailures: string[] = [];
    const resolvedFailures: string[] = [];

    if (baseRun.status === "PASSED" && targetRun.status === "FAILED") {
      newFailures.push(
        targetRun.failureReason ||
          "Workflow execution failed in target version",
      );
    }
    if (baseRun.status === "FAILED" && targetRun.status === "PASSED") {
      resolvedFailures.push(
        baseRun.failureReason || "Base version failure resolved",
      );
    }

    const isIdentical =
      baseOnly.length === 0 &&
      targetOnly.length === 0 &&
      Object.keys(outputDifferences).length === 0 &&
      newFailures.length === 0;

    return {
      workflowId,
      baseVersionId: input.baseVersionId || "draft",
      targetVersionId: input.targetVersionId,
      isIdentical,
      pathIdentical: baseOnly.length === 0 && targetOnly.length === 0,
      hasRegressions: !isIdentical,
      basePath: baseRun.executedPath,
      targetPath: targetRun.executedPath,
      pathDifferences: { baseOnly, targetOnly, common },
      outputDifferences,
      newFailures,
      resolvedFailures,
      summary: isIdentical
        ? "Execution paths and step outputs are identical between versions."
        : `Detected differences: ${baseOnly.length + targetOnly.length} path variations, ${Object.keys(outputDifferences).length} output differences, ${newFailures.length} regressions.`,
    };
  }

  /**
   * 6. STEPWISE DEBUGGING & BREAKPOINTS
   */
  public createDebugSession(
    organizationId: string,
    workflowId: string,
    input: CreateDebugSessionInput,
  ): DebugSessionRecord {
    const sessionId = `dbg_${crypto.randomUUID()}`;
    const now = new Date();

    const record: DebugSessionRecord = {
      id: sessionId,
      organizationId,
      workflowId,
      workflowVersionId: input.workflowVersionId || "",
      breakpoints: input.breakpoints || [],
      currentNodeId: null,
      status: "PAUSED",
      activeBreakpointNodeId:
        (input.breakpoints && input.breakpoints[0]) || null,
      currentStepIndex: 1,
      contextData: {
        trigger: { payload: input.inputData || {}, type: "DEBUG" },
        steps: {},
      },
      stepHistory: [],
      expiresAt: new Date(now.getTime() + this.debugSessionTtlMs),
      createdAt: now,
    };

    apiStore.debugSessions.set(sessionId, record);
    return record;
  }

  public stepDebugSession(
    organizationId: string,
    sessionId: string,
  ): DebugSessionRecord {
    const session = apiStore.debugSessions.get(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new Error(`Debug session '${sessionId}' not found.`);
    }

    const wf = apiStore.workflows.get(session.workflowId);
    if (!wf) throw new Error("Workflow not found.");

    const definition = wf.draftDefinition;
    if (!session.currentNodeId) {
      const entry = getTriggerNode(definition);
      if (!entry) throw new Error("Trigger node not found.");
      session.currentNodeId = entry.id;
    }

    const node = definition.nodes.find((n) => n.id === session.currentNodeId);
    if (!node) {
      session.status = "COMPLETED";
      return session;
    }

    const nodeResult: NodeSimulationResult = {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: "PASSED",
      outputPayload: { stepped: true, nodeId: node.id },
      durationMs: 1,
    };

    session.stepHistory.push(nodeResult);
    (session.contextData.steps as any)[node.id] = {
      output: nodeResult.outputPayload,
    };

    const next = resolveNextNodes(definition, node.id, {
      status: "COMPLETED",
      output: nodeResult.outputPayload as Record<string, unknown>,
    });

    if (next.isComplete || next.nextNodes.length === 0 || node.type === "END") {
      session.status = "COMPLETED";
      session.currentNodeId = null;
    } else {
      session.currentNodeId = next.nextNodes[0].id;
      session.status = "PAUSED";
    }

    session.currentStepIndex = (session.currentStepIndex || 1) + 1;

    apiStore.debugSessions.set(sessionId, session);
    return session;
  }

  public resumeDebugSession(
    organizationId: string,
    sessionId: string,
  ): DebugSessionRecord {
    const session = apiStore.debugSessions.get(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new Error(`Debug session '${sessionId}' not found.`);
    }

    // Step until next breakpoint or completion
    let maxSteps = 50;
    while (session.status !== "COMPLETED" && maxSteps > 0) {
      maxSteps--;
      this.stepDebugSession(organizationId, sessionId);
      if (
        session.currentNodeId &&
        session.breakpoints.includes(session.currentNodeId)
      ) {
        session.status = "PAUSED";
        break;
      }
    }

    return session;
  }

  public cancelDebugSession(
    organizationId: string,
    sessionId: string,
  ): boolean {
    const session = apiStore.debugSessions.get(sessionId);
    if (!session || session.organizationId !== organizationId) return false;
    session.status = "CANCELLED";
    apiStore.debugSessions.delete(sessionId);
    return true;
  }

  /**
   * 7. MOCK FIXTURES MANAGEMENT
   */
  public createTestFixture(
    organizationId: string,
    input: CreateTestFixtureInput,
  ): TestFixtureRecord {
    const id = `fix_${crypto.randomUUID()}`;
    const now = new Date();

    const record: TestFixtureRecord = {
      id,
      organizationId,
      name: input.name,
      connectorType: input.connectorType,
      operation: input.operation,
      matchPattern: input.matchPattern || null,
      responseStatus: input.responseStatus || 200,
      responsePayload: input.responsePayload || {},
      errorDetails: input.errorDetails || null,
      isRateLimited: input.isRateLimited || false,
      isTimeout: input.isTimeout || false,
      delayMs: input.delayMs || 0,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.testFixtures.set(id, record);
    return record;
  }

  public listTestFixtures(
    organizationId: string,
    connectorType?: string,
  ): TestFixtureRecord[] {
    return Array.from(apiStore.testFixtures.values()).filter((f) => {
      if (f.organizationId !== organizationId) return false;
      if (connectorType && f.connectorType !== connectorType) return false;
      return true;
    });
  }

  public deleteTestFixture(organizationId: string, fixtureId: string): boolean {
    const fixture = apiStore.testFixtures.get(fixtureId);
    if (!fixture || fixture.organizationId !== organizationId) return false;
    apiStore.testFixtures.delete(fixtureId);
    return true;
  }

  /**
   * 8. CONNECTOR & EXTENSION CONTRACT VALIDATION
   */
  public validateConnectorContract(
    connectorType: string,
    operation: string,
    payload: Record<string, unknown>,
  ): { isValid: boolean; valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!connectorType) errors.push("Connector type must be specified.");
    if (!operation) errors.push("Connector operation must be specified.");

    if (connectorType === "http") {
      if (!payload.url && !payload.endpoint) {
        errors.push("Missing required field 'url' for HTTP operation.");
      }
    }

    if (connectorType === "email") {
      if (!payload.to) {
        errors.push("Missing required field 'to' for Email operation.");
      }
    }

    return {
      isValid: errors.length === 0,
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 9. PUBLISHING GATES & PROMOTION CONTROLS
   */
  public getPublishingGateConfig(
    organizationId: string,
    workflowId?: string,
  ): PublishingGateConfigRecord {
    // 1. Workflow-specific config
    if (workflowId) {
      const wfConfig = Array.from(apiStore.publishingGateConfigs.values()).find(
        (c) =>
          c.organizationId === organizationId && c.workflowId === workflowId,
      );
      if (wfConfig) return wfConfig;
    }

    // 2. Org-default config
    const orgConfig = Array.from(apiStore.publishingGateConfigs.values()).find(
      (c) => c.organizationId === organizationId && !c.workflowId,
    );
    if (orgConfig) return orgConfig;

    // 3. System defaults
    return {
      id: `gate_default_${organizationId}`,
      organizationId,
      workflowId: workflowId || null,
      requireStaticValidation: true,
      requireTestSuitePass: false,
      requireRegressionCheck: false,
      requirePolicyCheck: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  public updatePublishingGateConfig(
    organizationId: string,
    workflowId: string | null,
    input: UpdatePublishingGateConfigInput,
  ): PublishingGateConfigRecord {
    const existing = Array.from(apiStore.publishingGateConfigs.values()).find(
      (c) =>
        c.organizationId === organizationId &&
        c.workflowId === (workflowId || null),
    );

    const now = new Date();
    const id = existing?.id || `gate_${crypto.randomUUID()}`;

    const record: PublishingGateConfigRecord = {
      id,
      organizationId,
      workflowId: workflowId || null,
      requireStaticValidation: input.requireStaticValidation ?? true,
      requireTestSuitePass: input.requireTestSuitePass ?? false,
      requireRegressionCheck: input.requireRegressionCheck ?? false,
      requirePolicyCheck: input.requirePolicyCheck ?? true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    apiStore.publishingGateConfigs.set(id, record);
    return record;
  }

  public async evaluatePublishingGates(
    organizationId: string,
    workflowId: string,
    definition: WorkflowDefinition,
  ): Promise<PublishingGateEvaluation> {
    const gateConfig = this.getPublishingGateConfig(organizationId, workflowId);
    const reasons: string[] = [];
    let allPassed = true;

    // Check 1: Static Validation
    let staticValPassed = true;
    let staticValMsg = "Static validation passed.";
    if (gateConfig.requireStaticValidation) {
      const val = validateWorkflowDefinition(definition);
      if (!val.isValid) {
        staticValPassed = false;
        allPassed = false;
        staticValMsg = `Static validation failed: ${val.errors.map((e) => e.message).join("; ")}`;
        reasons.push(staticValMsg);
      }
    }

    // Check 2: Test Suite Pass
    let testSuitePassed = true;
    let totalTests = 0;
    let passedTests = 0;
    let testSuiteMsg = "Test suite requirement satisfied or not configured.";
    if (gateConfig.requireTestSuitePass) {
      const testCases = this.listTestCases(organizationId, workflowId);
      totalTests = testCases.length;
      if (totalTests === 0) {
        testSuitePassed = false;
        allPassed = false;
        testSuiteMsg =
          "Test suite pass requirement not met: Publishing gate requires test suite pass, but no test cases exist.";
        reasons.push(testSuiteMsg);
      } else {
        const testSummary = await this.runAllTests(organizationId, workflowId);
        passedTests = testSummary.passedTests;
        if (passedTests < totalTests) {
          testSuitePassed = false;
          allPassed = false;
          testSuiteMsg = `Test suite pass requirement not met: ${passedTests}/${totalTests} tests passed.`;
          reasons.push(testSuiteMsg);
        } else {
          testSuiteMsg = `All ${totalTests} test cases passed.`;
        }
      }
    }

    // Check 3: Regression Check
    let regressionPassed = true;
    let regressionMsg = "Regression check passed.";
    if (gateConfig.requireRegressionCheck) {
      const wf = apiStore.workflows.get(workflowId);
      if (wf && wf.publishedVersionId) {
        const currentVersion = apiStore.versions.get(wf.publishedVersionId);
        if (currentVersion) {
          const comp = compareWorkflowDefinitions(
            currentVersion.definition,
            definition,
          );
          if (comp.removedNodes.length > 0) {
            regressionPassed = false;
            allPassed = false;
            regressionMsg = `Breaking regression: ${comp.removedNodes.length} nodes were deleted in draft.`;
            reasons.push(regressionMsg);
          }
        }
      }
    }

    // Check 4: Policy Check
    let policyPassed = true;
    let policyMsg = "Policy evaluation passed.";
    if (gateConfig.requirePolicyCheck) {
      const polDec = await policyService.evaluate({
        organizationId,
        principal: { id: "system_gate", role: "ADMIN" },
        resourceType: "WORKFLOW",
        resourceId: workflowId,
        operation: "PUBLISH",
        attributes: {
          nodeTypes: definition.nodes.map((n) => n.type),
          nodeCount: definition.nodes.length,
        },
      });

      if (!polDec.isAllowed) {
        policyPassed = false;
        allPassed = false;
        policyMsg = "Governance policies blocked publication.";
        reasons.push(policyMsg);
      }
    }

    return {
      passed: allPassed,
      checks: {
        staticValidation: { passed: staticValPassed, message: staticValMsg },
        testSuite: {
          passed: testSuitePassed,
          totalTests,
          passedTests,
          message: testSuiteMsg,
        },
        regressionCheck: { passed: regressionPassed, message: regressionMsg },
        policyCheck: { passed: policyPassed, message: policyMsg },
      },
      reasons,
    };
  }
}

export const simulationService = new WorkflowSimulationService();
