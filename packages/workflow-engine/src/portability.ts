import crypto from "crypto";
import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  FlowForgeWorkflowPackage,
  FlowForgeWorkflowPackageSchema,
  FlowForgeBackupPackage,
  WorkflowDependencyManifest,
  ImportPreviewResponse,
  CompatibilityStatus,
} from "@flowforge/shared";
import { canonicalizeJson } from "./hasher.js";
import { validateWorkflowDefinition } from "./validator.js";
import { defaultRegistry } from "./registry.js";

const SENSITIVE_PATTERNS =
  /(password|secret|token|api_?key|credential|private|authorization|auth_token|signing_secret|client_secret)/i;

/**
 * Recursively deep-scrubs credentials, secrets, and auth tokens from an object.
 */
export function deepScrubSecrets(obj: unknown, keyPath = ""): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
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
    // Prototype pollution defense: skip __proto__, constructor, prototype
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }
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

/**
 * Computes a deterministic SHA-256 integrity hash over the canonical JSON representation
 * of package content (excluding the integrity section itself).
 */
export function computePackageIntegrityHash(
  pkgContent: Omit<FlowForgeWorkflowPackage, "integrity">,
): string {
  const canonical = canonicalizeJson({
    formatVersion: pkgContent.formatVersion,
    metadata: pkgContent.metadata,
    definition: pkgContent.definition,
    dependencies: pkgContent.dependencies,
  });
  const serialized = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Verifies that the package integrity hash matches its contents.
 */
export function verifyPackageIntegrity(pkg: FlowForgeWorkflowPackage): boolean {
  if (!pkg.integrity || !pkg.integrity.hash) {
    return false;
  }
  const expectedHash = computePackageIntegrityHash({
    formatVersion: pkg.formatVersion,
    metadata: pkg.metadata,
    definition: pkg.definition,
    dependencies: pkg.dependencies,
  });
  return crypto.timingSafeEqual(
    Buffer.from(pkg.integrity.hash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

/**
 * Extracts dependency manifest (node types, connectors, triggers, environment variables)
 * directly from the workflow graph.
 */
export function extractWorkflowDependencies(
  definition: WorkflowDefinition,
): WorkflowDependencyManifest {
  const nodeTypesSet = new Set<string>();
  const connectorMap = new Map<
    string,
    {
      connectorId: string;
      operationIds: Set<string>;
      sourceConnectionId?: string;
    }
  >();
  const triggers: Array<{
    type: "MANUAL" | "WEBHOOK" | "SCHEDULE";
    cronExpression?: string;
    webhookPath?: string;
  }> = [];
  const envVarsSet = new Set<string>();

  for (const node of definition.nodes || []) {
    nodeTypesSet.add(node.type);
    const config = node.config || {};

    if (node.type === "CONNECTOR_ACTION") {
      const connectorId =
        typeof config.connectorId === "string" ? config.connectorId.trim() : "";
      const operationId =
        typeof config.operationId === "string" ? config.operationId.trim() : "";
      const sourceConnectionId =
        typeof config.connectionId === "string" && config.connectionId.trim()
          ? config.connectionId.trim()
          : undefined;

      if (connectorId) {
        if (!connectorMap.has(connectorId)) {
          connectorMap.set(connectorId, {
            connectorId,
            operationIds: new Set<string>(),
            sourceConnectionId,
          });
        }
        if (operationId) {
          connectorMap.get(connectorId)!.operationIds.add(operationId);
        }
      }
    } else if (node.type === "EMAIL") {
      if (!connectorMap.has("smtp-email")) {
        connectorMap.set("smtp-email", {
          connectorId: "smtp-email",
          operationIds: new Set<string>(["send"]),
          sourceConnectionId:
            typeof config.connectionId === "string"
              ? config.connectionId
              : undefined,
        });
      }
    } else if (node.type === "HTTP_REQUEST") {
      if (typeof config.connectorId === "string" && config.connectorId.trim()) {
        const cId = config.connectorId.trim();
        if (!connectorMap.has(cId)) {
          connectorMap.set(cId, {
            connectorId: cId,
            operationIds: new Set<string>(["request"]),
            sourceConnectionId:
              typeof config.connectionId === "string"
                ? config.connectionId
                : undefined,
          });
        }
      }
    } else if (node.type === "TRIGGER") {
      const tType =
        config.triggerType === "WEBHOOK" || config.triggerType === "SCHEDULE"
          ? config.triggerType
          : "MANUAL";
      triggers.push({
        type: tType,
        cronExpression:
          typeof config.cronExpression === "string"
            ? config.cronExpression
            : undefined,
        webhookPath:
          typeof config.webhookPath === "string"
            ? config.webhookPath
            : undefined,
      });
    }

    // Scan config for environment variables / template expressions {{env.FOO}}
    const configString = JSON.stringify(config);
    const envMatches = configString.matchAll(
      /\{\{\s*(?:env\.|secrets\.)([a-zA-Z0-9_-]+)\s*\}\}/g,
    );
    for (const match of envMatches) {
      if (match[1]) envVarsSet.add(match[1]);
    }
    const processEnvMatches = configString.matchAll(
      /process\.env\.([a-zA-Z0-9_]+)/g,
    );
    for (const match of processEnvMatches) {
      if (match[1]) envVarsSet.add(match[1]);
    }
  }

  return {
    nodeTypes: Array.from(nodeTypesSet).sort(),
    connectors: Array.from(connectorMap.values()).map((c) => ({
      connectorId: c.connectorId,
      operationIds: Array.from(c.operationIds).sort(),
      sourceConnectionId: c.sourceConnectionId,
    })),
    triggers,
    environmentVariables: Array.from(envVarsSet).sort(),
  };
}

/**
 * Sanitizes a workflow graph for portable export.
 * Strips raw secrets, tenant database connection references, and deactivates triggers.
 */
export function sanitizeWorkflowDefinitionForExport(
  definition: WorkflowDefinition,
): WorkflowDefinition {
  const connectionMappingTracker = new Map<string, string>();
  let connRefCounter = 1;

  const sanitizedNodes: WorkflowNode[] = (definition.nodes || []).map(
    (node) => {
      const rawConfig = node.config
        ? JSON.parse(JSON.stringify(node.config))
        : {};

      // Remove execution / runtime artifacts
      delete rawConfig.executionId;
      delete rawConfig.runCount;
      delete rawConfig.lastRun;
      delete rawConfig.lastOutput;
      delete rawConfig.testResult;
      delete rawConfig.audit;

      // Convert tenant-specific connectionId to abstract portable reference
      if (
        typeof rawConfig.connectionId === "string" &&
        rawConfig.connectionId.trim().length > 0
      ) {
        const origConnId = rawConfig.connectionId.trim();
        if (!connectionMappingTracker.has(origConnId)) {
          connectionMappingTracker.set(
            origConnId,
            `conn_ref_${connRefCounter++}`,
          );
        }
        rawConfig.connectionId = connectionMappingTracker.get(origConnId);
      }

      // Deactivate triggers in export so imported workflows never execute immediately
      if (node.type === "TRIGGER") {
        rawConfig.enabled = false;
        rawConfig.active = false;
        delete rawConfig.signingSecret;
        if (rawConfig.triggerType === "WEBHOOK") {
          rawConfig.webhookPath = "";
        }
      }

      // Deep-scrub any passwords, API keys, credentials, or bearer tokens
      const scrubbedConfig = deepScrubSecrets(rawConfig) as Record<
        string,
        unknown
      >;

      return {
        id: node.id,
        type: node.type,
        name: node.name,
        config: scrubbedConfig,
        position: node.position ? { ...node.position } : undefined,
      };
    },
  );

  const sanitizedEdges: WorkflowEdge[] = (definition.edges || []).map(
    (edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }),
  );

  return {
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
  };
}

/**
 * Assembles a complete, validated FlowForgeWorkflowPackage ready for export download.
 */
export function createWorkflowExportPackage(options: {
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  sourceWorkflowId?: string;
  sourceRevision?: number;
  sourceVersionNumber?: number;
  definition: WorkflowDefinition;
  sourceAppVersion?: string;
}): FlowForgeWorkflowPackage {
  const sanitizedDefinition = sanitizeWorkflowDefinitionForExport(
    options.definition,
  );
  const dependencies = extractWorkflowDependencies(sanitizedDefinition);

  const metadata = {
    name: options.name,
    description: options.description || undefined,
    category: options.category || undefined,
    tags: options.tags || [],
    sourceWorkflowId: options.sourceWorkflowId,
    sourceRevision: options.sourceRevision,
    sourceVersionNumber: options.sourceVersionNumber,
    sourceAppVersion: options.sourceAppVersion || "1.0.0",
    exportedAt: new Date().toISOString(),
  };

  const packageWithoutIntegrity: Omit<FlowForgeWorkflowPackage, "integrity"> = {
    formatVersion: "flowforge.package/v1",
    metadata,
    definition: sanitizedDefinition,
    dependencies,
  };

  const integrityHash = computePackageIntegrityHash(packageWithoutIntegrity);

  return {
    ...packageWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      hash: integrityHash,
    },
  };
}

/**
 * Assembles an organization backup package containing multiple workflow packages.
 */
export function createOrganizationBackupPackage(options: {
  workflows: FlowForgeWorkflowPackage[];
  sourceOrganizationId?: string;
}): FlowForgeBackupPackage {
  const exportedAt = new Date().toISOString();
  const canonicalContent = canonicalizeJson({
    formatVersion: "flowforge.backup/v1",
    exportedAt,
    sourceOrganizationId: options.sourceOrganizationId,
    workflows: options.workflows,
  });
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalContent))
    .digest("hex");

  return {
    formatVersion: "flowforge.backup/v1",
    exportedAt,
    sourceOrganizationId: options.sourceOrganizationId,
    workflows: options.workflows,
    integrity: {
      algorithm: "sha256",
      hash,
    },
  };
}

