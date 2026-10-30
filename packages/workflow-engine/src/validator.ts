import {
  WorkflowDefinition,
  NodeType,
  TriggerNodeConfigSchema,
  ConditionNodeConfigSchema,
  HttpRequestNodeConfigSchema,
  EmailNodeConfigSchema,
  ApprovalNodeConfigSchema,
  DelayNodeConfigSchema,
  EndNodeConfigSchema,
} from "@flowforge/shared";

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function validateWorkflowGraph(
  definition: WorkflowDefinition,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!definition.nodes || definition.nodes.length === 0) {
    return {
      isValid: false,
      errors: [
        {
          code: "EMPTY_GRAPH",
          message: "Workflow graph must contain at least one node.",
        },
      ],
    };
  }

  // 1. Check duplicate Node IDs
  const nodeIds = new Set<string>();
  const nodesById = new Map<string, (typeof definition.nodes)[0]>();

  for (const node of definition.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        code: "DUPLICATE_NODE_ID",
        message: `Duplicate node ID detected: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
    nodesById.set(node.id, node);
  }

  // 2. Validate Trigger Node existence and uniqueness
  const triggerNodes = definition.nodes.filter((n) => n.type === "TRIGGER");
  if (triggerNodes.length === 0) {
    errors.push({
      code: "MISSING_TRIGGER_NODE",
      message: "Workflow must have exactly one TRIGGER node.",
    });
  } else if (triggerNodes.length > 1) {
    errors.push({
      code: "MULTIPLE_TRIGGER_NODES",
      message: `Workflow has ${triggerNodes.length} TRIGGER nodes; exactly one is permitted.`,
    });
  }

  // 3. Validate Node Configurations against schemas
  for (const node of definition.nodes) {
    let schemaResult;
    switch (node.type) {
      case "TRIGGER":
        schemaResult = TriggerNodeConfigSchema.safeParse(node.config);
        break;
      case "CONDITION":
        schemaResult = ConditionNodeConfigSchema.safeParse(node.config);
        break;
      case "HTTP_REQUEST":
        schemaResult = HttpRequestNodeConfigSchema.safeParse(node.config);
        break;
      case "EMAIL":
        schemaResult = EmailNodeConfigSchema.safeParse(node.config);
        break;
      case "APPROVAL":
        schemaResult = ApprovalNodeConfigSchema.safeParse(node.config);
        break;
      case "DELAY":
        schemaResult = DelayNodeConfigSchema.safeParse(node.config);
        break;
      case "END":
        schemaResult = EndNodeConfigSchema.safeParse(node.config);
        break;
      default:
        errors.push({
          nodeId: node.id,
          code: "UNKNOWN_NODE_TYPE",
          message: `Unknown node type: ${(node as any).type}`,
        });
        continue;
    }

    if (schemaResult && !schemaResult.success) {
      for (const issue of schemaResult.error.issues) {
        errors.push({
          nodeId: node.id,
          code: "INVALID_NODE_CONFIG",
          message: `Node '${node.name}' config error on '${issue.path.join(".")}': ${issue.message}`,
        });
      }
    }
  }

  // 4. Validate Edges: Endpoints existence & handles
  const incomingEdgeCounts = new Map<string, number>();
  const outgoingEdgesByNode = new Map<string, (typeof definition.edges)[0][]>();

  for (const node of definition.nodes) {
    incomingEdgeCounts.set(node.id, 0);
    outgoingEdgesByNode.set(node.id, []);
  }

  const edgeIds = new Set<string>();

  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({
        edgeId: edge.id,
        code: "DUPLICATE_EDGE_ID",
        message: `Duplicate edge ID: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);

    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode) {
      errors.push({
        edgeId: edge.id,
        code: "MISSING_SOURCE_NODE",
        message: `Edge '${edge.id}' references non-existent source node: ${edge.source}`,
      });
    }

    if (!targetNode) {
      errors.push({
        edgeId: edge.id,
        code: "MISSING_TARGET_NODE",
        message: `Edge '${edge.id}' references non-existent target node: ${edge.target}`,
      });
    }

    if (sourceNode && targetNode) {
      incomingEdgeCounts.set(
        edge.target,
        (incomingEdgeCounts.get(edge.target) || 0) + 1,
      );
      outgoingEdgesByNode.get(edge.source)!.push(edge);

      // Validate handle rules
      if (sourceNode.type === "CONDITION") {
        if (edge.sourceHandle !== "true" && edge.sourceHandle !== "false") {
          errors.push({
            edgeId: edge.id,
            nodeId: sourceNode.id,
            code: "INVALID_CONDITION_HANDLE",
            message: `Condition node '${sourceNode.name}' outgoing edge must specify sourceHandle as 'true' or 'false'. Received '${edge.sourceHandle}'.`,
          });
        }
      }
    }
  }

  // 5. Trigger Node cannot have incoming edges
  if (triggerNodes.length === 1) {
    const triggerIncoming = incomingEdgeCounts.get(triggerNodes[0].id) || 0;
    if (triggerIncoming > 0) {
      errors.push({
        nodeId: triggerNodes[0].id,
        code: "TRIGGER_HAS_INCOMING_EDGES",
        message: "TRIGGER node cannot have incoming edges.",
      });
    }
  }

  // 6. Condition Node must have both 'true' and 'false' branches defined
  for (const node of definition.nodes) {
    if (node.type === "CONDITION") {
      const outEdges = outgoingEdgesByNode.get(node.id) || [];
      const hasTrue = outEdges.some((e) => e.sourceHandle === "true");
      const hasFalse = outEdges.some((e) => e.sourceHandle === "false");
      if (!hasTrue || !hasFalse) {
        errors.push({
          nodeId: node.id,
          code: "INCOMPLETE_CONDITION_BRANCHES",
          message: `Condition node '${node.name}' must have both 'true' and 'false' outgoing branches.`,
        });
      }
    }
  }

  // 7. Reachability analysis (detect unreachable nodes from trigger)
  if (
    triggerNodes.length === 1 &&
    errors.filter(
      (e) =>
        e.code === "MISSING_SOURCE_NODE" || e.code === "MISSING_TARGET_NODE",
    ).length === 0
  ) {
    const visited = new Set<string>();
    const queue: string[] = [triggerNodes[0].id];
    visited.add(triggerNodes[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextEdges = outgoingEdgesByNode.get(current) || [];
      for (const edge of nextEdges) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    for (const node of definition.nodes) {
      if (!visited.has(node.id)) {
        errors.push({
          nodeId: node.id,
          code: "UNREACHABLE_NODE",
          message: `Node '${node.name}' (${node.id}) is unreachable from TRIGGER node.`,
        });
      }
    }

    // 8. Cycle Detection (Tarjan / Kahn / DFS with recursion stack)
    const recStack = new Set<string>();
    const dfsVisited = new Set<string>();
    let cycleDetected = false;

    function dfsCycle(nodeId: string, path: string[]) {
      if (recStack.has(nodeId)) {
        cycleDetected = true;
        errors.push({
          nodeId,
          code: "CYCLE_DETECTED",
          message: `Unsupported cycle detected in workflow graph: ${[...path, nodeId].join(" -> ")}`,
        });
        return;
      }
      if (dfsVisited.has(nodeId)) return;

      dfsVisited.add(nodeId);
      recStack.add(nodeId);

      const outEdges = outgoingEdgesByNode.get(nodeId) || [];
      for (const edge of outEdges) {
        dfsCycle(edge.target, [...path, nodeId]);
      }

      recStack.delete(nodeId);
    }

    dfsCycle(triggerNodes[0].id, []);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
