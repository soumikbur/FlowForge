import { WorkflowDefinition, WorkflowNode } from "@flowforge/shared";
import { StepExecutionResult } from "./registry.js";

export interface NextStepPlan {
  isComplete: boolean;
  nextNodes: WorkflowNode[];
}

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
