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
  ConnectorActionNodeConfigSchema,
} from "@flowforge/shared";
import { ENGINE_LIMITS } from "./limits.js";
import {
  ValidationError,
  ValidationWarning,
  ValidationResult,
  WorkflowErrorCode,
} from "./types.js";

export type { ValidationError, ValidationWarning, ValidationResult };

/**
 * Validates a workflow definition according to structural, connectivity,
 * schema, and safety constraints. Pure function with zero external side-effects.
 */
export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Definition-level validation
  if (!definition || typeof definition !== "object") {
    return {
      isValid: false,
      errors: [
        {
          code: WorkflowErrorCode.INVALID_DEFINITION,
          message: "Workflow definition must be an object.",
        },
      ],
      warnings: [],
    };
  }

  if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
    return {
      isValid: false,
      errors: [
        {
          code: WorkflowErrorCode.EMPTY_GRAPH,
          message: "Workflow graph must contain at least one node.",
          field: "nodes",
        },
      ],
      warnings: [],
    };
  }

  const edges = Array.isArray(definition.edges) ? definition.edges : [];

  // Resource safety limits
  if (definition.nodes.length > ENGINE_LIMITS.MAX_NODES) {
    return {
      isValid: false,
      errors: [
        {
          code: WorkflowErrorCode.RESOURCE_LIMIT_EXCEEDED,
          message: `Workflow exceeds maximum node limit of ${ENGINE_LIMITS.MAX_NODES}. Received ${definition.nodes.length}.`,
          field: "nodes",
        },
      ],
      warnings: [],
    };
  }

  if (edges.length > ENGINE_LIMITS.MAX_EDGES) {
    return {
      isValid: false,
      errors: [
        {
          code: WorkflowErrorCode.RESOURCE_LIMIT_EXCEEDED,
          message: `Workflow exceeds maximum edge limit of ${ENGINE_LIMITS.MAX_EDGES}. Received ${edges.length}.`,
          field: "edges",
        },
      ],
      warnings: [],
    };
  }

  // 2. Node uniqueness and index
  const nodeIds = new Set<string>();
  const nodesById = new Map<string, (typeof definition.nodes)[0]>();

  for (const node of definition.nodes) {
    if (!node || typeof node !== "object" || !node.id) {
      errors.push({
        code: WorkflowErrorCode.INVALID_NODE_CONFIG,
        message: "Node must have a valid identifier.",
        field: "id",
      });
      continue;
    }

    if (nodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        code: WorkflowErrorCode.DUPLICATE_NODE_ID,
        message: `Duplicate node ID detected: '${node.id}'.`,
      });
    }
    nodeIds.add(node.id);
    nodesById.set(node.id, node);
  }

  // 3. Trigger validation (exactly one trigger permitted)
  const triggerNodes = definition.nodes.filter((n) => n.type === "TRIGGER");
  if (triggerNodes.length === 0) {
    errors.push({
      code: WorkflowErrorCode.MISSING_TRIGGER_NODE,
      message: "Workflow must have exactly one TRIGGER node.",
      field: "nodes",
    });
  } else if (triggerNodes.length > 1) {
    errors.push({
      code: WorkflowErrorCode.MULTIPLE_TRIGGER_NODES,
      message: `Workflow has ${triggerNodes.length} TRIGGER nodes; exactly one is permitted.`,
      field: "nodes",
    });
  }

  // 4. Validate Node Configurations against schemas
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
      case "CONNECTOR_ACTION":
        schemaResult = ConnectorActionNodeConfigSchema.safeParse(node.config);
        break;
      default:
        errors.push({
          nodeId: node.id,
          code: WorkflowErrorCode.UNKNOWN_NODE_TYPE,
          message: `Unknown node type: '${(node as any).type}'.`,
        });
        continue;
    }

    if (schemaResult && !schemaResult.success) {
      for (const issue of schemaResult.error.issues) {
        errors.push({
          nodeId: node.id,
          code: WorkflowErrorCode.INVALID_NODE_CONFIG,
          message: `Node '${node.name}' config error on '${issue.path.join(".")}': ${issue.message}`,
          field: issue.path.join("."),
        });
      }
    }
  }

  // 5. Build Adjacency and Validate Edges
  const incomingEdgeCounts = new Map<string, number>();
  const outgoingEdgesByNode = new Map<string, (typeof edges)[0][]>();

  for (const node of definition.nodes) {
    incomingEdgeCounts.set(node.id, 0);
    outgoingEdgesByNode.set(node.id, []);
  }

  const edgeIds = new Set<string>();
  const edgeConnections = new Set<string>();

  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({
        edgeId: edge.id,
        code: WorkflowErrorCode.DUPLICATE_EDGE_ID,
        message: `Duplicate edge ID detected: '${edge.id}'.`,
      });
    }
    edgeIds.add(edge.id);

    // Self-connection check
    if (edge.source === edge.target) {
      errors.push({
        edgeId: edge.id,
        code: WorkflowErrorCode.SELF_CONNECTION_NOT_ALLOWED,
        message: `Self-connection detected on node '${edge.source}'. Nodes cannot connect directly to themselves.`,
      });
    }

    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode) {
      errors.push({
        edgeId: edge.id,
        code: WorkflowErrorCode.MISSING_SOURCE_NODE,
        message: `Edge '${edge.id}' references non-existent source node: '${edge.source}'.`,
      });
    }

    if (!targetNode) {
      errors.push({
        edgeId: edge.id,
        code: WorkflowErrorCode.MISSING_TARGET_NODE,
        message: `Edge '${edge.id}' references non-existent target node: '${edge.target}'.`,
      });
    }

    if (sourceNode && targetNode) {
      // Terminal node cannot have outgoing edges
      if (sourceNode.type === "END") {
        errors.push({
          edgeId: edge.id,
          nodeId: sourceNode.id,
          code: WorkflowErrorCode.TERMINAL_HAS_OUTGOING_EDGES,
          message: `Terminal (END) node '${sourceNode.name}' cannot have outgoing connections.`,
        });
      }

      // Condition Handle Validation
      if (sourceNode.type === "CONDITION") {
        if (edge.sourceHandle !== "true" && edge.sourceHandle !== "false") {
          errors.push({
            edgeId: edge.id,
            nodeId: sourceNode.id,
            code: WorkflowErrorCode.INVALID_CONDITION_HANDLE,
            message: `Condition node '${sourceNode.name}' outgoing edge must specify sourceHandle as 'true' or 'false'. Received '${edge.sourceHandle}'.`,
          });
        }
      }

      // Check duplicate edge connections between same endpoints and handle
      const connKey = `${edge.source}:${edge.sourceHandle || ""}->${edge.target}`;
      if (edgeConnections.has(connKey)) {
        warnings.push({
          edgeId: edge.id,
          code: "DUPLICATE_EDGE_CONNECTION",
          message: `Duplicate edge connection detected between '${edge.source}' and '${edge.target}'.`,
        });
      }
      edgeConnections.add(connKey);

      incomingEdgeCounts.set(
        edge.target,
        (incomingEdgeCounts.get(edge.target) || 0) + 1,
      );
      outgoingEdgesByNode.get(edge.source)!.push(edge);
    }
  }

  // 6. Trigger node cannot have incoming edges
  if (triggerNodes.length === 1) {
    const triggerIncoming = incomingEdgeCounts.get(triggerNodes[0].id) || 0;
    if (triggerIncoming > 0) {
      errors.push({
        nodeId: triggerNodes[0].id,
        code: WorkflowErrorCode.TRIGGER_HAS_INCOMING_EDGES,
        message: "TRIGGER node cannot have incoming edges.",
      });
    }
  }

  // 7. Condition node branch completeness (must have both 'true' and 'false' branches)
  for (const node of definition.nodes) {
    if (node.type === "CONDITION") {
      const outEdges = outgoingEdgesByNode.get(node.id) || [];
      const hasTrue = outEdges.some((e) => e.sourceHandle === "true");
      const hasFalse = outEdges.some((e) => e.sourceHandle === "false");
      if (!hasTrue || !hasFalse) {
        errors.push({
          nodeId: node.id,
          code: WorkflowErrorCode.INCOMPLETE_CONDITION_BRANCHES,
          message: `Condition node '${node.name}' must have both 'true' and 'false' outgoing branches.`,
        });
      }
    }
  }

  // 8. Reachability & Cycle Detection
  const hasStructuralLinkErrors = errors.some(
    (e) =>
      e.code === WorkflowErrorCode.MISSING_SOURCE_NODE ||
      e.code === WorkflowErrorCode.MISSING_TARGET_NODE,
  );

  if (triggerNodes.length === 1 && !hasStructuralLinkErrors) {
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

    // Detect unreachable nodes
    for (const node of definition.nodes) {
      if (!visited.has(node.id)) {
        errors.push({
          nodeId: node.id,
          code: WorkflowErrorCode.UNREACHABLE_NODE,
          message: `Node '${node.name}' (${node.id}) is unreachable from TRIGGER node.`,
        });
      }
    }

    // 9. Cycle Detection (DFS with recursion stack)
    const recStack = new Set<string>();
    const dfsVisited = new Set<string>();

    function dfsCycle(nodeId: string, path: string[]) {
      if (recStack.has(nodeId)) {
        errors.push({
          nodeId,
          code: WorkflowErrorCode.CYCLE_DETECTED,
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

    // 10. Terminal path validation: verify at least one reachable terminal (END) path exists
    if (definition.nodes.length > 1) {
      const reachableEndNodes = definition.nodes.filter(
        (n) => n.type === "END" && visited.has(n.id),
      );
      if (reachableEndNodes.length === 0) {
        errors.push({
          code: WorkflowErrorCode.MISSING_TERMINAL_PATH,
          message: "Workflow must have at least one reachable terminal (END) node from the trigger.",
          field: "nodes",
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Backward-compatible alias for validateWorkflowDefinition.
 */
export const validateWorkflowGraph = validateWorkflowDefinition;
