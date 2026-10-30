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
  | "org:members:read"
  | "org:members:write"
  | "org:members:delete"
  | "org:owner:transfer"
  | "workflow:read"
  | "workflow:write"
  | "workflow:publish"
  | "workflow:execute"
  | "workflow:delete"
  | "approval:read"
  | "approval:decide"
  | "credentials:read"
  | "credentials:write"
  | "audit:read"
  | "webhook:read"
  | "webhook:write"
  | "schedule:read"
  | "schedule:write";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "org:read",
    "org:write",
    "org:delete",
    "org:members:read",
    "org:members:write",
    "org:members:delete",
    "org:owner:transfer",
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
    "webhook:read",
    "webhook:write",
    "schedule:read",
    "schedule:write",
  ],
  ADMIN: [
    "org:read",
    "org:write",
    "org:members:read",
    "org:members:write",
    "org:members:delete",
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
    "webhook:read",
    "webhook:write",
    "schedule:read",
    "schedule:write",
  ],
  MEMBER: [
    "org:read",
    "org:members:read",
    "workflow:read",
    "workflow:execute",
    "approval:read",
    "webhook:read",
    "schedule:read",
    "credentials:read",
  ],
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
  timeoutMs: z.number().int().positive().max(60000).default(10000),
  credentialId: z.string().optional(),
  maxRetries: z.number().int().min(0).max(5).default(2),
  idempotentRetry: z.boolean().default(false),
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
  timeoutPolicy: z.enum(["REJECT", "FAIL"]).default("REJECT"),
  allowSelfApproval: z.boolean().default(false),
  assignedUserId: z.string().optional(),
});

export const DelayNodeConfigSchema = z.object({
  durationSeconds: z.number().int().min(0).max(2592000).default(60), // max 30 days
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

export const ReassignApprovalSchema = z
  .object({
    assignedUserId: z.string().optional(),
    requiredRole: RoleEnum.optional(),
    reason: z.string().optional(),
  })
  .refine((data) => data.assignedUserId || data.requiredRole, {
    message: "Either assignedUserId or requiredRole must be provided",
  });
export type ReassignApprovalRequest = z.infer<typeof ReassignApprovalSchema>;

export const RetryExecutionSchema = z.object({
  stepId: z.string().optional(),
  reason: z.string().optional(),
});
export type RetryExecutionRequest = z.infer<typeof RetryExecutionSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name cannot be empty").optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().email("Valid email required"),
  role: RoleEnum.default("MEMBER"),
});
export type InviteMemberRequest = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: RoleEnum,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const ApprovalQuerySchema = PaginationQuerySchema.extend({
  assignedToMe: z.coerce.boolean().optional(),
  status: ApprovalStatusEnum.optional(),
});
export type ApprovalQuery = z.infer<typeof ApprovalQuerySchema>;

export const ExecutionQuerySchema = PaginationQuerySchema.extend({
  status: ExecutionStatusEnum.optional(),
  workflowId: z.string().optional(),
});
export type ExecutionQuery = z.infer<typeof ExecutionQuerySchema>;

// ==========================================
// WEBHOOK CONFIG SCHEMAS
// ==========================================
export const CreateWebhookConfigSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  name: z.string().min(1, "Webhook name is required"),
  eventFilter: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CreateWebhookConfigRequest = z.infer<typeof CreateWebhookConfigSchema>;

export const UpdateWebhookConfigSchema = z.object({
  name: z.string().min(1).optional(),
  eventFilter: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookConfigRequest = z.infer<typeof UpdateWebhookConfigSchema>;

// ==========================================
// SCHEDULE SCHEMAS
// ==========================================
export const CreateScheduleSchema = z
  .object({
    workflowId: z.string().min(1, "Workflow ID is required"),
    name: z.string().min(1, "Schedule name is required"),
    cronExpression: z.string().optional(),
    scheduledAt: z.string().datetime().optional(),
    timezone: z.string().default("UTC"),
    misfirePolicy: z.enum(["RUN_ONCE", "SKIP"]).default("RUN_ONCE"),
    enabled: z.boolean().default(true),
  })
  .refine((data) => data.cronExpression || data.scheduledAt, {
    message: "Either cronExpression or scheduledAt must be provided",
  });
export type CreateScheduleRequest = z.infer<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = z.object({
  name: z.string().min(1).optional(),
  cronExpression: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  misfirePolicy: z.enum(["RUN_ONCE", "SKIP"]).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleSchema>;

// ==========================================
// CREDENTIAL SCHEMAS
// ==========================================
export const CredentialTypeEnum = z.enum([
  "API_KEY",
  "BEARER_TOKEN",
  "BASIC_AUTH",
  "SMTP",
]);
export type CredentialType = z.infer<typeof CredentialTypeEnum>;

export const CreateCredentialSchema = z.object({
  name: z.string().min(1, "Credential name is required"),
  type: CredentialTypeEnum,
  data: z.record(z.unknown()),
});
export type CreateCredentialRequest = z.infer<typeof CreateCredentialSchema>;
