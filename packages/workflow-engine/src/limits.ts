/**
 * Workflow Engine Safety & Resource Limits
 * Prevents resource exhaustion from oversized graphs, cyclic expansions, or deep expression parsing.
 */
export const ENGINE_LIMITS = {
  MAX_NODES: 500,
  MAX_EDGES: 1000,
  MAX_EXPRESSION_LENGTH: 1000,
  MAX_PATH_DEPTH: 10,
  MAX_DIAGNOSTICS: 100,
} as const;

