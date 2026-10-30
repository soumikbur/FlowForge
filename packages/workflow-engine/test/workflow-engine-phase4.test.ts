import { describe, it, expect } from "vitest";
import {
  validateWorkflowDefinition,
  validateWorkflowGraph,
  buildExecutionPlan,
  evaluateCondition,
  resolvePath,
  interpolateTemplate,
  ENGINE_LIMITS,
  WorkflowErrorCode,
  defaultRegistry,
} from "../src/index.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Phase 4: Structural & Graph Validation Engine", () => {
  it("rejects non-object or empty definitions", () => {
    const nullRes = validateWorkflowDefinition(null as any);
    expect(nullRes.isValid).toBe(false);
    expect(nullRes.errors[0].code).toBe(WorkflowErrorCode.INVALID_DEFINITION);

    const emptyRes = validateWorkflowDefinition({ nodes: [], edges: [] });
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.errors[0].code).toBe(WorkflowErrorCode.EMPTY_GRAPH);
  });

  it("enforces engine resource safety limits", () => {
    const oversizedNodes: any[] = Array.from(
      { length: ENGINE_LIMITS.MAX_NODES + 1 },
      (_, i) => ({
        id: `node_${i}`,
        type: i === 0 ? "TRIGGER" : "END",
        name: `Node ${i}`,
        config: {},
      }),
    );

    const res = validateWorkflowDefinition({
      nodes: oversizedNodes,
      edges: [],
    });
    expect(res.isValid).toBe(false);
    expect(res.errors[0].code).toBe(WorkflowErrorCode.RESOURCE_LIMIT_EXCEEDED);
  });

  it("rejects self-connecting edges", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t", type: "TRIGGER", name: "Trigger", config: {} },
        { id: "e", type: "END", name: "End", config: {} },
      ],
      edges: [
        { id: "e1", source: "t", target: "e" },
        { id: "e_self", source: "t", target: "t" }, // self connection!
      ],
    };

    const res = validateWorkflowDefinition(def);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === WorkflowErrorCode.SELF_CONNECTION_NOT_ALLOWED,
      ),
    ).toBe(true);
  });

  it("rejects terminal (END) node having outgoing connections", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t", type: "TRIGGER", name: "Trigger", config: {} },
        { id: "end1", type: "END", name: "End 1", config: {} },
        { id: "end2", type: "END", name: "End 2", config: {} },
      ],
      edges: [
        { id: "e1", source: "t", target: "end1" },
        { id: "e_invalid", source: "end1", target: "end2" }, // outgoing from terminal
      ],
    };

    const res = validateWorkflowDefinition(def);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === WorkflowErrorCode.TERMINAL_HAS_OUTGOING_EDGES,
      ),
    ).toBe(true);
  });

  it("rejects multi-node workflow missing reachable terminal (END) path", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t", type: "TRIGGER", name: "Trigger", config: {} },
        {
          id: "delay1",
          type: "DELAY",
          name: "Delay",
          config: { durationSeconds: 60 },
        },
      ],
      edges: [{ id: "e1", source: "t", target: "delay1" }],
    };

    const res = validateWorkflowDefinition(def);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === WorkflowErrorCode.MISSING_TERMINAL_PATH,
      ),
    ).toBe(true);
  });

  it("rejects CONDITION node with incomplete outgoing branch handles", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t", type: "TRIGGER", name: "Trigger", config: {} },
        {
          id: "c",
          type: "CONDITION",
          name: "Cond",
          config: { expression: "val > 10" },
        },
        { id: "end1", type: "END", name: "End", config: {} },
      ],
      edges: [
        { id: "e1", source: "t", target: "c" },
        { id: "e2", source: "c", sourceHandle: "true", target: "end1" },
        // Missing 'false' handle!
      ],
    };

    const res = validateWorkflowDefinition(def);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === WorkflowErrorCode.INCOMPLETE_CONDITION_BRANCHES,
      ),
    ).toBe(true);
  });
});

describe("Phase 4: Safe Condition Evaluator & Expressions", () => {
  const context = {
    trigger: {
      payload: {
        score: 85,
        status: "APPROVED",
        tags: ["vip", "priority"],
        emptyField: "",
        nullField: null,
      },
    },
    user: {
      name: "Alice",
      age: 30,
    },
  };

  it("evaluates unary EXISTS and IS_EMPTY operators", () => {
    expect(evaluateCondition("trigger.payload.score EXISTS", context)).toBe(true);
    expect(
      evaluateCondition("trigger.payload.nonExistent EXISTS", context),
    ).toBe(false);

    expect(
      evaluateCondition("trigger.payload.emptyField IS_EMPTY", context),
    ).toBe(true);
    expect(evaluateCondition("trigger.payload.nullField IS_EMPTY", context)).toBe(
      true,
    );
    expect(evaluateCondition("trigger.payload.score IS_EMPTY", context)).toBe(
      false,
    );
  });

  it("evaluates binary CONTAINS and NOT_CONTAINS operators", () => {
    // Array containment
    expect(
      evaluateCondition('trigger.payload.tags CONTAINS "vip"', context),
    ).toBe(true);
    expect(
      evaluateCondition('trigger.payload.tags CONTAINS "guest"', context),
    ).toBe(false);

    // String containment
    expect(
      evaluateCondition('trigger.payload.status CONTAINS "APPROV"', context),
    ).toBe(true);
    expect(
      evaluateCondition('trigger.payload.status NOT_CONTAINS "REJECT"', context),
    ).toBe(true);
  });

  it("strictly handles numeric comparisons and prevents string coercion bugs", () => {
    expect(evaluateCondition("trigger.payload.score > 80", context)).toBe(true);
    expect(evaluateCondition("trigger.payload.score <= 85", context)).toBe(true);
    expect(evaluateCondition("trigger.payload.score < 50", context)).toBe(false);

    // Non-numeric string comparison with < or > returns false
    expect(
      evaluateCondition('trigger.payload.status > "random_string"', context),
    ).toBe(false);
  });

  it("blocks prototype pollution and enforces path limits", () => {
    expect(evaluateCondition("user.__proto__.polluted === true", context)).toBe(
      false,
    );
    expect(evaluateCondition("user.constructor.name === 'Object'", context)).toBe(
      false,
    );

    // Path exceeding maximum depth returns undefined
    const deepPath = Array(ENGINE_LIMITS.MAX_PATH_DEPTH + 2).join("a.");
    expect(resolvePath(deepPath, context)).toBeUndefined();
  });
});