/**
 * Performs deep pre-import compatibility and dependency analysis.
 */
export function analyzeWorkflowPackageCompatibility(options: {
  packageData: unknown;
  availableConnectors?: string[];
  orgConnections?: Array<{ id: string; name: string; connectorId: string }>;
  existingWorkflows?: Array<{
    id: string;
    name: string;
    draftRevision: number;
  }>;
}): ImportPreviewResponse {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  // 1. Validate Schema
  const parseResult = FlowForgeWorkflowPackageSchema.safeParse(
    options.packageData,
  );
  if (!parseResult.success) {
    return {
      workflowName: "Unknown",
      packageFormatVersion: "unknown",
      status: "INVALID_PACKAGE",
      canImport: false,
      summary: "Package schema validation failed.",
      integrityVerified: false,
      nodeSummary: { totalNodes: 0, nodeTypes: [], unsupportedNodeTypes: [] },
      connectorRequirements: [],
      conflict: { hasConflict: false },
      suggestedName: "Imported Workflow",
      availableConflictStrategies: ["CREATE_NEW"],
      warnings: [],
      blockingErrors: [
        "The provided file is not a valid FlowForge workflow package.",
      ],
      validationErrors: parseResult.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }

  const pkg = parseResult.data;

  // 2. Format Version Check
  if (pkg.formatVersion !== "flowforge.package/v1") {
    blockingErrors.push(
      `Unsupported package format version '${pkg.formatVersion}'.`,
    );
  }

  // 3. Verify Integrity
  const integrityVerified = verifyPackageIntegrity(pkg);
  if (!integrityVerified) {
    blockingErrors.push(
      "Package cryptographic integrity check failed. The file may have been altered.",
    );
  }

  // 4. Node Complexity & Size Guards
  const nodeCount = pkg.definition.nodes.length;
  const edgeCount = pkg.definition.edges.length;
  if (nodeCount > 200) {
    blockingErrors.push(
      `Package exceeds maximum allowed node limit (200). Found ${nodeCount} nodes.`,
    );
  }
  if (edgeCount > 500) {
    blockingErrors.push(
      `Package exceeds maximum allowed edge limit (500). Found ${edgeCount} edges.`,
    );
  }

  // 5. Node Registry Check
  const nodeTypesSet = new Set<string>();
  const unsupportedNodeTypesSet = new Set<string>();
  const supportedTypesSet = new Set<string>(
    defaultRegistry.listSupportedTypes(),
  );

  for (const node of pkg.definition.nodes) {
    nodeTypesSet.add(node.type);
    if (!supportedTypesSet.has(node.type)) {
      unsupportedNodeTypesSet.add(node.type);
    }
  }

  if (unsupportedNodeTypesSet.size > 0) {
    blockingErrors.push(
      `Workflow contains unsupported node types: ${Array.from(unsupportedNodeTypesSet).join(", ")}.`,
    );
  }

  // 6. Graph Topology Validation
  const graphValidation = validateWorkflowDefinition(pkg.definition);
  if (!graphValidation.isValid) {
    blockingErrors.push(...graphValidation.errors.map((e) => e.message));
  }
  if (graphValidation.warnings && graphValidation.warnings.length > 0) {
    warnings.push(...graphValidation.warnings.map((w) => w.message));
  }

  // 7. Connector Compatibility & Matching Destination Connections
  const availableConnectorsSet = new Set(
    options.availableConnectors || [
      "http-api",
      "slack",
      "smtp-email",
      "stripe",
    ],
  );
  const orgConnections = options.orgConnections || [];

  const connectorRequirements = (pkg.dependencies.connectors || []).map(
    (req) => {
      const isSupported = availableConnectorsSet.has(req.connectorId);
      if (!isSupported) {
        blockingErrors.push(
          `Required connector '${req.connectorId}' is not installed in the platform.`,
        );
      }

      const matching = orgConnections.filter(
        (c) => c.connectorId === req.connectorId,
      );
      const isResolved = matching.length > 0;

      if (!isResolved && isSupported) {
        warnings.push(
          `Connector '${req.connectorId}' has no configured connections in this organization. You will need to create or map one before publishing.`,
        );
      }

      return {
        connectorId: req.connectorId,
        supportedByRegistry: isSupported,
        sourceConnectionId: req.sourceConnectionId,
        matchingOrgConnections: matching.map((c) => ({
          id: c.id,
          name: c.name,
        })),
        isResolved,
      };
    },
  );

  // 8. Triggers Notice
  if (pkg.dependencies.triggers && pkg.dependencies.triggers.length > 0) {
    warnings.push(
      "Workflow triggers have been imported in disabled state. A new webhook URL or schedule must be configured upon activation.",
    );
  }

  // 9. Name Collision Check
  const existingWorkflows = options.existingWorkflows || [];
  const targetName = pkg.metadata.name.trim();
  const conflicting = existingWorkflows.find(
    (w) => w.name.toLowerCase() === targetName.toLowerCase(),
  );

  const hasConflict = Boolean(conflicting);
  let suggestedName = targetName;
  if (hasConflict) {
    let suffix = 1;
    while (
      existingWorkflows.some(
        (w) =>
          w.name.toLowerCase() ===
          `${targetName} (Imported ${suffix})`.toLowerCase(),
      )
    ) {
      suffix++;
    }
    suggestedName = `${targetName} (Imported ${suffix})`;
    warnings.push(
      `A workflow named '${targetName}' already exists in this organization.`,
    );
  }

  // 10. Status Computation
  let status: CompatibilityStatus = "COMPATIBLE";
  if (blockingErrors.length > 0) {
    status = "UNSUPPORTED";
  } else if (connectorRequirements.some((c) => !c.isResolved)) {
    status = "REQUIRES_MAPPING";
  } else if (warnings.length > 0) {
    status = "COMPATIBLE_WITH_WARNINGS";
  }

  const canImport = blockingErrors.length === 0;

  let summary = "Workflow is fully compatible with this environment.";
  if (status === "UNSUPPORTED") {
    summary = `Import blocked: ${blockingErrors.length} compatibility error(s) must be resolved.`;
  } else if (status === "REQUIRES_MAPPING") {
    summary = "Workflow requires connector mapping before it can be activated.";
  } else if (status === "COMPATIBLE_WITH_WARNINGS") {
    summary = "Workflow is compatible with operational warnings.";
  }

  return {
    workflowName: pkg.metadata.name,
    description: pkg.metadata.description,
    packageFormatVersion: pkg.formatVersion,
    sourceAppVersion: pkg.metadata.sourceAppVersion,
    status,
    canImport,
    summary,
    integrityVerified,
    nodeSummary: {
      totalNodes: nodeCount,
      nodeTypes: Array.from(nodeTypesSet).sort(),
      unsupportedNodeTypes: Array.from(unsupportedNodeTypesSet).sort(),
    },
    connectorRequirements,
    conflict: {
      hasConflict,
      conflictingWorkflowId: conflicting?.id,
      conflictingWorkflowName: conflicting?.name,
      currentDraftRevision: conflicting?.draftRevision,
    },
    suggestedName,
    availableConflictStrategies: hasConflict
      ? ["CREATE_NEW", "RENAME", "REPLACE_DRAFT"]
      : ["CREATE_NEW"],
    warnings,
    blockingErrors,
  };
}

/**
 * Applies connector mappings to a workflow definition and normalizes node configurations.
 */
export function applyImportConnectorMappings(
  definition: WorkflowDefinition,
  connectorMappings: Record<string, string> = {},
): WorkflowDefinition {
  const mappedNodes: WorkflowNode[] = (definition.nodes || []).map((node) => {
    const rawConfig = node.config
      ? JSON.parse(JSON.stringify(node.config))
      : {};

    if (
      node.type === "CONNECTOR_ACTION" ||
      node.type === "EMAIL" ||
      node.type === "HTTP_REQUEST"
    ) {
      const origRef =
        typeof rawConfig.connectionId === "string"
          ? rawConfig.connectionId
          : "";
      const connectorId =
        typeof rawConfig.connectorId === "string" ? rawConfig.connectorId : "";

      // Try mapping by specific source connection reference or connector ID
      if (origRef && connectorMappings[origRef]) {
        rawConfig.connectionId = connectorMappings[origRef];
      } else if (connectorId && connectorMappings[connectorId]) {
        rawConfig.connectionId = connectorMappings[connectorId];
      } else if (node.type === "EMAIL" && connectorMappings["smtp-email"]) {
        rawConfig.connectionId = connectorMappings["smtp-email"];
      }
    }

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      config: rawConfig,
      position: node.position ? { ...node.position } : undefined,
    };
  });

  const mappedEdges: WorkflowEdge[] = (definition.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));

  return {
    nodes: mappedNodes,
    edges: mappedEdges,
  };
}
