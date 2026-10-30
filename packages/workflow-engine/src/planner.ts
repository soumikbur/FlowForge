import { WorkflowDefinition, WorkflowNode } from "@flowforge/shared";
import { StepExecutionResult } from "./registry.js";
import { validateWorkflowDefinition } from "./validator.js";
import {
  WorkflowExecutionPlan,
  ExecutionPlanNode,
  ExecutionPath,
} from "./types.js";

export interface NextStepPlan {
  isComplete: boolean;
  nextNodes: WorkflowNode[];
}

/**
 * Builds a deterministic, validated workflow execution plan from a WorkflowDefinition.
 * Rejects invalid definitions before planning and preserves conditional branch paths.
 */
export function buildExecutionPlan(
  definition: WorkflowDefinition,
): WorkflowExecutionPlan {
  const validation = validateWorkflowDefinition(definition);
  if (!validation.isValid) {
    const errorDetails = validation.errors
      .map((e) => `[${e.code}] ${e.message}`)
      .join("; ");
    throw new Error(
      `Cannot build execution plan for invalid workflow definition: ${errorDetails}`,
    );
  }

  const triggerNode = definition.nodes.find((n) => n.type === "TRIGGER");
  if (!triggerNode) {
    throw new Error("Cannot build execution plan without a TRIGGER node.");
  }

  const nodesById = new Map<string, WorkflowNode>();
  for (const n of definition.nodes) {
    nodesById.set(n.id, n);
  }

  // Build incoming dependencies and outgoing edges maps
  const inDegree = new Map<string, number>();
  const dependencies = new Map<string, string[]>();
  const outgoingEdges = new Map<
    string,
    Array<{ targetNodeId: string; sourceHandle?: string }>
  >();

  for (const node of definition.nodes) {
    inDegree.set(node.id, 0);
    dependencies.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of definition.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    dependencies.get(edge.target)!.push(edge.source);
    outgoingEdges.get(edge.source)!.push({
      targetNodeId: edge.target,
      sourceHandle: edge.sourceHandle,
    });
  }

  // 1. Build Plan Nodes Dictionary
  const planNodes: Record<string, ExecutionPlanNode> = {};
  const terminalNodeIds: string[] = [];

  for (const node of definition.nodes) {
    const isTerminal = node.type === "END";
    if (isTerminal) {
      terminalNodeIds.push(node.id);
    }

    planNodes[node.id] = {
      id: node.id,
      type: node.type,
      name: node.name,
      config: node.config,
      isTrigger: node.type === "TRIGGER",
      isTerminal,
      dependencies: dependencies.get(node.id) || [],
      outgoingEdges: outgoingEdges.get(node.id) || [],
      branchHandles:
        node.type === "CONDITION" ? ["true", "false"] : undefined,
    };
  }

  // 2. Deterministic Topological Sort (Kahn's algorithm with deterministic tie-breaking)
  const currentInDegree = new Map(inDegree);
  const queue: string[] = [];

  for (const [nodeId, deg] of currentInDegree.entries()) {
    if (deg === 0) {
      queue.push(nodeId);
    }
  }

  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    // Deterministic sorting of candidate queue by ID
    queue.sort();
    const currentId = queue.shift()!;
    topologicalOrder.push(currentId);

    const nextEdges = outgoingEdges.get(currentId) || [];
    for (const edge of nextEdges) {
      const nextDeg = (currentInDegree.get(edge.targetNodeId) || 1) - 1;
      currentInDegree.set(edge.targetNodeId, nextDeg);
      if (nextDeg === 0) {
        queue.push(edge.targetNodeId);
      }
    }
  }

  // 3. Deterministic Execution Paths (tracing from trigger to terminal nodes)
  const executionPaths: ExecutionPath[] = [];
  let pathCounter = 1;

  function tracePaths(
    currentNodeId: string,
    currentPath: string[],
    isConditional: boolean,
    conditionBranch?: string,
  ) {
    const node = planNodes[currentNodeId];
    const newPath = [...currentPath, currentNodeId];

    if (!node || node.isTerminal || node.outgoingEdges.length === 0) {
      executionPaths.push({
        pathId: `path_${pathCounter++}`,
        nodeIds: newPath,
        isConditional,
        conditionBranch,
      });
      return;
    }

    if (node.type === "CONDITION") {
      // Split into True and False branches
      const trueEdges = node.outgoingEdges.filter((e) => e.sourceHandle === "true");
      const falseEdges = node.outgoingEdges.filter((e) => e.sourceHandle === "false");

      for (const edge of trueEdges) {
        tracePaths(edge.targetNodeId, newPath, true, "true");
      }
      for (const edge of falseEdges) {
        tracePaths(edge.targetNodeId, newPath, true, "false");
      }
    } else {
      // Standard linear outgoing connections
      for (const edge of node.outgoingEdges) {
        tracePaths(edge.targetNodeId, newPath, isConditional, conditionBranch);
      }
    }
  }

  tracePaths(triggerNode.id, [], false, undefined);

  return {
    workflowSchemaVersion: "1.0",
    entryTriggerId: triggerNode.id,
    nodes: planNodes,
    topologicalOrder,
    executionPaths,
    terminalNodeIds,
  };
}

/**
 * Resolves next executable nodes after step completion and handle selection.
 */
export function resolveNextNodes(
  definition: WorkflowDefinition,
  currentNodeId: string,
  result: StepExecutionResult,
): NextStepPlan {
  const outgoingEdges = definition.edges.filter(
    (e) => e.source === currentNodeId,
  );

  if (outgoingEdges.length === 0) {
    return {
      isComplete: true,
      nextNodes: [],
    };
  }

  const nodesById = new Map<string, WorkflowNode>();
  for (const n of definition.nodes) {
    nodesById.set(n.id, n);
  }

  let matchingEdges = outgoingEdges;

  // If a specific handle was selected (e.g. CONDITION true/false branch)
  if (result.selectedHandle) {
    matchingEdges = outgoingEdges.filter(
      (e) => e.sourceHandle === result.selectedHandle,
    );
  }

  const nextNodes: WorkflowNode[] = [];
  for (const edge of matchingEdges) {
    const target = nodesById.get(edge.target);
    if (target) {
      nextNodes.push(target);
    }
  }

  return {
    isComplete: nextNodes.length === 0,
    nextNodes,
  };
}

export function getTriggerNode(
  definition: WorkflowDefinition,
): WorkflowNode | undefined {
  return definition.nodes.find((n) => n.type === "TRIGGER");
}
