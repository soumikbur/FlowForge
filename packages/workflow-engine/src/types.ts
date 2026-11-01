import { NodeType, WorkflowNode, WorkflowEdge } from "@flowforge/shared";

export const WorkflowErrorCode = {
  INVALID_DEFINITION: "INVALID_DEFINITION",
  RESOURCE_LIMIT_EXCEEDED: "RESOURCE_LIMIT_EXCEEDED",
  EMPTY_GRAPH: "EMPTY_GRAPH",
  MISSING_TRIGGER_NODE: "MISSING_TRIGGER_NODE",
  MULTIPLE_TRIGGER_NODES: "MULTIPLE_TRIGGER_NODES",
  DUPLICATE_NODE_ID: "DUPLICATE_NODE_ID",
  DUPLICATE_EDGE_ID: "DUPLICATE_EDGE_ID",
  UNKNOWN_NODE_TYPE: "UNKNOWN_NODE_TYPE",
  INVALID_NODE_CONFIG: "INVALID_NODE_CONFIG",
  MISSING_SOURCE_NODE: "MISSING_SOURCE_NODE",
  MISSING_TARGET_NODE: "MISSING_TARGET_NODE",
  INVALID_HANDLE: "INVALID_HANDLE",
  INVALID_CONDITION_HANDLE: "INVALID_CONDITION_HANDLE",
  SELF_CONNECTION_NOT_ALLOWED: "SELF_CONNECTION_NOT_ALLOWED",
  TERMINAL_HAS_OUTGOING_EDGES: "TERMINAL_HAS_OUTGOING_EDGES",
  TRIGGER_HAS_INCOMING_EDGES: "TRIGGER_HAS_INCOMING_EDGES",
  INCOMPLETE_CONDITION_BRANCHES: "INCOMPLETE_CONDITION_BRANCHES",
  UNREACHABLE_NODE: "UNREACHABLE_NODE",
  CYCLE_DETECTED: "CYCLE_DETECTED",
  MISSING_TERMINAL_PATH: "MISSING_TERMINAL_PATH",
} as const;

export type WorkflowErrorCodeType =
  (typeof WorkflowErrorCode)[keyof typeof WorkflowErrorCode];

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  code: string;
  field?: string;
}

export interface ValidationWarning {
  nodeId?: string;
  edgeId?: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ExecutionPlanNode {
  id: string;
  type: NodeType;
  name: string;
  config: Record<string, unknown>;
  isTrigger: boolean;
  isTerminal: boolean;
  dependencies: string[];
  outgoingEdges: Array<{
    targetNodeId: string;
    sourceHandle?: string;
  }>;
  branchHandles?: string[];
}

export interface ExecutionPath {
  pathId: string;
  nodeIds: string[];
  isConditional: boolean;
  conditionBranch?: string;
}

export interface WorkflowExecutionPlan {
  workflowSchemaVersion: string;
  entryTriggerId: string;
  nodes: Record<string, ExecutionPlanNode>;
  topologicalOrder: string[];
  executionPaths: ExecutionPath[];
  terminalNodeIds: string[];
}

export interface ExecutionContext {
  executionId?: string;
  workflowId?: string;
  workflowVersionId?: string;
  organizationId?: string;
  trigger?: {
    type?: string;
    payload?: Record<string, unknown>;
  };
  steps?: Record<string, { status?: string; output?: Record<string, unknown> }>;
  context?: Record<string, unknown>;
  correlationId?: string;
  cancellationSignal?: AbortSignal;
  approvalDecision?: {
    approved?: boolean;
    comment?: string;
    decidedBy?: string;
  };
  [key: string]: unknown;
}
