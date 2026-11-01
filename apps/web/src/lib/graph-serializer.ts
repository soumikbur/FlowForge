import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  NodeType,
} from "@flowforge/shared";
import { Node, Edge } from "reactflow";

export interface SerializedGraph {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Converts a backend WorkflowDefinition AST into React Flow nodes and edges.
 * Preserves stable IDs, coordinates, types, configs, and branch handles.
 */
export function workflowDefinitionToReactFlow(
  definition: WorkflowDefinition,
): SerializedGraph {
  if (!definition || !Array.isArray(definition.nodes)) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = definition.nodes.map((n, idx) => ({
    id: n.id,
    type: "customNode",
    position: n.position || { x: 250, y: 50 + idx * 120 },
    data: {
      id: n.id,
      name: n.name || "Untitled Node",
      type: n.type,
      config: n.config || {},
    },
  }));

  const edges: Edge[] = (definition.edges || []).map((e) => {
    let edgeLabel: string | undefined = undefined;
    if (e.sourceHandle === "true") edgeLabel = "True";
    else if (e.sourceHandle === "false") edgeLabel = "False";

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      label: edgeLabel,
      animated: true,
      style: { strokeWidth: 2 },
    };
  });

  return { nodes, edges };
}

/**
 * Converts React Flow nodes and edges back into the canonical backend WorkflowDefinition AST.
 * Guarantees zero ID churn and preserves branch handles for condition evaluation.
 */
export function reactFlowToWorkflowDefinition(
  nodes: Node[],
  edges: Edge[],
): WorkflowDefinition {
  const serializedNodes: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    type: (n.data?.type || "END") as NodeType,
    name: n.data?.name || n.data?.label || "Node",
    config: n.data?.config || {},
    position: {
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
    },
  }));

  const serializedEdges: WorkflowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
  }));

  return {
    nodes: serializedNodes,
    edges: serializedEdges,
  };
}
