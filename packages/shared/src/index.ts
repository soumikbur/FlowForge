import { z } from "zod";

// ==========================================
// ROLES & PERMISSIONS
// ==========================================
export const RoleEnum = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type Role = z.infer<typeof RoleEnum>;

export type Permission =
  | "org:read"
  | "org:write"
  | "org:delete"
  | "workflow:read"
  | "workflow:write"
  | "workflow:publish"
  | "workflow:execute"
  | "workflow:delete"
  | "approval:read"
  | "approval:decide"
  | "credentials:read"
  | "credentials:write"
  | "audit:read";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "org:read",
    "org:write",
    "org:delete",
    "workflow:read",
    "workflow:write",
    "workflow:publish",
    "workflow:execute",
    "workflow:delete",
    "approval:read",
    "approval:decide",
    "credentials:read",
    "credentials:write",
    "audit:read",
  ],
  ADMIN: [
    "org:read",
    "org:write",
    "workflow:read",
    "workflow:write",
    "workflow:publish",
    "workflow:execute",
    "approval:read",
    "approval:decide",
    "credentials:read",
    "credentials:write",
    "audit:read",
  ],
  MEMBER: ["org:read", "workflow:read", "workflow:execute", "approval:read"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ==========================================
// WORKFLOW GRAPH DEFINITIONS & SCHEMAS
// ==========================================
export const NodeTypeEnum = z.enum([
  "TRIGGER",
  "CONDITION",
  "HTTP_REQUEST",
  "EMAIL",
  "APPROVAL",
  "DELAY",
  "END",
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const TriggerTypeEnum = z.enum(["MANUAL", "WEBHOOK", "SCHEDULE"]);
export type TriggerType = z.infer<typeof TriggerTypeEnum>;

// Node Config Schemas
export const TriggerNodeConfigSchema = z.object({
  triggerType: TriggerTypeEnum.default("MANUAL"),
  webhookPath: z.string().optional(),
  cronExpression: z.string().optional(),
});

export const ConditionNodeConfigSchema = z.object({
  expression: z.string().min(1, "Condition expression is required"),
});

export const HttpRequestNodeConfigSchema = z.object({
  url: z.string().url("Valid URL is required"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().max(30000).default(10000),
});

export const EmailNodeConfigSchema = z.object({
  to: z.string().min(1, "Recipient expression or email is required"),
  subject: z.string().min(1, "Subject is required"),
  template: z.string().min(1, "Email body template is required"),
});

export const ApprovalNodeConfigSchema = z.object({
  title: z.string().min(1, "Approval title is required"),
  description: z.string().optional(),
  requiredRole: RoleEnum.default("ADMIN"),
  timeoutSeconds: z.number().int().positive().max(604800).default(86400), // max 7 days
});

export const DelayNodeConfigSchema = z.object({
  durationSeconds: z.number().int().positive().max(86400).default(60), // max 24 hours
});

export const EndNodeConfigSchema = z.object({
  summaryExpression: z.string().optional(),
});

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeEnum,
  name: z.string().min(1),
  config: z.record(z.unknown()),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().optional(),
  target: z.string().min(1),
  targetHandle: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDefinitionSchema = z.object({
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ==========================================
// EXECUTION STATE MACHINE & ENUMS
// ==========================================
export const ExecutionStatusEnum = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_APPROVAL",
  "WAITING_DELAY",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

export const StepStatusEnum = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "WAITING",
]);
export type StepStatus = z.infer<typeof StepStatusEnum>;

export const ApprovalStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "TIMEOUT",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

// ==========================================
// API ENVELOPES & PAYLOAD SCHEMAS
// ==========================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
});
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowSchema>;

export const TriggerWorkflowSchema = z.object({
  payload: z.record(z.unknown()).default({}),
});
export type TriggerWorkflowRequest = z.infer<typeof TriggerWorkflowSchema>;

export const DecideApprovalSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional(),
});
export type DecideApprovalRequest = z.infer<typeof DecideApprovalSchema>;
