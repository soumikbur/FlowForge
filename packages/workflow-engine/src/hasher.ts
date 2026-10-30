import crypto from "crypto";
import { WorkflowDefinition } from "@flowforge/shared";

/**
 * Deeply normalizes an arbitrary object or array by recursively sorting all keys alphabetically.
 */
export function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return result;
}

/**
 * Canonicalizes a workflow definition by normalizing node configurations and edges,
 * omitting non-semantic canvas layout coordinates (node.position).
 */
export function canonicalizeWorkflowDefinition(definition: WorkflowDefinition) {
  const normalizedNodes = (definition.nodes || [])
    .map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      config: canonicalizeJson(n.config || {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const normalizedEdges = (definition.edges || [])
    .map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle || null,
      target: e.target,
      targetHandle: e.targetHandle || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
}

/**
 * Computes a deterministic SHA-256 content hash of the execution-relevant workflow definition.
 */
export function computeWorkflowContentHash(definition: WorkflowDefinition): string {
  const canonical = canonicalizeWorkflowDefinition(definition);
  const payload = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