describe("Phase 4: Deterministic Execution Planning", () => {
  const branchingWorkflow: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger",
        type: "TRIGGER",
        name: "Webhook Inbound",
        config: { triggerType: "WEBHOOK", webhookPath: "/deals" },
      },
      {
        id: "node_condition",
        type: "CONDITION",
        name: "Check Deal Size",
        config: { expression: "trigger.payload.dealSize > 50000" },
      },
      {
        id: "node_approval",
        type: "APPROVAL",
        name: "VP Deal Approval",
        config: { title: "VP Signoff", requiredRole: "ADMIN" },
      },
      {
        id: "node_email_fast",
        type: "EMAIL",
        name: "Fast Track Email",
        config: {
          to: "team@company.com",
          subject: "Standard Deal",
          template: "Deal auto-approved",
        },
      },
      {
        id: "node_end_enterprise",
        type: "END",
        name: "Enterprise Closed",
        config: {},
      },
      {
        id: "node_end_standard",
        type: "END",
        name: "Standard Closed",
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger", target: "node_condition" },
      {
        id: "e_true",
        source: "node_condition",
        sourceHandle: "true",
        target: "node_approval",
      },
      {
        id: "e_false",
        source: "node_condition",
        sourceHandle: "false",
        target: "node_email_fast",
      },
      { id: "e_appr_to_end", source: "node_approval", target: "node_end_enterprise" },
      { id: "e_email_to_end", source: "node_email_fast", target: "node_end_standard" },
    ],
  };

  it("builds a deterministic execution plan with correct topological order and metadata", () => {
    const plan = buildExecutionPlan(branchingWorkflow);

    expect(plan.workflowSchemaVersion).toBe("1.0");
    expect(plan.entryTriggerId).toBe("node_trigger");
    expect(Object.keys(plan.nodes).length).toBe(6);

    // Topological order starts with trigger
    expect(plan.topologicalOrder[0]).toBe("node_trigger");
    expect(plan.topologicalOrder[1]).toBe("node_condition");

    // All nodes present in topological order
    expect(plan.topologicalOrder.length).toBe(6);

    // Verify terminal nodes identified
    expect(plan.terminalNodeIds).toContain("node_end_enterprise");
    expect(plan.terminalNodeIds).toContain("node_end_standard");
  });

  it("preserves mutually exclusive conditional branch paths", () => {
    const plan = buildExecutionPlan(branchingWorkflow);

    expect(plan.executionPaths.length).toBe(2);

    // Path 1 (True branch)
    const truePath = plan.executionPaths.find(
      (p) => p.conditionBranch === "true",
    );
    expect(truePath).toBeDefined();
    expect(truePath?.nodeIds).toEqual([
      "node_trigger",
      "node_condition",
      "node_approval",
      "node_end_enterprise",
    ]);

    // Path 2 (False branch)
    const falsePath = plan.executionPaths.find(
      (p) => p.conditionBranch === "false",
    );
    expect(falsePath).toBeDefined();
    expect(falsePath?.nodeIds).toEqual([
      "node_trigger",
      "node_condition",
      "node_email_fast",
      "node_end_standard",
    ]);
  });

  it("rejects invalid graphs before planning", () => {
    const cyclicWorkflow: WorkflowDefinition = {
      nodes: [
        { id: "t", type: "TRIGGER", name: "Trigger", config: {} },
        { id: "a", type: "DELAY", name: "A", config: { durationSeconds: 5 } },
        { id: "b", type: "DELAY", name: "B", config: { durationSeconds: 5 } },
        { id: "end", type: "END", name: "End", config: {} },
      ],
      edges: [
        { id: "e1", source: "t", target: "a" },
        { id: "e2", source: "a", target: "b" },
        { id: "e3", source: "b", target: "a" }, // cycle!
        { id: "e4", source: "b", target: "end" },
      ],
    };

    expect(() => buildExecutionPlan(cyclicWorkflow)).toThrow(/CYCLE_DETECTED/);
  });
});

describe("Phase 4: Node Handler Contracts & Metadata Registry", () => {
  it("provides registered metadata for all registered node types", () => {
    const types = defaultRegistry.listSupportedTypes();
    expect(types.length).toBe(8);

    const triggerMeta = defaultRegistry.getMetadata("TRIGGER");
    expect(triggerMeta?.isTrigger).toBe(true);
    expect(triggerMeta?.inputs).toBe(0);

    const conditionMeta = defaultRegistry.getMetadata("CONDITION");
    expect(conditionMeta?.isBranching).toBe(true);
    expect(conditionMeta?.outputs).toBe("branching");

    const endMeta = defaultRegistry.getMetadata("END");
    expect(endMeta?.isTerminal).toBe(true);
    expect(endMeta?.outputs).toBe(0);
  });
});

