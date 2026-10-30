import crypto from "crypto";
import { WorkflowDefinition, WorkflowNode, WorkflowEdge } from "@flowforge/shared";
import { validateWorkflowDefinition } from "./validator.js";

const SENSITIVE_PATTERNS = /(password|secret|token|api_?key|credential|private|authorization|webhook[-_]?url)/i;

/**
 * Recursively scrubs credentials, secrets, and auth tokens from an object.
 */
function deepScrubSecrets(obj: unknown, keyPath = ""): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (SENSITIVE_PATTERNS.test(keyPath)) {
      return "[REDACTED]";
    }
    return obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    if (SENSITIVE_PATTERNS.test(keyPath)) {
      return "[REDACTED]";
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => deepScrubSecrets(item, `${keyPath}[${idx}]`));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_PATTERNS.test(k) && typeof v === "string") {
        result[k] = "[REDACTED]";
      } else {
        result[k] = deepScrubSecrets(v, k);
      }
    }
    return result;
  }
  return obj;
}

export interface SanitizedTemplateResult {
  sanitizedDefinition: WorkflowDefinition;
  requiredConnections: string[];
  requiredInputs: Record<string, unknown>;
}

/**
 * Sanitizes a workflow graph for saving as a reusable template.
 * Strips credentials, wipes tenant-specific connection IDs, deactivates triggers,
 * and extracts required connection and input dependencies.
 */
export function sanitizeWorkflowForTemplate(definition: WorkflowDefinition): SanitizedTemplateResult {
  const requiredConnectionsSet = new Set<string>();
  const requiredInputs: Record<string, unknown> = {};

  const sanitizedNodes: WorkflowNode[] = (definition.nodes || []).map((node) => {
    const rawConfig = node.config ? JSON.parse(JSON.stringify(node.config)) : {};

    // 1. Strip runtime / execution artifacts if any exist
    delete rawConfig.executionId;
    delete rawConfig.runCount;
    delete rawConfig.lastRun;
    delete rawConfig.lastOutput;
    delete rawConfig.testResult;

    // 2. Identify connection requirements and strip tenant-specific connectionId
    if (node.type === "CONNECTOR_ACTION") {
      if (typeof rawConfig.connectorId === "string" && rawConfig.connectorId.trim().length > 0) {
        requiredConnectionsSet.add(rawConfig.connectorId.trim());
      }
      // Wipe specific organization connection reference
      rawConfig.connectionId = "";
    } else if (node.type === "EMAIL") {
      requiredConnectionsSet.add("smtp-email");
      if ("smtpConnectionId" in rawConfig) {
        rawConfig.smtpConnectionId = "";
      }
    } else if (node.type === "HTTP_REQUEST") {
      if (typeof rawConfig.connectorId === "string" && rawConfig.connectorId.trim().length > 0) {
        requiredConnectionsSet.add(rawConfig.connectorId.trim());
        rawConfig.connectionId = "";
      }
    }

    // 3. Deactivate triggers so instantiated workflows never auto-trigger
    if (node.type === "TRIGGER") {
      rawConfig.enabled = false;
      rawConfig.active = false;
      if (rawConfig.triggerType === "WEBHOOK") {
        rawConfig.webhookPath = "";
      }
    }

    // 4. Deep scrub any raw secret or token values
    const scrubbedConfig = deepScrubSecrets(rawConfig) as Record<string, unknown>;

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      config: scrubbedConfig,
      position: node.position ? { ...node.position } : undefined,
    };
  });

  const sanitizedEdges: WorkflowEdge[] = (definition.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));

  return {
    sanitizedDefinition: {
      nodes: sanitizedNodes,
      edges: sanitizedEdges,
    },
    requiredConnections: Array.from(requiredConnectionsSet).sort(),
    requiredInputs,
  };
}

export interface InstantiateGraphOptions {
  connectionMappings?: Record<string, string>;
  inputValues?: Record<string, unknown>;
}

/**
 * Instantiates a fresh workflow graph from a template definition.
 * Regenerates unique UUIDs for all nodes and edges to avoid collisions,
 * preserves graph connectivity, binds user-configured connection IDs,
 * keeps triggers inactive, and runs full graph validation.
 */
export function instantiateGraphFromTemplate(
  templateDefinition: WorkflowDefinition,
  options?: InstantiateGraphOptions
): WorkflowDefinition {
  const idMap = new Map<string, string>();

  // 1. Generate new UUIDs for every node
  for (const node of templateDefinition.nodes || []) {
    const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const prefix = node.type.toLowerCase();
    const newId = `node_${prefix}_${randomHex}`;
    idMap.set(node.id, newId);
  }

  // 2. Clone and transform nodes with mapped connection IDs and inactive triggers
  const newNodes: WorkflowNode[] = (templateDefinition.nodes || []).map((node) => {
    const newId = idMap.get(node.id) || `node_${crypto.randomUUID().slice(0, 8)}`;
    const config = node.config ? JSON.parse(JSON.stringify(node.config)) : {};

    // Apply connection mappings if provided
    if (options?.connectionMappings) {
      if (node.type === "CONNECTOR_ACTION" && typeof config.connectorId === "string") {
        if (options.connectionMappings[config.connectorId]) {
          config.connectionId = options.connectionMappings[config.connectorId];
        }
      } else if (node.type === "EMAIL" && options.connectionMappings["smtp-email"]) {
        config.smtpConnectionId = options.connectionMappings["smtp-email"];
      } else if (node.type === "HTTP_REQUEST" && typeof config.connectorId === "string") {
        if (options.connectionMappings[config.connectorId]) {
          config.connectionId = options.connectionMappings[config.connectorId];
        }
      }
    }

    // Inactive triggers by default upon template instantiation
    if (node.type === "TRIGGER") {
      config.enabled = false;
      config.active = false;
    }

    return {
      id: newId,
      type: node.type,
      name: node.name,
      config,
      position: node.position ? { ...node.position } : undefined,
    };
  });

  // 3. Clone and remap edges
  const newEdges: WorkflowEdge[] = (templateDefinition.edges || []).map((edge) => {
    const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const newEdgeId = `edge_${randomHex}`;
    const newSource = idMap.get(edge.source) || edge.source;
    const newTarget = idMap.get(edge.target) || edge.target;

    return {
      id: newEdgeId,
      source: newSource,
      sourceHandle: edge.sourceHandle,
      target: newTarget,
      targetHandle: edge.targetHandle,
    };
  });

  const instantiatedDef: WorkflowDefinition = {
    nodes: newNodes,
    edges: newEdges,
  };

  // 4. Validate that the regenerated workflow definition satisfies all structural rules
  const validation = validateWorkflowDefinition(instantiatedDef);
  if (!validation.isValid) {
    throw new Error(
      `Instantiated template graph validation failed: ${validation.errors.map((e) => e.message).join("; ")}`
    );
  }

  return instantiatedDef;
}
