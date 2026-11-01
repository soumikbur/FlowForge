import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
} from "@flowforge/shared";

export interface ConfigDiff {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface NodeComparisonDiff {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  previousConfig: Record<string, unknown>;
  newConfig: Record<string, unknown>;
  diffs: ConfigDiff[];
}

export interface WorkflowComparisonResult {
  isIdentical: boolean;
  addedNodes: WorkflowNode[];
  removedNodes: WorkflowNode[];
  modifiedNodes: NodeComparisonDiff[];
  addedEdges: WorkflowEdge[];
  removedEdges: WorkflowEdge[];
  summary: {
    totalChanges: number;
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
  };
}

const SENSITIVE_KEY_REGEX =
  /(password|secret|token|api_?key|credential|private)/i;

/**
 * Redacts sensitive credentials or secrets within configuration values.
 */
export function redactSensitiveValues(obj: unknown, keyPath = ""): unknown {
  if (obj === null || typeof obj !== "object") {
    if (SENSITIVE_KEY_REGEX.test(keyPath) && obj !== undefined) {
      return "[REDACTED]";
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) =>
      redactSensitiveValues(item, `${keyPath}[${i}]`),
    );
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const currentPath = keyPath ? `${keyPath}.${k}` : k;
    if (
      SENSITIVE_KEY_REGEX.test(k) &&
      v !== undefined &&
      v !== null &&
      v !== ""
    ) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redactSensitiveValues(v, currentPath);
    }
  }
  return result;
}

/**
 * Deeply compares two configuration objects and returns human-readable path-based diffs.
 */
export function compareObjects(
  objA: Record<string, unknown>,
  objB: Record<string, unknown>,
  prefix = "",
): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  const allKeys = Array.from(
    new Set([...Object.keys(objA || {}), ...Object.keys(objB || {})]),
  ).sort();

  for (const key of allKeys) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const valA = objA ? objA[key] : undefined;
    const valB = objB ? objB[key] : undefined;

    if (valA === undefined && valB !== undefined) {
      diffs.push({
        path: fullPath,
        before: undefined,
        after: redactSensitiveValues(valB, fullPath),
      });
    } else if (valA !== undefined && valB === undefined) {
      diffs.push({
        path: fullPath,
        before: redactSensitiveValues(valA, fullPath),
        after: undefined,
      });
    } else if (
      typeof valA === "object" &&
      valA !== null &&
      typeof valB === "object" &&
      valB !== null &&
      !Array.isArray(valA) &&
      !Array.isArray(valB)
    ) {
      diffs.push(
        ...compareObjects(
          valA as Record<string, unknown>,
          valB as Record<string, unknown>,
          fullPath,
        ),
      );
    } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      diffs.push({
        path: fullPath,
        before: redactSensitiveValues(valA, fullPath),
        after: redactSensitiveValues(valB, fullPath),
      });
    }
  }

  return diffs;
}

/**
 * Compares two workflow definitions and produces structured differences with secret redaction.
 */
export function compareWorkflowDefinitions(
  fromDef: WorkflowDefinition,
  toDef: WorkflowDefinition,
): WorkflowComparisonResult {
  const fromNodesMap = new Map((fromDef.nodes || []).map((n) => [n.id, n]));
  const toNodesMap = new Map((toDef.nodes || []).map((n) => [n.id, n]));

  const addedNodes: WorkflowNode[] = [];
  const removedNodes: WorkflowNode[] = [];
  const modifiedNodes: NodeComparisonDiff[] = [];

  for (const [toId, toNode] of toNodesMap.entries()) {
    if (!fromNodesMap.has(toId)) {
      addedNodes.push({
        ...toNode,
        config: redactSensitiveValues(toNode.config) as Record<string, unknown>,
      });
    } else {
      const fromNode = fromNodesMap.get(toId)!;
      const configDiffs = compareObjects(
        fromNode.config || {},
        toNode.config || {},
      );
      const typeChanged = fromNode.type !== toNode.type;
      const nameChanged = fromNode.name !== toNode.name;

      if (configDiffs.length > 0 || typeChanged || nameChanged) {
        const diffs = [...configDiffs];
        if (typeChanged) {
          diffs.unshift({
            path: "type",
            before: fromNode.type,
            after: toNode.type,
          });
        }
        if (nameChanged) {
          diffs.unshift({
            path: "name",
            before: fromNode.name,
            after: toNode.name,
          });
        }

        modifiedNodes.push({
          nodeId: toId,
          nodeName: toNode.name,
          nodeType: toNode.type,
          previousConfig: redactSensitiveValues(fromNode.config) as Record<
            string,
            unknown
          >,
          newConfig: redactSensitiveValues(toNode.config) as Record<
            string,
            unknown
          >,
          diffs,
        });
      }
    }
  }

  for (const [fromId, fromNode] of fromNodesMap.entries()) {
    if (!toNodesMap.has(fromId)) {
      removedNodes.push({
        ...fromNode,
        config: redactSensitiveValues(fromNode.config) as Record<
          string,
          unknown
        >,
      });
    }
  }

  const fromEdgesMap = new Map((fromDef.edges || []).map((e) => [e.id, e]));
  const toEdgesMap = new Map((toDef.edges || []).map((e) => [e.id, e]));

  const addedEdges: WorkflowEdge[] = [];
  const removedEdges: WorkflowEdge[] = [];

  for (const [toId, toEdge] of toEdgesMap.entries()) {
    if (!fromEdgesMap.has(toId)) {
      addedEdges.push(toEdge);
    }
  }

  for (const [fromId, fromEdge] of fromEdgesMap.entries()) {
    if (!toEdgesMap.has(fromId)) {
      removedEdges.push(fromEdge);
    }
  }

  const isIdentical =
    addedNodes.length === 0 &&
    removedNodes.length === 0 &&
    modifiedNodes.length === 0 &&
    addedEdges.length === 0 &&
    removedEdges.length === 0;

  return {
    isIdentical,
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary: {
      totalChanges:
        addedNodes.length +
        removedNodes.length +
        modifiedNodes.length +
        addedEdges.length +
        removedEdges.length,
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesModified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
    },
  };
}
