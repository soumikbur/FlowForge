import { z } from "zod";
import crypto from "crypto";

// ==========================================
// ROLES & PERMISSIONS
// ==========================================
export const RoleEnum = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
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
  | "schedule:write"
  | "workflow:deploy"
  | "workflow:deploy:prod"
  | "analytics:read"
  | "analytics:write"
  | "api-keys:read"
  | "api-keys:write"
  | "invitation:read"
  | "invitation:write"
  | "retention:write"
  | "connections:read"
  | "connections:write"
  | "templates:read"
  | "templates:write"
  | "templates:publish"
  | "notifications:read"
  | "notifications:write"
  | "workflow:export"
  | "workflow:import"
  | "billing:read"
  | "billing:write"
  | "billing:admin"
  | "workspace:read"
  | "workspace:write"
  | "workspace:delete"
  | "branding:read"
  | "branding:write"
  | "domains:read"
  | "domains:write"
  | "licensing:read"
  | "licensing:write"
  | "sso:read"
  | "sso:write"
  | "sso:admin"
  | "scim:read"
  | "scim:write"
  | "compliance:read"
  | "compliance:write"
  | "compliance:admin"
  | "privacy:read"
  | "privacy:write"
  | "legal-hold:read"
  | "legal-hold:write"
  | "ai:read"
  | "ai:generate"
  | "ai:admin"
  | "events:read"
  | "events:ingest"
  | "events:write"
  | "events:replay"
  | "events:admin"
  | "extensions:read"
  | "extensions:submit"
  | "extensions:write"
  | "extensions:admin"
  | "resilience:read"
  | "resilience:admin"
  | "search:read"
  | "search:saved:write"
  | "policy:read"
  | "policy:write"
  | "policy:evaluate"
  | "policy:admin"
  | "reports:read"
  | "reports:write"
  | "quotas:read"
  | "quotas:write"
  | "quotas:admin"
  | "workflow:test"
  | "workflow:simulate"
  | "workflow:test_real";

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
    "workflow:deploy",
    "workflow:deploy:prod",
    "analytics:read",
    "analytics:write",
    "api-keys:read",
    "api-keys:write",
    "invitation:read",
    "invitation:write",
    "retention:write",
    "connections:read",
    "connections:write",
    "templates:read",
    "templates:write",
    "templates:publish",
    "notifications:read",
    "notifications:write",
    "workflow:export",
    "workflow:import",
    "billing:read",
    "billing:write",
    "billing:admin",
    "workspace:read",
    "workspace:write",
    "workspace:delete",
    "branding:read",
    "branding:write",
    "domains:read",
    "domains:write",
    "licensing:read",
    "licensing:write",
    "sso:read",
    "sso:write",
    "sso:admin",
    "scim:read",
    "scim:write",
    "compliance:read",
    "compliance:write",
    "compliance:admin",
    "privacy:read",
    "privacy:write",
    "legal-hold:read",
    "legal-hold:write",
    "ai:read",
    "ai:generate",
    "ai:admin",
    "events:read",
    "events:ingest",
    "events:write",
    "events:replay",
    "events:admin",
    "extensions:read",
    "extensions:submit",
    "extensions:write",
    "extensions:admin",
    "resilience:read",
    "resilience:admin",
    "search:read",
    "search:saved:write",
    "policy:read",
    "policy:write",
    "policy:evaluate",
    "policy:admin",
    "reports:read",
    "reports:write",
    "quotas:read",
    "quotas:write",
    "quotas:admin",
    "workflow:test",
    "workflow:simulate",
    "workflow:test_real",
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
    "workflow:deploy",
    "workflow:deploy:prod",
    "analytics:read",
    "analytics:write",
    "api-keys:read",
    "api-keys:write",
    "invitation:read",
    "invitation:write",
    "connections:read",
    "connections:write",
    "templates:read",
    "templates:write",
    "templates:publish",
    "notifications:read",
    "notifications:write",
    "workflow:export",
    "workflow:import",
    "billing:read",
    "billing:write",
    "workspace:read",
    "workspace:write",
    "workspace:delete",
    "branding:read",
    "branding:write",
    "domains:read",
    "domains:write",
    "licensing:read",
    "sso:read",
    "sso:write",
    "scim:read",
    "scim:write",
    "retention:write",
    "compliance:read",
    "compliance:write",
    "privacy:read",
    "privacy:write",
    "legal-hold:read",
    "legal-hold:write",
    "ai:read",
    "ai:generate",
    "ai:admin",
    "events:read",
    "events:ingest",
    "events:write",
    "events:replay",
    "events:admin",
    "extensions:read",
    "extensions:submit",
    "extensions:write",
    "extensions:admin",
    "resilience:read",
    "resilience:admin",
    "search:read",
    "search:saved:write",
    "policy:read",
    "policy:write",
    "policy:evaluate",
    "policy:admin",
    "reports:read",
    "reports:write",
    "quotas:read",
    "quotas:write",
    "quotas:admin",
    "workflow:test",
    "workflow:simulate",
    "workflow:test_real",
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
    "analytics:read",
    "connections:read",
    "templates:read",
    "notifications:read",
    "notifications:write",
    "workflow:export",
    "workflow:import",
    "workspace:read",
    "branding:read",
    "privacy:read",
    "ai:read",
    "ai:generate",
    "events:read",
    "events:ingest",
    "events:write",
    "extensions:read",
    "extensions:submit",
    "resilience:read",
    "search:read",
    "search:saved:write",
    "policy:read",
    "policy:evaluate",
    "reports:read",
    "reports:write",
    "quotas:read",
    "workflow:test",
    "workflow:simulate",
  ],
  VIEWER: [
    "org:read",
    "org:members:read",
    "workflow:read",
    "approval:read",
    "analytics:read",
    "audit:read",
    "connections:read",
    "templates:read",
    "notifications:read",
    "notifications:write",
    "workspace:read",
    "branding:read",
    "compliance:read",
    "ai:read",
    "events:read",
    "extensions:read",
    "resilience:read",
    "search:read",
    "policy:read",
    "reports:read",
    "quotas:read",
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
  "CONNECTOR_ACTION",
  "EXTENSION_NODE",
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const TriggerTypeEnum = z.enum([
  "MANUAL",
  "WEBHOOK",
  "SCHEDULE",
  "EVENT",
]);
export type TriggerType = z.infer<typeof TriggerTypeEnum>;

// Node Config Schemas
export const TriggerNodeConfigSchema = z.object({
  triggerType: TriggerTypeEnum.default("MANUAL"),
  webhookPath: z.string().optional(),
  cronExpression: z.string().optional(),
  eventType: z.string().optional(),
  eventFilter: z.string().optional(),
  source: z.string().optional(),
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
  connectionId: z.string().optional(),
  maxRetries: z.number().int().min(0).max(5).default(2),
  idempotentRetry: z.boolean().default(false),
});

export const EmailNodeConfigSchema = z.object({
  to: z.string().min(1, "Recipient expression or email is required"),
  subject: z.string().min(1, "Subject is required"),
  template: z.string().min(1, "Email body template is required"),
  connectionId: z.string().optional(),
});

export const ConnectorActionNodeConfigSchema = z.object({
  connectorId: z.string().min(1, "Connector ID is required"),
  operationId: z.string().min(1, "Operation ID is required"),
  connectionId: z.string().default(""),
  parameters: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().positive().max(60000).default(10000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  idempotentRetry: z.boolean().default(false),
});
export type ConnectorActionNodeConfig = z.infer<
  typeof ConnectorActionNodeConfigSchema
>;

export const ExtensionNodeConfigSchema = z.object({
  extensionId: z.string().min(1, "Extension ID is required"),
  nodeType: z.string().min(1, "Extension node type is required"),
  parameters: z.record(z.unknown()).default({}),
  connectionId: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(300).default(60),
});
export type ExtensionNodeConfig = z.infer<typeof ExtensionNodeConfigSchema>;

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
  workspaceId: z.string().optional(),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  workspaceId: z.string().optional().nullable(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  expectedRevision: z.number().int().min(0).optional(),
});
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowSchema>;

export const PublishWorkflowSchema = z.object({
  releaseNotes: z.string().optional(),
  force: z.boolean().default(false),
});
export type PublishWorkflowRequest = z.infer<typeof PublishWorkflowSchema>;

export const WorkflowEnvironmentEnum = z.enum([
  "development",
  "staging",
  "production",
]);
export type WorkflowEnvironment = z.infer<typeof WorkflowEnvironmentEnum>;

export const PromoteWorkflowSchema = z.object({
  versionId: z.string().min(1, "Workflow version ID is required"),
  targetEnvironment: WorkflowEnvironmentEnum,
  releaseNotes: z.string().optional(),
});
export type PromoteWorkflowRequest = z.infer<typeof PromoteWorkflowSchema>;

export const RollbackWorkflowSchema = z.object({
  targetVersionId: z.string().optional(),
  reason: z.string().optional(),
});
export type RollbackWorkflowRequest = z.infer<typeof RollbackWorkflowSchema>;

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
export type CreateOrganizationRequest = z.infer<
  typeof CreateOrganizationSchema
>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name cannot be empty").optional(),
});
export type UpdateOrganizationRequest = z.infer<
  typeof UpdateOrganizationSchema
>;

export const InviteMemberSchema = z.object({
  email: z.string().email("Valid email required"),
  role: RoleEnum.default("MEMBER"),
});
export type InviteMemberRequest = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: RoleEnum,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleSchema>;

export const OrganizationSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().default("UTC").optional(),
  billingEmail: z.string().email().optional().nullable(),
  enforce2FA: z.boolean().default(false).optional(),
  allowedIpRanges: z.array(z.string()).default([]).optional(),
  executionRetentionDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(90)
    .optional(),
  auditRetentionDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(365)
    .optional(),
});
export type OrganizationSettings = z.infer<typeof OrganizationSettingsSchema>;

export const TransferOwnershipSchema = z.object({
  newOwnerUserId: z.string().min(1, "Target user ID is required"),
});
export type TransferOwnershipRequest = z.infer<typeof TransferOwnershipSchema>;

export const InvitationStatusEnum = z.enum([
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
]);
export type InvitationStatus = z.infer<typeof InvitationStatusEnum>;

export const CreateInvitationSchema = z.object({
  email: z.string().email("Valid email required"),
  role: RoleEnum.default("MEMBER"),
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationSchema>;

export const AcceptInvitationSchema = z.object({
  token: z.string().min(16, "Valid invitation token required"),
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationSchema>;

export const ApiKeyScopeEnum = z.enum([
  "workflow:read",
  "workflow:execute",
  "workflow:write",
  "analytics:read",
  "audit:read",
  "workflows:read",
  "workflows:write",
  "executions:read",
  "executions:write",
  "approvals:read",
  "approvals:write",
  "connectors:read",
  "connectors:write",
  "usage:read",
  "webhooks:read",
  "webhooks:write",
  "apikeys:read",
  "apikeys:write",
  "compliance:read",
  "compliance:write",
  "privacy:read",
  "privacy:write",
  "ai:read",
  "ai:write",
  "events:read",
  "events:ingest",
  "events:write",
  "events:replay",
  "extensions:read",
  "extensions:write",
  "extensions:admin",
  "resilience:read",
  "resilience:admin",
  "search:read",
  "search:write",
  "policy:read",
  "policy:write",
  "policy:evaluate",
  "policy:admin",
  "reports:read",
  "reports:write",
  "quotas:read",
  "quotas:write",
  "quotas:admin",
  "workflow:test",
  "workflow:simulate",
  "workflow:test_real",
  "workflows:test",
  "workflows:simulate",
]);
export type ApiKeyScope = z.infer<typeof ApiKeyScopeEnum>;

export const SCOPE_TO_PERMISSION_MAP: Record<string, Permission> = {
  "workflow:read": "workflow:read",
  "workflow:write": "workflow:write",
  "workflow:test": "workflow:test",
  "workflow:simulate": "workflow:simulate",
  "workflow:test_real": "workflow:test_real",
  "workflows:test": "workflow:test",
  "workflows:simulate": "workflow:simulate",
  "workflow:execute": "workflow:execute",
  "workflows:read": "workflow:read",
  "workflows:write": "workflow:write",
  "executions:read": "workflow:read",
  "executions:write": "workflow:execute",
  "approval:read": "approval:read",
  "approval:decide": "approval:decide",
  "approvals:read": "approval:read",
  "approvals:write": "approval:decide",
  "connections:read": "connections:read",
  "connections:write": "connections:write",
  "connectors:read": "connections:read",
  "connectors:write": "connections:write",
  "analytics:read": "analytics:read",
  "audit:read": "audit:read",
  "usage:read": "analytics:read",
  "webhook:read": "webhook:read",
  "webhook:write": "webhook:write",
  "webhooks:read": "webhook:read",
  "webhooks:write": "webhook:write",
  "api-keys:read": "api-keys:read",
  "api-keys:write": "api-keys:write",
  "apikeys:read": "api-keys:read",
  "apikeys:write": "api-keys:write",
  "compliance:read": "compliance:read",
  "compliance:write": "compliance:write",
  "privacy:read": "privacy:read",
  "privacy:write": "privacy:write",
  "ai:read": "ai:read",
  "ai:write": "ai:generate",
  "events:read": "events:read",
  "events:ingest": "events:ingest",
  "events:write": "events:write",
  "events:replay": "events:replay",
  "extensions:read": "extensions:read",
  "extensions:write": "extensions:write",
  "extensions:admin": "extensions:admin",
  "resilience:read": "resilience:read",
  "resilience:admin": "resilience:admin",
  "search:read": "search:read",
  "search:write": "search:saved:write",
  "policy:read": "policy:read",
  "policy:write": "policy:write",
  "policy:evaluate": "policy:evaluate",
  "policy:admin": "policy:admin",
  "reports:read": "reports:read",
  "reports:write": "reports:write",
  "quotas:read": "quotas:read",
  "quotas:write": "quotas:write",
  "quotas:admin": "quotas:admin",
};

export function hasScopePermission(
  grantedScopes: readonly string[] | string[],
  requiredPermission: Permission,
): boolean {
  if (grantedScopes.includes("*") || grantedScopes.includes("admin"))
    return true;
  if (grantedScopes.includes(requiredPermission)) return true;
  return grantedScopes.some(
    (s) => SCOPE_TO_PERMISSION_MAP[s] === requiredPermission,
  );
}

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Key name is required").max(100),
  scopes: z.array(ApiKeyScopeEnum).min(1, "At least one scope is required"),
  workspaceId: z.string().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

export const RotateApiKeySchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type RotateApiKeyRequest = z.infer<typeof RotateApiKeySchema>;

export const RetentionCleanupSchema = z.object({
  dryRun: z.coerce.boolean().default(true),
  olderThanDays: z.coerce.number().int().min(1).optional(),
});
export type RetentionCleanupRequest = z.infer<typeof RetentionCleanupSchema>;

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
export type CreateWebhookConfigRequest = z.infer<
  typeof CreateWebhookConfigSchema
>;

export const UpdateWebhookConfigSchema = z.object({
  name: z.string().min(1).optional(),
  eventFilter: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookConfigRequest = z.infer<
  typeof UpdateWebhookConfigSchema
>;

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

// ==========================================
// ANALYTICS & OPERATIONAL SCHEMAS
// ==========================================
export const AnalyticsTimeRangeEnum = z.enum([
  "1h",
  "24h",
  "7d",
  "30d",
  "custom",
]);
export type AnalyticsTimeRange = z.infer<typeof AnalyticsTimeRangeEnum>;

export const AnalyticsFilterSchema = z.object({
  range: AnalyticsTimeRangeEnum.default("24h"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  workflowId: z.string().optional(),
  environment: WorkflowEnvironmentEnum.optional(),
});
export type AnalyticsFilterQuery = z.infer<typeof AnalyticsFilterSchema>;

export const FailureCategoryEnum = z.enum([
  "VALIDATION_ERROR",
  "AUTH_ERROR",
  "INTEGRATION_ERROR",
  "HTTP_TIMEOUT",
  "SERVICE_ERROR",
  "RATE_LIMITED",
  "NODE_CONFIG_ERROR",
  "RUNTIME_ERROR",
  "QUEUE_ERROR",
  "CANCELLATION",
  "UNKNOWN_ERROR",
]);
export type FailureCategory = z.infer<typeof FailureCategoryEnum>;

export const AlertSeverityEnum = z.enum(["INFO", "WARNING", "CRITICAL"]);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

export const AlertStatusEnum = z.enum(["ACTIVE", "RESOLVED"]);
export type AlertStatus = z.infer<typeof AlertStatusEnum>;

export const AlertRuleTypeEnum = z.enum([
  "HIGH_FAILURE_RATE",
  "CONSECUTIVE_FAILURES",
  "QUEUE_BACKLOG",
  "SCHEDULER_LAG",
  "WORKER_UNAVAILABLE",
  "APPROVAL_TIMEOUT_SURGE",
]);
export type AlertRuleType = z.infer<typeof AlertRuleTypeEnum>;

export const ResolveAlertSchema = z.object({
  resolutionNote: z.string().optional(),
});
export type ResolveAlertRequest = z.infer<typeof ResolveAlertSchema>;

// ==========================================
// CONNECTORS & INTEGRATION CONNECTIONS
// ==========================================
export const ConnectorCategoryEnum = z.enum([
  "HTTP",
  "NOTIFICATION",
  "DATABASE",
  "AI",
  "CUSTOM",
]);
export type ConnectorCategory = z.infer<typeof ConnectorCategoryEnum>;

export const ConnectionStatusEnum = z.enum(["ACTIVE", "DISABLED", "REVOKED"]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusEnum>;

export const AuthTypeEnum = z.enum([
  "NONE",
  "API_KEY",
  "BEARER_TOKEN",
  "BASIC_AUTH",
  "OAUTH2",
  "CUSTOM",
]);
export type AuthType = z.infer<typeof AuthTypeEnum>;

export const ConnectorParameterSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "boolean", "json", "secret"]),
  required: z.boolean().default(false),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
});
export type ConnectorParameter = z.infer<typeof ConnectorParameterSchema>;

export const ConnectorOperationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  parameters: z.array(ConnectorParameterSchema).default([]),
  outputSchema: z.record(z.unknown()).optional(),
  isIdempotent: z.boolean().default(false),
});
export type ConnectorOperation = z.infer<typeof ConnectorOperationSchema>;

export const ConnectorDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  category: ConnectorCategoryEnum,
  authType: AuthTypeEnum,
  authConfigFields: z.array(ConnectorParameterSchema).default([]),
  operations: z.array(ConnectorOperationSchema).default([]),
  icon: z.string().optional(),
  documentationUrl: z.string().optional(),
});
export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionSchema>;

export const CreateConnectionSchema = z.object({
  connectorId: z.string().min(1, "Connector ID is required"),
  name: z.string().min(1, "Connection name is required").max(100),
  authType: AuthTypeEnum.default("API_KEY"),
  credentialData: z.record(z.unknown()), // plaintext in request, encrypted at rest
  metadata: z.record(z.unknown()).optional(),
});
export type CreateConnectionRequest = z.infer<typeof CreateConnectionSchema>;

export const UpdateConnectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: ConnectionStatusEnum.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateConnectionRequest = z.infer<typeof UpdateConnectionSchema>;

export const RotateConnectionCredentialSchema = z.object({
  credentialData: z.record(z.unknown()),
});
export type RotateConnectionCredentialRequest = z.infer<
  typeof RotateConnectionCredentialSchema
>;

export const TestConnectionSchema = z.object({
  credentialData: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});
export type TestConnectionRequest = z.infer<typeof TestConnectionSchema>;

export const ConnectionTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  latencyMs: z.number().int().nonnegative().optional(),
  errorCategory: z.string().optional(),
  testedAt: z.string().datetime(),
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

export const IntegrationConnectionResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  connectorId: z.string(),
  name: z.string(),
  status: ConnectionStatusEnum,
  authType: AuthTypeEnum,
  maskedSummary: z.record(z.string()).optional(),
  lastTestedAt: z.string().datetime().nullable().optional(),
  lastTestStatus: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdById: z.string().optional(),
});
export type IntegrationConnectionResponse = z.infer<
  typeof IntegrationConnectionResponseSchema
>;

// ==========================================
// WORKFLOW TEMPLATES & MARKETPLACE
// ==========================================
export const TemplateVisibilityEnum = z.enum([
  "PRIVATE",
  "ORGANIZATION",
  "PLATFORM",
]);
export type TemplateVisibility = z.infer<typeof TemplateVisibilityEnum>;

export const TemplateStatusEnum = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type TemplateStatus = z.infer<typeof TemplateStatusEnum>;

export const TemplateCategoryEnum = z.enum([
  "DevOps",
  "Finance",
  "Operations",
  "Customer Support",
  "Security",
  "Marketing",
  "General",
]);
export type TemplateCategory = z.infer<typeof TemplateCategoryEnum>;

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(100),
  shortDescription: z.string().min(1, "Short description is required").max(255),
  description: z.string().optional(),
  category: z.string().min(1).default("General"),
  tags: z.array(z.string()).default([]),
  visibility: TemplateVisibilityEnum.default("PRIVATE"),
  workflowId: z.string().optional(),
  definition: WorkflowDefinitionSchema.optional(),
  requiredConnections: z.array(z.string()).optional(),
  requiredInputs: z.record(z.unknown()).optional(),
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortDescription: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: TemplateVisibilityEnum.optional(),
  status: TemplateStatusEnum.optional(),
  definition: WorkflowDefinitionSchema.optional(),
  requiredConnections: z.array(z.string()).optional(),
  requiredInputs: z.record(z.unknown()).optional(),
});
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateSchema>;

export const PublishTemplateVersionSchema = z.object({
  releaseNotes: z.string().max(1000).optional(),
});
export type PublishTemplateVersionRequest = z.infer<
  typeof PublishTemplateVersionSchema
>;

export const InstantiateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  versionId: z.string().optional(),
  connectionMappings: z.record(z.string()).optional(),
  inputValues: z.record(z.unknown()).optional(),
});
export type InstantiateTemplateRequest = z.infer<
  typeof InstantiateTemplateSchema
>;

export const TemplateFilterQuerySchema = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  visibility: TemplateVisibilityEnum.optional(),
  status: TemplateStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TemplateFilterQuery = z.infer<typeof TemplateFilterQuerySchema>;

export const TemplateVersionResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  versionNumber: z.number().int().positive(),
  definition: WorkflowDefinitionSchema,
  requiredConnections: z.array(z.string()).default([]),
  requiredInputs: z.record(z.unknown()).default({}),
  contentHash: z.string(),
  releaseNotes: z.string().nullable().optional(),
  publishedById: z.string().nullable().optional(),
  publishedAt: z.string().datetime(),
});
export type TemplateVersionResponse = z.infer<
  typeof TemplateVersionResponseSchema
>;

export const WorkflowTemplateResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable().optional(),
  name: z.string(),
  shortDescription: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  visibility: TemplateVisibilityEnum,
  status: TemplateStatusEnum,
  draftDefinition: WorkflowDefinitionSchema.optional(),
  requiredConnections: z.array(z.string()).default([]),
  requiredInputs: z.record(z.unknown()).default({}),
  usageCount: z.number().int().nonnegative().default(0),
  isFeatured: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  createdById: z.string().nullable().optional(),
  publishedVersionId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedVersion: TemplateVersionResponseSchema.optional(),
});
export type WorkflowTemplateResponse = z.infer<
  typeof WorkflowTemplateResponseSchema
>;

// ==========================================
// WORKFLOW COLLABORATION & TEAM PRODUCTIVITY
// ==========================================
export const CollaboratorRoleEnum = z.enum(["MAINTAINER", "EDITOR", "VIEWER"]);
export type CollaboratorRole = z.infer<typeof CollaboratorRoleEnum>;

export const WorkflowActivityTypeEnum = z.enum([
  "WORKFLOW_CREATED",
  "DRAFT_UPDATED",
  "WORKFLOW_PUBLISHED",
  "OWNERSHIP_TRANSFERRED",
  "COLLABORATOR_ADDED",
  "COLLABORATOR_REMOVED",
  "COLLABORATOR_ROLE_UPDATED",
  "COMMENT_ADDED",
  "COMMENT_RESOLVED",
  "COMMENT_DELETED",
]);
export type WorkflowActivityType = z.infer<typeof WorkflowActivityTypeEnum>;

export const AddCollaboratorSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: CollaboratorRoleEnum.default("EDITOR"),
});
export type AddCollaboratorRequest = z.infer<typeof AddCollaboratorSchema>;

export const UpdateCollaboratorSchema = z.object({
  role: CollaboratorRoleEnum,
});
export type UpdateCollaboratorRequest = z.infer<
  typeof UpdateCollaboratorSchema
>;

export const TransferWorkflowOwnershipSchema = z.object({
  newOwnerId: z.string().min(1, "New owner user ID is required"),
});
export type TransferWorkflowOwnershipRequest = z.infer<
  typeof TransferWorkflowOwnershipSchema
>;

export const CreateCommentSchema = z.object({
  content: z.string().min(1, "Comment content cannot be empty").max(5000),
  nodeId: z.string().optional(),
  parentId: z.string().optional(),
  draftRevision: z.number().int().positive().optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentSchema>;

export const UpdateCommentSchema = z.object({
  content: z.string().min(1, "Comment content cannot be empty").max(5000),
});
export type UpdateCommentRequest = z.infer<typeof UpdateCommentSchema>;

export const ResolveCommentSchema = z.object({
  isResolved: z.boolean().default(true),
});
export type ResolveCommentRequest = z.infer<typeof ResolveCommentSchema>;

export const ActivityFilterQuerySchema = z.object({
  type: WorkflowActivityTypeEnum.optional(),
  userId: z.string().optional(),
  workflowId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ActivityFilterQuery = z.infer<typeof ActivityFilterQuerySchema>;

export const WorkflowCollaboratorResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workflowId: z.string(),
  userId: z.string(),
  role: CollaboratorRoleEnum,
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkflowCollaboratorResponse = z.infer<
  typeof WorkflowCollaboratorResponseSchema
>;

export const WorkflowCommentResponseSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    organizationId: z.string(),
    workflowId: z.string(),
    userId: z.string(),
    content: z.string(),
    nodeId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    draftRevision: z.number().int().nullable().optional(),
    isResolved: z.boolean(),
    resolvedById: z.string().nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        firstName: z.string().nullable().optional(),
        lastName: z.string().nullable().optional(),
      })
      .optional(),
    author: z
      .object({
        id: z.string(),
        email: z.string(),
        firstName: z.string().nullable().optional(),
        lastName: z.string().nullable().optional(),
      })
      .optional(),
    replies: z.array(WorkflowCommentResponseSchema).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);
export type WorkflowCommentResponse = z.infer<
  typeof WorkflowCommentResponseSchema
>;

export const WorkflowActivityResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workflowId: z.string(),
  userId: z.string().nullable().optional(),
  type: WorkflowActivityTypeEnum,
  metadata: z.record(z.unknown()).default({}),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  actor: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  createdAt: z.string().datetime(),
});
export type WorkflowActivityResponse = z.infer<
  typeof WorkflowActivityResponseSchema
>;

// ==========================================
// 15. CANONICAL DOMAIN EVENTS & NOTIFICATIONS
// ==========================================

export const FlowForgeEventTypeEnum = z.enum([
  "workflow.execution.started",
  "workflow.execution.completed",
  "workflow.execution.failed",
  "workflow.execution.cancelled",
  "approval.requested",
  "approval.decided",
  "workflow.published",
  "workflow.ownership_transferred",
  "workflow.collaborator_added",
  "workflow.collaborator_removed",
  "connection.failed",
  "schedule.execution_failed",
  "workflow.execution.recovered",
  "operational.incident.created",
  "operational.incident.updated",
]);
export type FlowForgeEventType = z.infer<typeof FlowForgeEventTypeEnum>;

export const FlowForgeEventSchema = z.object({
  id: z.string(),
  type: FlowForgeEventTypeEnum,
  version: z.string().default("1.0"),
  organizationId: z.string(),
  actorId: z.string().nullable().optional(),
  resourceType: z.enum([
    "workflow",
    "execution",
    "approval",
    "connection",
    "collaborator",
    "comment",
    "system",
    "incident",
  ]),
  resourceId: z.string(),
  createdAt: z.string().datetime(),
  correlationId: z.string(),
  causationId: z.string().nullable().optional(),
  data: z.record(z.unknown()).default({}),
});
export type FlowForgeEvent = z.infer<typeof FlowForgeEventSchema>;

export const NotificationCategoryEnum = z.enum([
  "WORKFLOW",
  "APPROVAL",
  "COLLABORATION",
  "SYSTEM",
  "SECURITY",
]);
export type NotificationCategory = z.infer<typeof NotificationCategoryEnum>;

export const NotificationPriorityEnum = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);
export type NotificationPriority = z.infer<typeof NotificationPriorityEnum>;

export const NotificationResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  eventId: z.string().nullable().optional(),
  title: z.string(),
  message: z.string(),
  category: NotificationCategoryEnum,
  priority: NotificationPriorityEnum,
  isRead: z.boolean(),
  readAt: z.string().datetime().nullable().optional(),
  resourceType: z.string().nullable().optional(),
  resourceId: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;

export const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  isRead: z
    .preprocess((val) => {
      if (val === "true" || val === true) return true;
      if (val === "false" || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
  category: NotificationCategoryEnum.optional(),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

export const UpdateNotificationReadSchema = z.object({
  isRead: z.boolean().default(true),
});
export type UpdateNotificationReadRequest = z.infer<
  typeof UpdateNotificationReadSchema
>;

export const NotificationPreferenceItemSchema = z.object({
  category: NotificationCategoryEnum,
  inApp: z.boolean(),
  email: z.boolean(),
});
export type NotificationPreferenceItem = z.infer<
  typeof NotificationPreferenceItemSchema
>;

export const UpdateNotificationPreferencesSchema = z.object({
  preferences: z.array(NotificationPreferenceItemSchema),
});
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesSchema
>;

// Outbound Webhook Subscriptions & Delivery
export const WebhookDeliveryStatusEnum = z.enum([
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "DELIVERED",
  "RETRY_SCHEDULED",
  "FAILED_PERMANENTLY",
  "DEAD_LETTERED",
]);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusEnum>;

export const CreateWebhookSubscriptionSchema = z.object({
  name: z.string().min(1, "Subscription name is required").max(100),
  url: z.string().url("Valid HTTP(S) URL is required"),
  events: z
    .array(z.string())
    .min(1, "At least one event type or '*' is required"),
  enabled: z.boolean().default(true),
  secret: z.string().min(16).max(128).optional(),
});
export type CreateWebhookSubscriptionRequest = z.infer<
  typeof CreateWebhookSubscriptionSchema
>;

export const UpdateWebhookSubscriptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookSubscriptionRequest = z.infer<
  typeof UpdateWebhookSubscriptionSchema
>;

export const WebhookSubscriptionResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WebhookSubscriptionResponse = z.infer<
  typeof WebhookSubscriptionResponseSchema
>;

export const WebhookDeliveryResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  subscriptionId: z.string(),
  eventId: z.string(),
  url: z.string(),
  status: WebhookDeliveryStatusEnum,
  attemptCount: z.number(),
  maxAttempts: z.number(),
  nextRetryAt: z.string().datetime().nullable().optional(),
  statusCode: z.number().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
});
export type WebhookDeliveryResponse = z.infer<
  typeof WebhookDeliveryResponseSchema
>;

// ==========================================
// WORKFLOW PORTABILITY, IMPORT & EXPORT
// ==========================================

export const ConflictStrategyEnum = z.enum([
  "CREATE_NEW",
  "RENAME",
  "REPLACE_DRAFT",
]);
export type ConflictStrategy = z.infer<typeof ConflictStrategyEnum>;

export const CompatibilityStatusEnum = z.enum([
  "COMPATIBLE",
  "COMPATIBLE_WITH_WARNINGS",
  "REQUIRES_MAPPING",
  "UNSUPPORTED",
  "INVALID_PACKAGE",
]);
export type CompatibilityStatus = z.infer<typeof CompatibilityStatusEnum>;

export const FlowForgePackageMetadataSchema = z.object({
  name: z.string().min(1, "Workflow name is required").max(100),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).default([]),
  sourceWorkflowId: z.string().optional(),
  sourceRevision: z.number().int().nonnegative().optional(),
  sourceVersionNumber: z.number().int().nonnegative().optional(),
  sourceAppVersion: z.string().default("1.0.0"),
  exportedAt: z.string().datetime(),
});
export type FlowForgePackageMetadata = z.infer<
  typeof FlowForgePackageMetadataSchema
>;

export const WorkflowDependencyManifestSchema = z.object({
  nodeTypes: z.array(z.string()).default([]),
  connectors: z
    .array(
      z.object({
        connectorId: z.string(),
        operationIds: z.array(z.string()).default([]),
        sourceConnectionId: z.string().optional(),
      }),
    )
    .default([]),
  triggers: z
    .array(
      z.object({
        type: TriggerTypeEnum,
        cronExpression: z.string().optional(),
        webhookPath: z.string().optional(),
      }),
    )
    .default([]),
  environmentVariables: z.array(z.string()).default([]),
});
export type WorkflowDependencyManifest = z.infer<
  typeof WorkflowDependencyManifestSchema
>;

export const FlowForgePackageIntegritySchema = z.object({
  algorithm: z.enum(["sha256"]).default("sha256"),
  hash: z.string().min(64).max(64),
});
export type FlowForgePackageIntegrity = z.infer<
  typeof FlowForgePackageIntegritySchema
>;

export const FlowForgeWorkflowPackageSchema = z.object({
  formatVersion: z.literal("flowforge.package/v1"),
  metadata: FlowForgePackageMetadataSchema,
  definition: WorkflowDefinitionSchema,
  dependencies: WorkflowDependencyManifestSchema,
  integrity: FlowForgePackageIntegritySchema,
});
export type FlowForgeWorkflowPackage = z.infer<
  typeof FlowForgeWorkflowPackageSchema
>;

export const FlowForgeBackupPackageSchema = z.object({
  formatVersion: z.literal("flowforge.backup/v1"),
  exportedAt: z.string().datetime(),
  sourceOrganizationId: z.string().optional(),
  workflows: z.array(FlowForgeWorkflowPackageSchema),
  integrity: FlowForgePackageIntegritySchema,
});
export type FlowForgeBackupPackage = z.infer<
  typeof FlowForgeBackupPackageSchema
>;

export const ImportPreviewResponseSchema = z.object({
  workflowName: z.string(),
  description: z.string().optional(),
  packageFormatVersion: z.string(),
  sourceAppVersion: z.string().optional(),
  status: CompatibilityStatusEnum,
  canImport: z.boolean(),
  summary: z.string(),
  integrityVerified: z.boolean(),
  nodeSummary: z.object({
    totalNodes: z.number().int().nonnegative(),
    nodeTypes: z.array(z.string()),
    unsupportedNodeTypes: z.array(z.string()),
  }),
  connectorRequirements: z.array(
    z.object({
      connectorId: z.string(),
      supportedByRegistry: z.boolean(),
      sourceConnectionId: z.string().optional(),
      matchingOrgConnections: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        }),
      ),
      isResolved: z.boolean(),
    }),
  ),
  conflict: z.object({
    hasConflict: z.boolean(),
    conflictingWorkflowId: z.string().optional(),
    conflictingWorkflowName: z.string().optional(),
    currentDraftRevision: z.number().int().optional(),
  }),
  suggestedName: z.string(),
  availableConflictStrategies: z.array(ConflictStrategyEnum),
  warnings: z.array(z.string()),
  blockingErrors: z.array(z.string()),
  validationErrors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

export const ConfirmImportWorkflowSchema = z
  .object({
    package: FlowForgeWorkflowPackageSchema,
    conflictStrategy: ConflictStrategyEnum.optional(),
    strategy: ConflictStrategyEnum.optional(),
    targetWorkflowName: z.string().min(1).max(100).optional(),
    targetWorkflowId: z.string().optional(),
    connectorMappings: z.record(z.string()).default({}),
    environmentVariables: z.record(z.string()).default({}),
  })
  .transform((data) => ({
    ...data,
    conflictStrategy: data.conflictStrategy || data.strategy || "CREATE_NEW",
  }));
export type ConfirmImportWorkflowRequest = z.infer<
  typeof ConfirmImportWorkflowSchema
>;

export const WorkflowImportProvenanceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workflowId: z.string(),
  sourceWorkflowId: z.string().nullable().optional(),
  sourceRevision: z.number().int().nullable().optional(),
  packageHash: z.string(),
  packageFormatVersion: z.string(),
  conflictStrategy: ConflictStrategyEnum,
  strategy: ConflictStrategyEnum.optional(),
  connectorMappings: z.record(z.string()).default({}),
  compatibilityStatus: CompatibilityStatusEnum,
  importedById: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type WorkflowImportProvenance = z.infer<
  typeof WorkflowImportProvenanceSchema
>;

// ============================================================================
// Production Observability, Error Taxonomy & Incident Management (Prompt 20)
// ============================================================================

export const StructuredLogLevelEnum = z.enum([
  "debug",
  "info",
  "warn",
  "error",
]);
export type StructuredLogLevel = z.infer<typeof StructuredLogLevelEnum>;

export interface StructuredLogEntry {
  timestamp: string;
  level: StructuredLogLevel;
  service: string;
  environment: string;
  correlationId?: string;
  organizationId?: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  jobId?: string;
  eventType?: string;
  message: string;
  durationMs?: number;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

const LOG_SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /auth/i,
  /credential/i,
  /cookie/i,
];

export function sanitizeLogValue(val: unknown): unknown {
  if (typeof val === "string") {
    let sanitized = val.replace(
      /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
      "Bearer [REDACTED]",
    );
    sanitized = sanitized.replace(
      /Basic\s+[A-Za-z0-9+/=]+/gi,
      "Basic [REDACTED]",
    );
    return sanitized;
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (LOG_SENSITIVE_PATTERNS.some((p) => p.test(k))) {
        res[k] = "[REDACTED]";
      } else {
        res[k] = sanitizeLogValue(v);
      }
    }
    return res;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogValue(item));
  }
  return val;
}

export class StructuredLogger {
  constructor(
    public readonly service: string,
    private defaultContext: Partial<StructuredLogEntry> = {},
  ) {}

  public formatEntry(
    level: StructuredLogLevel,
    message: string,
    extra: Partial<StructuredLogEntry> = {},
  ): StructuredLogEntry {
    const env = process.env.NODE_ENV || "development";
    const sanitizedExtra = sanitizeLogValue(
      extra,
    ) as Partial<StructuredLogEntry>;

    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: env,
      ...this.defaultContext,
      ...sanitizedExtra,
      message: sanitizeLogValue(message) as string,
    };
  }

  public info(
    message: string,
    extra?: Partial<StructuredLogEntry>,
  ): StructuredLogEntry {
    const entry = this.formatEntry("info", message, extra);
    if (process.env.NODE_ENV !== "test") {
      console.log(JSON.stringify(entry));
    }
    return entry;
  }

  public warn(
    message: string,
    extra?: Partial<StructuredLogEntry>,
  ): StructuredLogEntry {
    const entry = this.formatEntry("warn", message, extra);
    if (process.env.NODE_ENV !== "test") {
      console.warn(JSON.stringify(entry));
    }
    return entry;
  }

  public error(
    message: string,
    error?: unknown,
    extra?: Partial<StructuredLogEntry>,
  ): StructuredLogEntry {
    const errObj =
      error instanceof Error
        ? {
            code: (error as any).code || "INTERNAL_ERROR",
            message: error.message,
            stack:
              process.env.NODE_ENV === "development" ? error.stack : undefined,
          }
        : error
          ? { message: String(error) }
          : undefined;

    const entry = this.formatEntry("error", message, {
      ...extra,
      error: errObj,
    });
    if (process.env.NODE_ENV !== "test") {
      console.error(JSON.stringify(entry));
    }
    return entry;
  }

  public debug(
    message: string,
    extra?: Partial<StructuredLogEntry>,
  ): StructuredLogEntry {
    const entry = this.formatEntry("debug", message, extra);
    if (process.env.NODE_ENV !== "test" && process.env.LOG_LEVEL === "debug") {
      console.debug(JSON.stringify(entry));
    }
    return entry;
  }
}

export function createStructuredLogger(
  service: string,
  context?: Partial<StructuredLogEntry>,
): StructuredLogger {
  return new StructuredLogger(service, context);
}

// ----------------------------------------------------------------------------
// Error Taxonomy
// ----------------------------------------------------------------------------
export const ErrorTaxonomyEnum = z.enum([
  "VALIDATION_ERROR",
  "AUTH_ERROR",
  "AUTHORIZATION_ERROR",
  "TENANT_ISOLATION_ERROR",
  "BUSINESS_RULE_ERROR",
  "CONNECTOR_ERROR",
  "HTTP_TIMEOUT",
  "RATE_LIMIT_ERROR",
  "DATABASE_ERROR",
  "QUEUE_ERROR",
  "WORKER_CRASH",
  "CONFIG_ERROR",
  "MIGRATION_ERROR",
  "INTERNAL_ERROR",
]);
export type ErrorTaxonomyCode = z.infer<typeof ErrorTaxonomyEnum>;

export function isRetryableError(code: ErrorTaxonomyCode | string): boolean {
  return [
    "HTTP_TIMEOUT",
    "RATE_LIMIT_ERROR",
    "DATABASE_ERROR",
    "QUEUE_ERROR",
    "WORKER_CRASH",
  ].includes(code as ErrorTaxonomyCode);
}

// ----------------------------------------------------------------------------
// Incident Management Models & Schemas
// ----------------------------------------------------------------------------
export const IncidentSeverityEnum = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type IncidentSeverity = z.infer<typeof IncidentSeverityEnum>;

export const IncidentStatusEnum = z.enum([
  "OPEN",
  "INVESTIGATING",
  "MITIGATED",
  "RESOLVED",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusEnum>;

export interface OperationalIncidentRecord {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedService: string;
  workflowId?: string;
  fingerprint?: string;
  occurrenceCount: number;
  correlationIds: string[];
  firstObservedAt: Date;
  lastObservedAt: Date;
  assignedToId?: string;
  resolutionSummary?: string;
  resolvedAt?: Date;
  resolvedById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateIncidentSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5).max(2000),
  severity: IncidentSeverityEnum.default("MEDIUM"),
  affectedService: z.string().min(2).max(100),
  workflowId: z.string().optional(),
  fingerprint: z.string().optional(),
  correlationId: z.string().optional(),
});
export type CreateIncidentRequest = z.infer<typeof CreateIncidentSchema>;

export const UpdateIncidentSchema = z.object({
  status: IncidentStatusEnum.optional(),
  severity: IncidentSeverityEnum.optional(),
  assignedToId: z.string().optional(),
  resolutionSummary: z.string().max(2000).optional(),
});
export type UpdateIncidentRequest = z.infer<typeof UpdateIncidentSchema>;

// ==========================================
// SAAS BILLING, SUBSCRIPTIONS & METERING
// ==========================================
export const PlanBillingIntervalEnum = z.enum(["MONTHLY", "YEARLY"]);
export type PlanBillingInterval = z.infer<typeof PlanBillingIntervalEnum>;

export const PlanStatusEnum = z.enum(["ACTIVE", "ARCHIVED"]);
export type PlanStatus = z.infer<typeof PlanStatusEnum>;

export const SubscriptionStatusEnum = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

export const InvoiceStatusEnum = z.enum([
  "DRAFT",
  "OPEN",
  "PAID",
  "VOID",
  "UNCOLLECTIBLE",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const BillingWebhookStatusEnum = z.enum([
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
]);
export type BillingWebhookStatus = z.infer<typeof BillingWebhookStatusEnum>;

export const PlanEntitlementsSchema = z.object({
  maxSeats: z.number().int(), // -1 = unlimited
  maxWorkflows: z.number().int(),
  maxActiveWorkflows: z.number().int(),
  maxMonthlyExecutions: z.number().int(),
  maxConcurrentExecutions: z.number().int(),
  maxConnectors: z.number().int(),
  maxWorkspaces: z.number().int().default(1),
  retentionDays: z.number().int(),
  hasAnalytics: z.boolean(),
  hasGovernance: z.boolean(),
  hasCustomConnectors: z.boolean(),
  hasSso: z.boolean(),
  hasPrioritySupport: z.boolean(),
  hasWhiteLabel: z.boolean().default(false),
  hasCustomDomains: z.boolean().default(false),
});
export type PlanEntitlements = z.infer<typeof PlanEntitlementsSchema>;

export interface PlanRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  billingInterval: PlanBillingInterval;
  priceCents: number;
  currency: string;
  trialDays: number;
  status: PlanStatus;
  entitlements: PlanEntitlements;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  planId: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  status: SubscriptionStatus;
  billingInterval: PlanBillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  gracePeriodEnd?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  subscriptionId?: string;
  metric:
    | "WORKFLOW_EXECUTION"
    | "CONNECTOR_INVOCATION"
    | "API_REQUEST"
    | "AI_REQUEST"
    | "AI_TOKEN";
  quantity: number;
  idempotencyKey?: string;
  periodStart: Date;
  periodEnd: Date;
  metadata?: Record<string, unknown>;
  recordedAt: Date;
}

export interface InvoiceRecord {
  id: string;
  organizationId: string;
  subscriptionId?: string;
  providerInvoiceId?: string;
  invoiceNumber: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  invoicePdfUrl?: string;
  hostedInvoiceUrl?: string;
  issuedAt: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingWebhookEventRecord {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: BillingWebhookStatus;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
}

export const DEFAULT_PLANS: Record<string, PlanRecord> = {
  free: {
    id: "plan_free",
    slug: "free",
    name: "Free",
    description:
      "For individuals and small teams exploring workflow automation",
    billingInterval: "MONTHLY",
    priceCents: 0,
    currency: "USD",
    trialDays: 0,
    status: "ACTIVE",
    entitlements: {
      maxSeats: 50,
      maxWorkflows: 100,
      maxActiveWorkflows: 50,
      maxMonthlyExecutions: 10000,
      maxConcurrentExecutions: 50,
      maxConnectors: 50,
      maxWorkspaces: 1,
      retentionDays: 30,
      hasAnalytics: true,
      hasGovernance: true,
      hasCustomConnectors: true,
      hasSso: false,
      hasPrioritySupport: false,
      hasWhiteLabel: false,
      hasCustomDomains: false,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  starter: {
    id: "plan_starter",
    slug: "starter",
    name: "Starter",
    description: "For growing teams needing higher execution capacity",
    billingInterval: "MONTHLY",
    priceCents: 2900,
    currency: "USD",
    trialDays: 14,
    status: "ACTIVE",
    entitlements: {
      maxSeats: 5,
      maxWorkflows: 25,
      maxActiveWorkflows: 10,
      maxMonthlyExecutions: 5000,
      maxConcurrentExecutions: 5,
      maxConnectors: 5,
      maxWorkspaces: 3,
      retentionDays: 30,
      hasAnalytics: true,
      hasGovernance: false,
      hasCustomConnectors: false,
      hasSso: false,
      hasPrioritySupport: false,
      hasWhiteLabel: false,
      hasCustomDomains: false,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  pro: {
    id: "plan_pro",
    slug: "pro",
    name: "Pro",
    description: "Advanced automation, governance, and high throughput",
    billingInterval: "MONTHLY",
    priceCents: 9900,
    currency: "USD",
    trialDays: 14,
    status: "ACTIVE",
    entitlements: {
      maxSeats: 20,
      maxWorkflows: 100,
      maxActiveWorkflows: 50,
      maxMonthlyExecutions: 50000,
      maxConcurrentExecutions: 15,
      maxConnectors: 20,
      maxWorkspaces: 10,
      retentionDays: 90,
      hasAnalytics: true,
      hasGovernance: true,
      hasCustomConnectors: true,
      hasSso: false,
      hasPrioritySupport: true,
      hasWhiteLabel: true,
      hasCustomDomains: false,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  enterprise: {
    id: "plan_enterprise",
    slug: "enterprise",
    name: "Enterprise",
    description:
      "Unlimited scale, dedicated support, SSO, and 365-day retention",
    billingInterval: "MONTHLY",
    priceCents: 29900,
    currency: "USD",
    trialDays: 30,
    status: "ACTIVE",
    entitlements: {
      maxSeats: -1,
      maxWorkflows: -1,
      maxActiveWorkflows: -1,
      maxMonthlyExecutions: 500000,
      maxConcurrentExecutions: 50,
      maxConnectors: -1,
      maxWorkspaces: -1,
      retentionDays: 365,
      hasAnalytics: true,
      hasGovernance: true,
      hasCustomConnectors: true,
      hasSso: true,
      hasPrioritySupport: true,
      hasWhiteLabel: true,
      hasCustomDomains: true,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
};

export const CreateCheckoutSchema = z.object({
  planSlug: z.string().min(1),
  billingInterval: PlanBillingIntervalEnum.default("MONTHLY"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutSchema>;

export const CreatePortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});
export type CreatePortalRequest = z.infer<typeof CreatePortalSchema>;

export const UpgradeSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
  billingInterval: PlanBillingIntervalEnum.default("MONTHLY"),
});
export type UpgradeSubscriptionRequest = z.infer<
  typeof UpgradeSubscriptionSchema
>;

export const CancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});
export type CancelSubscriptionRequest = z.infer<
  typeof CancelSubscriptionSchema
>;

// ==========================================
// ENTERPRISE WORKSPACES, WHITE-LABELING & CUSTOM DOMAINS
// ==========================================

export const WorkspaceStatusEnum = z.enum(["ACTIVE", "ARCHIVED"]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusEnum>;

export const WorkspaceRoleEnum = z.enum([
  "ADMIN",
  "EDITOR",
  "OPERATOR",
  "VIEWER",
]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleEnum>;

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  status: WorkspaceStatus;
  isDefault: boolean;
  timezone: string;
  brandingOverrides?: Record<string, unknown>;
  createdById?: string;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase alphanumeric characters and hyphens",
    ),
  description: z.string().max(500).optional(),
  timezone: z.string().default("UTC"),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceSchema>;

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  timezone: z.string().optional(),
  brandingOverrides: z.record(z.unknown()).optional(),
});
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceSchema>;

export const AddWorkspaceMemberSchema = z.object({
  userId: z.string().min(1),
  role: WorkspaceRoleEnum.default("EDITOR"),
});
export type AddWorkspaceMemberRequest = z.infer<
  typeof AddWorkspaceMemberSchema
>;

// ----------------------------------------------------------------------------
// White-Label Branding Models & Schemas
// ----------------------------------------------------------------------------
const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export const OrganizationBrandingSchema = z.object({
  productName: z.string().min(1).max(100).default("FlowForge"),
  companyName: z.string().max(100).optional(),
  logoUrl: z.string().url().max(1000).optional().or(z.literal("")),
  faviconUrl: z.string().url().max(1000).optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(hexColorRegex, "Invalid hex color format (e.g. #4F46E5)")
    .default("#0d9488"),
  secondaryColor: z
    .string()
    .regex(hexColorRegex, "Invalid hex color format")
    .default("#0f172a"),
  accentColor: z
    .string()
    .regex(hexColorRegex, "Invalid hex color format")
    .default("#14b8a6"),
  supportEmail: z.string().email().optional().or(z.literal("")),
  documentationUrl: z.string().url().optional().or(z.literal("")),
  customFooterText: z.string().max(300).optional(),
  loginMessage: z.string().max(500).optional(),
  emailSenderName: z.string().max(100).optional(),
  emailSenderAddress: z.string().email().optional().or(z.literal("")),
});
export type OrganizationBrandingRequest = z.infer<
  typeof OrganizationBrandingSchema
>;

export interface OrganizationBrandingRecord {
  id: string;
  organizationId: string;
  productName: string;
  companyName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail?: string;
  documentationUrl?: string;
  customFooterText?: string;
  loginMessage?: string;
  emailSenderName?: string;
  emailSenderAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// Custom Domain Models & Schemas
// ----------------------------------------------------------------------------
export const DomainVerificationStatusEnum = z.enum([
  "PENDING",
  "VERIFIED",
  "FAILED",
]);
export type DomainVerificationStatus = z.infer<
  typeof DomainVerificationStatusEnum
>;

export const DomainSslStatusEnum = z.enum(["PENDING", "ACTIVE", "FAILED"]);
export type DomainSslStatus = z.infer<typeof DomainSslStatusEnum>;

const domainRegex =
  /^(?!:\/\/)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const RegisterCustomDomainSchema = z.object({
  domain: z
    .string()
    .min(4)
    .max(253)
    .toLowerCase()
    .regex(domainRegex, "Invalid fully qualified domain name (FQDN)"),
});
export type RegisterCustomDomainRequest = z.infer<
  typeof RegisterCustomDomainSchema
>;

export interface CustomDomainRecord {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verificationStatus: DomainVerificationStatus;
  sslStatus: DomainSslStatus;
  verifiedAt?: Date;
  lastCheckedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// Enterprise Licensing & Overrides
// ----------------------------------------------------------------------------
export const LicenseStatusEnum = z.enum(["ACTIVE", "SUSPENDED", "EXPIRED"]);
export type LicenseStatus = z.infer<typeof LicenseStatusEnum>;

export const ApplyEnterpriseLicenseSchema = z.object({
  licenseKey: z.string().min(10).max(100),
  issuedTo: z.string().min(2).max(200),
  edition: z.string().min(2).max(100).default("Enterprise Ultimate"),
  customEntitlements: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type ApplyEnterpriseLicenseRequest = z.infer<
  typeof ApplyEnterpriseLicenseSchema
>;

export interface EnterpriseLicenseRecord {
  id: string;
  organizationId: string;
  licenseKey: string;
  issuedTo: string;
  edition: string;
  customEntitlements: Record<string, unknown>;
  status: LicenseStatus;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// ENTERPRISE SSO, SAML, OIDC, SCIM & IDENTITY GOVERNANCE
// ==========================================

export const SsoProtocolEnum = z.enum(["OIDC", "SAML"]);
export type SsoProtocol = z.infer<typeof SsoProtocolEnum>;

export const SsoEnforcementModeEnum = z.enum([
  "OPTIONAL",
  "ENFORCED",
  "STRICT",
]);
export type SsoEnforcementMode = z.infer<typeof SsoEnforcementModeEnum>;

export const ProvisioningSourceEnum = z.enum([
  "LOCAL",
  "SSO",
  "SCIM",
  "INVITATION",
]);
export type ProvisioningSource = z.infer<typeof ProvisioningSourceEnum>;

export const ConfigureSsoSchema = z.object({
  name: z.string().min(2).max(100),
  protocol: SsoProtocolEnum,
  enabled: z.boolean().default(true),
  enforcementMode: SsoEnforcementModeEnum.default("OPTIONAL"),
  bypassUserIds: z.array(z.string()).default([]),
  allowIdpInitiated: z.boolean().default(false),
  defaultRole: RoleEnum.default("MEMBER"),

  // OIDC Specific
  issuerUrl: z.string().url().optional(),
  clientId: z.string().min(1).max(256).optional(),
  clientSecret: z.string().min(1).max(512).optional(),
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  userInfoUrl: z.string().url().optional(),
  scopes: z.array(z.string()).default(["openid", "profile", "email"]),

  // SAML Specific
  entityId: z.string().min(2).max(500).optional(),
  signOnUrl: z.string().url().optional(),
  signingCertificate: z.string().min(10).optional(),
  spEntityId: z.string().min(2).max(500).optional(),
  acsUrl: z.string().url().optional(),
  attributeMapping: z.record(z.string()).default({}),
});
export type ConfigureSsoRequest = z.infer<typeof ConfigureSsoSchema>;

export interface SsoConfigurationRecord {
  id: string;
  organizationId: string;
  name: string;
  protocol: SsoProtocol;
  enabled: boolean;
  enforcementMode: SsoEnforcementMode;
  bypassUserIds: string[];
  allowIdpInitiated: boolean;
  defaultRole: Role;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scopes: string[];
  entityId?: string;
  signOnUrl?: string;
  signingCertificate?: string;
  spEntityId?: string;
  acsUrl?: string;
  attributeMapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalIdentityRecord {
  id: string;
  organizationId: string;
  userId: string;
  providerId: string;
  protocol: SsoProtocol;
  externalSubject: string;
  externalIssuer: string;
  email: string;
  provisioningSource: ProvisioningSource;
  claims: Record<string, unknown>;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const GroupRoleMappingSchema = z.object({
  externalGroupName: z.string().min(1).max(200),
  targetRole: RoleEnum.refine((r) => r !== "OWNER", {
    message: "Directory groups cannot grant OWNER privileges.",
  }),
  workspaceMappings: z
    .array(
      z.object({
        workspaceId: z.string().min(1),
        role: WorkspaceRoleEnum,
      }),
    )
    .default([]),
});
export type GroupRoleMappingRequest = z.infer<typeof GroupRoleMappingSchema>;

export interface GroupRoleMappingRecord {
  id: string;
  organizationId: string;
  ssoConfigurationId: string;
  externalGroupName: string;
  targetRole: Role;
  workspaceMappings: Array<{ workspaceId: string; role: WorkspaceRole }>;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateScimTokenSchema = z.object({
  name: z.string().min(2).max(100),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});
export type CreateScimTokenRequest = z.infer<typeof CreateScimTokenSchema>;

export interface ScimTokenRecord {
  id: string;
  organizationId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

export const ScimUserSchema = z.object({
  schemas: z
    .array(z.string())
    .default(["urn:ietf:params:scim:schemas:core:2.0:User"]),
  userName: z.string().email(),
  name: z
    .object({
      formatted: z.string().optional(),
      familyName: z.string().optional(),
      givenName: z.string().optional(),
    })
    .optional(),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        primary: z.boolean().optional(),
      }),
    )
    .optional(),
  active: z.boolean().default(true),
  externalId: z.string().optional(),
});
export type ScimUserRequest = z.infer<typeof ScimUserSchema>;

export const ScimPatchOpSchema = z.object({
  schemas: z
    .array(z.string())
    .default(["urn:ietf:params:scim:api:messages:2.0:PatchOp"]),
  Operations: z.array(
    z.object({
      op: z.enum(["add", "replace", "remove", "Add", "Replace", "Remove"]),
      path: z.string().optional(),
      value: z.unknown(),
    }),
  ),
});
export type ScimPatchOpRequest = z.infer<typeof ScimPatchOpSchema>;

// ==========================================
// Enterprise API Platform & OAuth 2.0 (Prompt 25)
// ==========================================

export const CreateOAuthClientSchema = z.object({
  name: z.string().min(1, "Client name is required").max(100),
  scopes: z.array(z.string()).min(1, "At least one scope is required"),
  workspaceId: z.string().optional(),
});
export type CreateOAuthClientRequest = z.infer<typeof CreateOAuthClientSchema>;

export const UpdateOAuthClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateOAuthClientRequest = z.infer<typeof UpdateOAuthClientSchema>;

export const OAuthTokenRequestSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  scope: z.string().optional(),
});
export type OAuthTokenRequest = z.infer<typeof OAuthTokenRequestSchema>;

export interface OAuthClientRecord {
  id: string;
  organizationId: string;
  workspaceId?: string;
  name: string;
  clientId: string;
  clientSecretHash: string;
  scopes: string[];
  enabled: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export interface IdempotencyRecord {
  id: string;
  organizationId: string;
  principalId: string;
  idempotencyKey: string;
  requestMethod: string;
  requestPath: string;
  requestHash: string;
  responseStatus?: number;
  responseBody?: any;
  responseHeaders?: Record<string, string>;
  expiresAt: Date;
  createdAt: Date;
}

// ==========================================
// ENTERPRISE COMPLIANCE, RETENTION & PRIVACY
// ==========================================

export const DataClassificationEnum = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
]);
export type DataClassification = z.infer<typeof DataClassificationEnum>;

export const RetentionCategoryEnum = z.enum([
  "AUDIT_LOGS",
  "WORKFLOW_EXECUTIONS",
  "EXECUTION_LOGS",
  "WORKFLOW_VERSIONS",
  "WEBHOOK_DELIVERIES",
  "NOTIFICATION_DELIVERIES",
  "EXPORTS_TEMPORARY",
  "PRIVACY_REQUESTS",
]);
export type RetentionCategory = z.infer<typeof RetentionCategoryEnum>;

export const LegalHoldTargetTypeEnum = z.enum([
  "ORGANIZATION",
  "USER",
  "WORKFLOW",
  "CATEGORY",
]);
export type LegalHoldTargetType = z.infer<typeof LegalHoldTargetTypeEnum>;

export const PrivacyRequestTypeEnum = z.enum([
  "ACCESS",
  "EXPORT",
  "CORRECTION",
  "DELETION",
  "RESTRICTION",
]);
export type PrivacyRequestType = z.infer<typeof PrivacyRequestTypeEnum>;

export const PrivacyRequestStatusEnum = z.enum([
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);
export type PrivacyRequestStatus = z.infer<typeof PrivacyRequestStatusEnum>;

export const RetentionPolicyInputSchema = z.object({
  category: RetentionCategoryEnum,
  retentionDays: z
    .number()
    .int()
    .min(1, "Retention days must be at least 1")
    .max(2555, "Retention days cannot exceed 7 years (2555 days)"),
  enabled: z.boolean().default(true),
  legalHoldExempt: z.boolean().default(false),
});
export type RetentionPolicyInput = z.infer<typeof RetentionPolicyInputSchema>;

export const CreateLegalHoldSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  description: z.string().max(500).optional(),
  reason: z.string().min(1, "Preservation reason is required").max(500),
  targetType: LegalHoldTargetTypeEnum.default("ORGANIZATION"),
  targetId: z.string().optional(),
  categories: z
    .array(RetentionCategoryEnum)
    .min(1, "At least one data category must be selected"),
});
export type CreateLegalHoldInput = z.infer<typeof CreateLegalHoldSchema>;

export const ReleaseLegalHoldSchema = z.object({
  releaseReason: z.string().min(1, "Release reason is required").max(500),
});
export type ReleaseLegalHoldInput = z.infer<typeof ReleaseLegalHoldSchema>;

export const CreatePrivacyRequestSchema = z.object({
  userId: z.string().optional(),
  requestType: PrivacyRequestTypeEnum,
  details: z.record(z.unknown()).optional(),
});
export type CreatePrivacyRequestInput = z.infer<
  typeof CreatePrivacyRequestSchema
>;

export const ReviewPrivacyRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(500).optional(),
});
export type ReviewPrivacyRequestInput = z.infer<
  typeof ReviewPrivacyRequestSchema
>;

export const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  actorId: z.string().optional(),
  actorType: z.enum(["USER", "API_KEY", "OAUTH_CLIENT", "SYSTEM"]).optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  correlationId: z.string().optional(),
  workspaceId: z.string().optional(),
});
export type AuditQueryInput = z.infer<typeof AuditQuerySchema>;

export const AuditExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});
export type AuditExportQueryInput = z.infer<typeof AuditExportQuerySchema>;

export interface RetentionPolicyRecord {
  id: string;
  organizationId: string;
  category: string;
  retentionDays: number;
  enabled: boolean;
  legalHoldExempt: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionJobRecord {
  id: string;
  organizationId: string;
  category?: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  recordsEvaluated: number;
  recordsPurged: number;
  bytesReclaimed?: number | bigint;
  errorDetails?: string;
  dryRun: boolean;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface PrivacyRequestRecord {
  id: string;
  organizationId: string;
  userId: string;
  requestType: "ACCESS" | "EXPORT" | "CORRECTION" | "DELETION" | "RESTRICTION";
  status:
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED";
  reviewedById?: string;
  reviewNote?: string;
  details?: Record<string, unknown>;
  outcomeSummary?: string;
  artifactUrl?: string;
  artifactExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegalHoldRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  reason: string;
  targetType: "ORGANIZATION" | "USER" | "WORKFLOW" | "CATEGORY";
  targetId?: string;
  categories: string[];
  status: "ACTIVE" | "RELEASED";
  createdById: string;
  releasedById?: string;
  releasedAt?: Date;
  releaseReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceControlItem {
  id: string;
  framework: "SOC2" | "ISO27001" | "GDPR" | "HIPAA";
  title: string;
  description: string;
  status: "IMPLEMENTED" | "PARTIAL" | "EXTERNAL_DEPENDENCY" | "PLANNED";
  evidence: string;
  verifiedAt: string;
}

// ==========================================
// AI WORKFLOW COPILOT & INTELLIGENT AUTOMATION
// ==========================================

export const AiProviderEnum = z.enum([
  "MOCK",
  "OPENAI",
  "GEMINI",
  "ANTHROPIC",
  "CUSTOM",
]);
export type AiProvider = z.infer<typeof AiProviderEnum>;

export const UpdateAiConfigSchema = z.object({
  provider: AiProviderEnum.default("MOCK"),
  model: z.string().min(1).max(100).default("flowforge-copilot-v1"),
  apiKey: z.string().max(500).optional(),
  endpointUrl: z.string().url().optional().or(z.literal("")),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(100).max(16384).default(2048),
  timeoutSeconds: z.number().int().min(1).max(120).default(30),
  enabled: z.boolean().default(true),
  monthlyTokenBudget: z.number().int().min(1000).default(500000),
  allowedRoles: z.array(RoleEnum).default(["OWNER", "ADMIN", "MEMBER"]),
});
export type UpdateAiConfigRequest = z.infer<typeof UpdateAiConfigSchema>;

export const GenerateWorkflowSchema = z.object({
  prompt: z
    .string()
    .min(5, "Prompt must be at least 5 characters")
    .max(2000, "Prompt must not exceed 2000 characters"),
  workspaceId: z.string().optional(),
  targetName: z.string().max(100).optional(),
});
export type GenerateWorkflowRequest = z.infer<typeof GenerateWorkflowSchema>;

export const EditWorkflowSchema = z.object({
  instruction: z
    .string()
    .min(5, "Instruction must be at least 5 characters")
    .max(2000, "Instruction must not exceed 2000 characters"),
  currentDefinition: WorkflowDefinitionSchema,
  workflowId: z.string().optional(),
  baseHash: z.string().optional(),
});
export type EditWorkflowRequest = z.infer<typeof EditWorkflowSchema>;

export const ExplainWorkflowSchema = z
  .object({
    definition: WorkflowDefinitionSchema.optional(),
    workflowId: z.string().optional(),
  })
  .refine(
    (data) => data.definition !== undefined || data.workflowId !== undefined,
    {
      message: "Either definition or workflowId must be provided",
    },
  );
export type ExplainWorkflowRequest = z.infer<typeof ExplainWorkflowSchema>;

export const AnalyzeFailureSchema = z.object({
  executionId: z.string().min(1, "Execution ID is required"),
});
export type AnalyzeFailureRequest = z.infer<typeof AnalyzeFailureSchema>;

export const AssistExpressionSchema = z.object({
  goal: z
    .string()
    .min(3, "Goal must be at least 3 characters")
    .max(500, "Goal must not exceed 500 characters"),
  sourceSchema: z.record(z.unknown()).optional(),
  targetField: z.string().max(100).optional(),
});
export type AssistExpressionRequest = z.infer<typeof AssistExpressionSchema>;

export interface AiConfigurationRecord {
  id: string;
  organizationId: string;
  provider: "MOCK" | "OPENAI" | "GEMINI" | "ANTHROPIC" | "CUSTOM";
  model: string;
  apiKey?: string;
  endpointUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  enabled: boolean;
  monthlyTokenBudget: number;
  allowedRoles: Role[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AiGeneratedWorkflowResult {
  definition: WorkflowDefinition;
  valid: boolean;
  validationErrors: string[];
  explanation: string;
  tokensUsed: number;
  isUntrustedDraft: boolean;
}

export interface AiEditedWorkflowResult {
  definition: WorkflowDefinition;
  valid: boolean;
  validationErrors: string[];
  diff: {
    addedNodes: unknown[];
    removedNodes: unknown[];
    modifiedNodes: unknown[];
    addedEdges: unknown[];
    removedEdges: unknown[];
    summary:
      | {
          totalChanges: number;
          nodesAdded: number;
          nodesRemoved: number;
          nodesModified: number;
          edgesAdded: number;
          edgesRemoved: number;
        }
      | string;
  };
  explanation: string;
  tokensUsed: number;
  isUntrustedDraft: boolean;
}

export interface AiWorkflowExplanation {
  summary: string;
  triggerDescription: string;
  branches: Array<{
    nodeId: string;
    condition: string;
    description: string;
  }>;
  externalIntegrations: Array<{
    nodeId: string;
    type: string;
    summary: string;
  }>;
  approvals: Array<{
    nodeId: string;
    assignedRole?: string;
    description: string;
  }>;
  riskAnalysis: Array<{
    level: "LOW" | "MEDIUM" | "HIGH";
    description: string;
  }>;
}

export interface AiFailureAnalysis {
  executionId: string;
  failedNodeId?: string;
  failureCategory:
    | "TIMEOUT"
    | "HTTP_ERROR"
    | "VALIDATION_ERROR"
    | "CONNECTOR_AUTH_ERROR"
    | "EXPRESSION_ERROR"
    | "SCRIPT_ERROR"
    | "UNKNOWN";
  rootCause: string;
  evidence: string[];
  suggestedFixes: string[];
  tokensUsed: number;
}

export interface AiExpressionAssistance {
  expression: string;
  explanation: string;
  isValid: boolean;
  syntaxValidationMessage?: string;
  exampleEvaluation?: unknown;
}

// ==========================================
// BUSINESS PROCESS INTELLIGENCE & OPTIMIZATION
// ==========================================

export const ProcessEventTypeEnum = z.enum([
  "EXECUTION_QUEUED",
  "EXECUTION_STARTED",
  "NODE_STARTED",
  "NODE_COMPLETED",
  "NODE_FAILED",
  "RETRY_SCHEDULED",
  "APPROVAL_REQUESTED",
  "APPROVAL_COMPLETED",
  "EXTERNAL_CALL_COMPLETED",
  "EXECUTION_CANCELLED",
  "EXECUTION_TIMED_OUT",
  "EXECUTION_COMPLETED",
]);
export type ProcessEventType = z.infer<typeof ProcessEventTypeEnum>;

export const SloTargetTypeEnum = z.enum([
  "SUCCESS_RATE",
  "DURATION_P95",
  "QUEUE_WAIT_MAX",
  "APPROVAL_WAIT_MAX",
]);
export type SloTargetType = z.infer<typeof SloTargetTypeEnum>;

export const ProcessIntelligenceQuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d", "custom"]).default("24h"),
  from: z.string().optional(),
  to: z.string().optional(),
  workflowId: z.string().optional(),
  workflowVersionId: z.string().optional(),
  workspaceId: z.string().optional(),
  environment: z.enum(["development", "staging", "production"]).optional(),
});
export type ProcessIntelligenceQuery = z.infer<
  typeof ProcessIntelligenceQuerySchema
>;

export const WorkflowComparisonQuerySchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  versionA: z.string().min(1, "Base version A is required"),
  versionB: z.string().min(1, "Comparison version B is required"),
  range: z.enum(["24h", "7d", "30d", "custom"]).default("7d"),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type WorkflowComparisonQuery = z.infer<
  typeof WorkflowComparisonQuerySchema
>;

export const CreateWorkflowSloSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  name: z.string().min(1, "SLO name is required").max(100),
  targetType: SloTargetTypeEnum,
  targetValue: z.number().positive("Target value must be positive"),
  windowHours: z.number().int().min(1).max(720).default(168),
  description: z.string().max(500).optional(),
});
export type CreateWorkflowSloRequest = z.infer<typeof CreateWorkflowSloSchema>;

export const UpdateWorkflowSloSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  targetValue: z.number().positive().optional(),
  windowHours: z.number().int().min(1).max(720).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWorkflowSloRequest = z.infer<typeof UpdateWorkflowSloSchema>;

export const RecordBusinessOutcomeSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  executionId: z.string().min(1, "Execution ID is required"),
  outcomeType: z.string().min(1, "Outcome type is required").max(100),
  status: z.enum(["COMPLETED", "REJECTED", "FAILED", "SLA_BREACHED"]),
  targetTimeMs: z.number().positive().optional(),
  actualTimeMs: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RecordBusinessOutcomeRequest = z.infer<
  typeof RecordBusinessOutcomeSchema
>;

export interface ProcessEventRecord {
  id: string;
  organizationId: string;
  workspaceId?: string;
  workflowId: string;
  workflowVersionId?: string;
  executionId: string;
  nodeId?: string;
  eventType: ProcessEventType;
  durationMs?: number;
  retryCount?: number;
  failureCategory?: string;
  connectorCategory?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ProcessBottleneckFinding {
  findingId: string;
  category:
    | "NODE_DURATION"
    | "RETRY_STORM"
    | "QUEUE_WAIT"
    | "CONNECTOR_LATENCY"
    | "APPROVAL_DELAY"
    | "HIGH_FAILURE_RATE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  workflowId: string;
  workflowName: string;
  nodeId?: string;
  nodeName?: string;
  observationWindow: string;
  sampleSize: number;
  measuredValue: number;
  baselineValue: number;
  detectionRule: string;
  evidence: string[];
  status: "ACTIVE" | "RESOLVED" | "SUPPRESSED";
  firstObservedAt: Date;
  lastObservedAt: Date;
}

export interface ProcessAnomalyFinding {
  anomalyId: string;
  metricName: string;
  workflowId?: string;
  workflowName?: string;
  observedValue: number;
  baselineMean: number;
  baselineStdDev: number;
  deviationSigma: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidenceScore: number;
  sampleCount: number;
  evidence: string;
  detectedAt: Date;
}

export interface WorkflowComparisonReport {
  workflowId: string;
  workflowName: string;
  versionA: {
    versionId: string;
    sampleSize: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    retryRate: number;
    failureCategories: Record<string, number>;
  };
  versionB: {
    versionId: string;
    sampleSize: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    retryRate: number;
    failureCategories: Record<string, number>;
  };
  differences: {
    successRateDelta: number;
    durationDeltaMs: number;
    durationChangePercent: number;
    retryRateDelta: number;
    isRegressed: boolean;
    regressionNotes: string[];
  };
}

export interface BusinessOutcomeRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  executionId: string;
  outcomeType: string;
  status: "COMPLETED" | "REJECTED" | "FAILED" | "SLA_BREACHED";
  targetTimeMs?: number;
  actualTimeMs?: number;
  metSla: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface WorkflowSloRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowName?: string;
  name: string;
  targetType: SloTargetType;
  targetValue: number;
  windowHours: number;
  description?: string;
  enabled: boolean;
  currentValue: number;
  errorBudgetRemainingPercent: number;
  isCompliant: boolean;
  sampleCount: number;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowOptimizationRecommendation {
  recommendationId: string;
  workflowId: string;
  workflowName: string;
  nodeId?: string;
  nodeName?: string;
  problem: string;
  evidence: string[];
  proposedChange: string;
  expectedBenefit: string;
  tradeoffs: string;
  requiredPermissions: string[];
  requiresApproval: boolean;
  verificationMethod: string;
}

export interface AiOperationalInsight {
  insightId: string;
  topic: "BOTTLENECK" | "REGRESSION" | "ANOMALY" | "OPTIMIZATION";
  summary: string;
  detailedAnalysis: string;
  supportingEvidence: string[];
  candidateExperiments: string[];
  isAdvisory: boolean;
  tokensUsed: number;
  generatedAt: Date;
}

// ==========================================
// 29. ENTERPRISE EVENT STREAMING & REAL-TIME ORCHESTRATION
// ==========================================

export const EventProcessingStatusEnum = z.enum([
  "INGESTED",
  "ROUTED",
  "NO_MATCH",
  "PROCESSING",
  "PROCESSED",
  "RETRYING",
  "FAILED",
  "DEAD_LETTERED",
]);
export type EventProcessingStatus = z.infer<typeof EventProcessingStatusEnum>;

export const ConnectorSubscriptionStatusEnum = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "ERROR",
]);
export type ConnectorSubscriptionStatus = z.infer<
  typeof ConnectorSubscriptionStatusEnum
>;

export const SubscriptionDeliveryModeEnum = z.enum(["PUSH", "POLL"]);
export type SubscriptionDeliveryMode = z.infer<
  typeof SubscriptionDeliveryModeEnum
>;

export const CanonicalEventSchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1, "Event type is required"),
  specVersion: z.string().default("1.0"),
  organizationId: z.string().optional(),
  workspaceId: z.string().optional().nullable(),
  source: z.string().min(1, "Event source is required"),
  connectorId: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  time: z.union([z.string(), z.date()]).optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional().nullable(),
  partitionKey: z.string().optional().nullable(),
  traceId: z.string().optional().nullable(),
  spanId: z.string().optional().nullable(),
  contentType: z.string().default("application/json"),
  data: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).optional().default({}),
  dataClassification: DataClassificationEnum.default("INTERNAL"),
  idempotencyKey: z.string().optional(),
});
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

export const IngestEventsRequestSchema = z.union([
  CanonicalEventSchema,
  z.object({
    events: z
      .array(CanonicalEventSchema)
      .min(1, "At least one event is required in batch"),
  }),
]);
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>;

export const EventQuerySchema = z.object({
  type: z.string().optional(),
  source: z.string().optional(),
  status: EventProcessingStatusEnum.optional(),
  partitionKey: z.string().optional(),
  correlationId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;

export const EventReplayRequestSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  types: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  statuses: z.array(EventProcessingStatusEnum).optional(),
  eventIds: z.array(z.string()).optional(),
  targetWorkflowId: z.string().optional(),
  dryRun: z.boolean().default(false),
});
export type EventReplayRequest = z.infer<typeof EventReplayRequestSchema>;

export const CreateConnectorSubscriptionSchema = z.object({
  connectorId: z.string().min(1, "Connector ID is required"),
  connectionId: z.string().optional().nullable(),
  name: z.string().min(1, "Subscription name is required"),
  eventTypes: z.array(z.string()).min(1, "At least one event type is required"),
  deliveryMode: SubscriptionDeliveryModeEnum.default("PUSH"),
  endpointUrl: z.string().url().optional().nullable(),
  secret: z.string().optional().nullable(),
  config: z.record(z.unknown()).optional().default({}),
});
export type CreateConnectorSubscriptionRequest = z.infer<
  typeof CreateConnectorSubscriptionSchema
>;

export const UpdateConnectorSubscriptionSchema = z.object({
  name: z.string().optional(),
  eventTypes: z.array(z.string()).min(1).optional(),
  status: ConnectorSubscriptionStatusEnum.optional(),
  endpointUrl: z.string().url().optional().nullable(),
  secret: z.string().optional().nullable(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateConnectorSubscriptionRequest = z.infer<
  typeof UpdateConnectorSubscriptionSchema
>;

export interface StreamEventRecord {
  id: string;
  type: string;
  specVersion: string;
  organizationId: string;
  workspaceId?: string | null;
  source: string;
  connectorId?: string | null;
  subject?: string | null;
  time: Date;
  ingestedAt: Date;
  correlationId: string;
  causationId?: string | null;
  partitionKey?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  contentType: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  dataClassification: DataClassification;
  status: EventProcessingStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date | null;
  nextRetryAt?: Date | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
  executionIds: string[];
  replayedFromId?: string | null;
  replayedAt?: Date | null;
  replayedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventDeduplicationRecord {
  id: string;
  organizationId: string;
  deduplicationKey: string;
  eventId: string;
  firstSeenAt: Date;
  expiresAt: Date;
}

export interface ConnectorSubscriptionRecord {
  id: string;
  organizationId: string;
  connectorId: string;
  connectionId?: string | null;
  name: string;
  eventTypes: string[];
  status: ConnectorSubscriptionStatus;
  deliveryMode: SubscriptionDeliveryMode;
  endpointUrl?: string | null;
  externalSubscriptionId?: string | null;
  secret?: string | null;
  config?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventMetricsSummary {
  totalIngested: number;
  totalRouted: number;
  totalNoMatch: number;
  totalDuplicates: number;
  totalProcessing: number;
  totalProcessed: number;
  totalRetrying: number;
  totalFailed: number;
  totalDeadLettered: number;
  totalReplayed: number;
  activeSubscriptions: number;
  averageIngestionLatencyMs: number;
  queueLagMs: number;
  byEventType: Record<string, number>;
  bySource: Record<string, number>;
}

export interface EventReplayPreviewResult {
  matchingEventCount: number;
  eligibleEvents: Array<{
    id: string;
    type: string;
    source: string;
    time: string;
    status: EventProcessingStatus;
  }>;
  targetWorkflowCount: number;
  targetWorkflows: Array<{
    id: string;
    name: string;
  }>;
}

export interface EventReplayResult {
  replayedCount: number;
  originalEventIds: string[];
  replayedEventIds: string[];
  executionIds: string[];
  initiatedAt: Date;
  initiatedById: string;
}

export interface EventRedriveResult {
  eventId: string;
  status: EventProcessingStatus;
  attempts: number;
  redrivenAt: Date;
  redrivenById: string;
  executionIds: string[];
}

// ==========================================
// 30. EXTENSION SDK, CUSTOM NODES & GOVERNED ECOSYSTEM
// ==========================================

export const ExtensionCapabilityEnum = z.enum([
  "connectors:invoke",
  "credentials:read",
  "context:read",
  "events:emit",
  "network:http",
  "logging:write",
]);
export type ExtensionCapability = z.infer<typeof ExtensionCapabilityEnum>;

export const ExtensionLifecycleStatusEnum = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "SUSPENDED",
  "DEPRECATED",
  "RETIRED",
]);
export type ExtensionLifecycleStatus = z.infer<
  typeof ExtensionLifecycleStatusEnum
>;

export const ExtensionInstallationStatusEnum = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "ERROR",
]);
export type ExtensionInstallationStatus = z.infer<
  typeof ExtensionInstallationStatusEnum
>;

export const DeclaredCustomNodeSchema = z.object({
  nodeType: z.string().min(1, "Custom node type is required"),
  label: z.string().min(1, "Node label is required"),
  category: z.string().default("Custom"),
  description: z.string().optional(),
  inputs: z.number().int().min(0).max(10).default(1),
  outputs: z
    .union([z.number().int().min(0).max(10), z.literal("branching")])
    .default(1),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  documentationUrl: z.string().url().optional(),
  deprecated: z.boolean().default(false),
});
export type DeclaredCustomNode = z.infer<typeof DeclaredCustomNodeSchema>;

export const ExtensionPublisherSchema = z.object({
  id: z.string().min(1, "Publisher ID is required"),
  name: z.string().min(1, "Publisher name is required"),
  email: z.string().email("Valid publisher email is required"),
  verified: z.boolean().default(false),
});
export type ExtensionPublisher = z.infer<typeof ExtensionPublisherSchema>;

export const ExtensionManifestSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9-_.]+$/,
      "Extension ID must contain only lowercase alphanumeric, dash, underscore, and dot.",
    ),
  name: z.string().min(1, "Extension name is required"),
  description: z.string().min(1, "Extension description is required"),
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+/,
      "Version must be valid semantic versioning (e.g. 1.0.0)",
    ),
  manifestSchemaVersion: z.string().default("1.0"),
  publisher: ExtensionPublisherSchema,
  supportedFlowForgeVersions: z.string().default(">=1.0.0"),
  runtime: z.enum(["declarative", "sandboxed-js"]).default("sandboxed-js"),
  declaredNodeTypes: z
    .array(DeclaredCustomNodeSchema)
    .min(1, "At least one custom node type must be declared"),
  declaredCapabilities: z.array(ExtensionCapabilityEnum).default([]),
  requiredConnectors: z.array(z.string()).default([]),
  packageIntegrityHash: z.string().optional(),
  license: z.string().default("MIT"),
  documentationUrl: z.string().url().optional(),
});
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

export const SubmitExtensionPackageSchema = z.object({
  manifest: ExtensionManifestSchema,
  packageIntegrityHash: z.string().min(16).optional(),
  isPublic: z.boolean().default(true),
  releaseNotes: z.string().optional(),
});
export type SubmitExtensionPackageRequest = z.infer<
  typeof SubmitExtensionPackageSchema
>;

export const ReviewExtensionPackageSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().optional(),
});
export type ReviewExtensionPackageRequest = z.infer<
  typeof ReviewExtensionPackageSchema
>;

export const InstallExtensionSchema = z.object({
  version: z.string().optional(),
  grantedCapabilities: z.array(ExtensionCapabilityEnum).optional(),
});
export type InstallExtensionRequest = z.infer<typeof InstallExtensionSchema>;

export const UpgradeExtensionSchema = z.object({
  targetVersion: z.string().min(1, "Target version is required"),
  grantedCapabilities: z.array(ExtensionCapabilityEnum).optional(),
});
export type UpgradeExtensionRequest = z.infer<typeof UpgradeExtensionSchema>;

export interface ExtensionPackageRecord {
  id: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  publisherEmail: string;
  isVerifiedPublisher: boolean;
  isPublic: boolean;
  organizationId?: string | null;
  status: ExtensionLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtensionVersionRecord {
  id: string;
  extensionId: string;
  version: string;
  manifest: ExtensionManifest;
  packageIntegrityHash: string;
  supportedFlowForgeVersions: string;
  declaredCapabilities: ExtensionCapability[];
  status: "APPROVED" | "PENDING_REVIEW" | "REJECTED";
  releaseNotes?: string | null;
  createdAt: Date;
}

export interface ExtensionInstallationRecord {
  id: string;
  organizationId: string;
  extensionId: string;
  installedVersion: string;
  status: ExtensionInstallationStatus;
  grantedCapabilities: ExtensionCapability[];
  installedById?: string | null;
  installedAt: Date;
  updatedAt: Date;
}

export interface UpgradePreviewResult {
  extensionId: string;
  currentVersion: string;
  targetVersion: string;
  isCompatible: boolean;
  addedNodeTypes: string[];
  removedNodeTypes: string[];
  newCapabilitiesRequired: ExtensionCapability[];
  affectedWorkflowCount: number;
  affectedWorkflows: Array<{
    id: string;
    name: string;
    nodesUsingExtension: string[];
  }>;
}

// ==========================================
// RESILIENCE, LEASING & DISASTER RECOVERY SCHEMAS
// ==========================================

export interface ExecutionLeaseRecord {
  id: string; // `lease_${executionId}`
  executionId: string;
  workerId: string;
  leaseToken: string; // UUID fence token
  renewCount: number;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
}

export interface ScheduleExecutionClaimRecord {
  id: string; // `claim_${scheduleId}_${occurrenceKey}`
  scheduleId: string;
  occurrenceKey: string;
  claimedBy: string; // Worker/Scheduler node instance
  claimedAt: Date;
  expiresAt: Date;
  executionId?: string;
}

export const StepReconciliationStatusEnum = z.enum([
  "REQUIRES_RECONCILIATION",
  "RECONCILED",
  "MANUALLY_RESOLVED",
]);
export type StepReconciliationStatus = z.infer<
  typeof StepReconciliationStatusEnum
>;

export interface StepReconciliationRecord {
  id: string;
  executionId: string;
  stepId: string;
  nodeId: string;
  nodeType: string;
  status: StepReconciliationStatus;
  reason: string;
  sideEffectDetails?: Record<string, unknown>;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionAction?: "RESUME" | "FAIL" | "SKIP";
  createdAt: Date;
  updatedAt: Date;
}

export const ReconcileExecutionStepSchema = z.object({
  action: z.enum(["RESUME", "FAIL", "SKIP"]),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});
export type ReconcileExecutionStepRequest = z.infer<
  typeof ReconcileExecutionStepSchema
>;

export interface HealthReadinessDetails {
  status: "ready" | "not_ready" | "shutting_down" | "degraded";
  timestamp: string;
  uptime: number;
  activeRequests: number;
  dependencies: {
    database: "connected" | "disconnected" | "degraded";
    circuitBreakers: "healthy" | "open" | "half_open";
    workers?: {
      activeWorkers: number;
      activeExecutions: number;
    };
  };
  system: {
    memoryUsedMb: number;
    memoryTotalMb: number;
  };
}

// ==========================================
// Unified Enterprise Search & Data Discovery (Prompt 32)
// ==========================================

export const SearchableResourceTypeEnum = z.enum([
  "workflow",
  "workflow_version",
  "execution",
  "event",
  "connector",
  "extension",
  "template",
  "approval",
  "audit_log",
]);
export type SearchableResourceType = z.infer<typeof SearchableResourceTypeEnum>;

export const SearchQuerySchema = z.object({
  query: z.string().max(256).optional().default(""),
  types: z.array(SearchableResourceTypeEnum).optional(),
  workspaceId: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  ownerId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(["relevance", "createdAt", "updatedAt"]).default("relevance"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export interface SearchResultItem {
  id: string;
  resourceType: SearchableResourceType;
  title: string;
  summary: string;
  status?: string;
  organizationId: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt?: string;
  navigationUrl: string;
  matchedFields: string[];
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface UnifiedSearchResponse {
  query: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: SearchResultItem[];
  facets: {
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  executionTimeMs: number;
}

export const CreateSavedSearchSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  query: z.string().max(256).optional().default(""),
  types: z.array(SearchableResourceTypeEnum).optional().default([]),
  filters: z.record(z.unknown()).optional().default({}),
  isShared: z.boolean().optional().default(false),
});
export type CreateSavedSearchRequest = z.infer<typeof CreateSavedSearchSchema>;

export interface SavedSearchRecord {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  description?: string | null;
  query: string;
  types: SearchableResourceType[];
  filters: Record<string, unknown>;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchMetricsSummary {
  totalSearches: number;
  avgDurationMs: number;
  slowQueriesCount: number;
  searchesByType: Record<string, number>;
}

// ==========================================
// Policy-as-Code, Automated Governance & Compliance Enforcement (Prompt 33)
// ==========================================

export const PolicyCategoryEnum = z.enum([
  "WORKFLOW_SAFETY",
  "CONNECTOR_RESTRICTION",
  "DATA_PROTECTION",
  "EXECUTION_CONTROL",
  "API_GOVERNANCE",
  "CUSTOM",
]);
export type PolicyCategory = z.infer<typeof PolicyCategoryEnum>;

export const PolicyStatusEnum = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "RETIRED",
]);
export type PolicyStatus = z.infer<typeof PolicyStatusEnum>;

export const PolicyResourceTypeEnum = z.enum([
  "WORKFLOW",
  "CONNECTOR",
  "EXECUTION",
  "CREDENTIAL",
  "EXTENSION",
  "API_ACCESS",
  "WEBHOOK",
]);
export type PolicyResourceType = z.infer<typeof PolicyResourceTypeEnum>;

export const PolicyOperationEnum = z.enum([
  "PUBLISH",
  "EXECUTE",
  "CONNECT",
  "EXPORT",
  "CREATE",
  "DISPATCH",
  "INVOKE",
]);
export type PolicyOperation = z.infer<typeof PolicyOperationEnum>;

export const PolicyRuleConditionOperatorEnum = z.enum([
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "IN",
  "NOT_IN",
  "GREATER_THAN",
  "LESS_THAN",
  "MATCHES_REGEX",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);
export type PolicyRuleConditionOperator = z.infer<
  typeof PolicyRuleConditionOperatorEnum
>;

export const PolicyRuleOutcomeEnum = z.enum([
  "ALLOW",
  "DENY",
  "REQUIRE_APPROVAL",
  "REQUIRE_AUDIT",
  "FLAG_FOR_REVIEW",
]);
export type PolicyRuleOutcome = z.infer<typeof PolicyRuleOutcomeEnum>;

export const PolicyRuleSeverityEnum = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);
export type PolicyRuleSeverity = z.infer<typeof PolicyRuleSeverityEnum>;

export const PolicyRuleConditionSchema = z.object({
  field: z.string().min(1, "Condition field is required").max(100),
  operator: PolicyRuleConditionOperatorEnum,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .optional(),
});
export type PolicyRuleCondition = z.infer<typeof PolicyRuleConditionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().min(1, "Rule ID is required").max(64),
  name: z.string().min(1, "Rule name is required").max(100),
  description: z.string().max(500).optional(),
  conditions: z
    .array(PolicyRuleConditionSchema)
    .min(1, "At least one condition required"),
  logicalOperator: z.enum(["AND", "OR"]).default("AND"),
  outcome: PolicyRuleOutcomeEnum.default("DENY"),
  requiredRole: RoleEnum.optional(),
  severity: PolicyRuleSeverityEnum.default("HIGH"),
  reasonCode: z.string().min(1).max(64),
  message: z.string().min(1).max(500),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const CreatePolicySchema = z.object({
  name: z.string().min(1, "Policy name is required").max(100),
  description: z.string().max(500).optional(),
  workspaceId: z.string().optional(),
  category: PolicyCategoryEnum.default("WORKFLOW_SAFETY"),
  applicableResourceTypes: z
    .array(PolicyResourceTypeEnum)
    .min(1, "At least one applicable resource type required"),
  applicableOperations: z
    .array(PolicyOperationEnum)
    .min(1, "At least one applicable operation required"),
  priority: z.coerce.number().int().min(1).max(1000).default(100),
  effectiveStartDate: z.string().datetime().optional(),
  effectiveEndDate: z.string().datetime().optional(),
  rules: z
    .array(PolicyRuleSchema)
    .min(1, "Policy must contain at least one rule"),
  complianceControls: z.array(z.string()).default([]),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicySchema>;

export const UpdatePolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  workspaceId: z.string().optional(),
  category: PolicyCategoryEnum.optional(),
  applicableResourceTypes: z.array(PolicyResourceTypeEnum).min(1).optional(),
  applicableOperations: z.array(PolicyOperationEnum).min(1).optional(),
  priority: z.coerce.number().int().min(1).max(1000).optional(),
  effectiveStartDate: z.string().datetime().optional(),
  effectiveEndDate: z.string().datetime().optional(),
  rules: z.array(PolicyRuleSchema).min(1).optional(),
  complianceControls: z.array(z.string()).optional(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicySchema>;

export interface PolicyRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  category: PolicyCategory;
  version: number;
  status: PolicyStatus;
  applicableResourceTypes: PolicyResourceType[];
  applicableOperations: PolicyOperation[];
  priority: number;
  effectiveStartDate?: Date | null;
  effectiveEndDate?: Date | null;
  rules: PolicyRule[];
  complianceControls: string[];
  createdById: string;
  lastModifiedById?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | null;
  changeSummary?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyVersionRecord {
  id: string;
  policyId: string;
  organizationId: string;
  version: number;
  definition: {
    name: string;
    description?: string | null;
    category: PolicyCategory;
    applicableResourceTypes: PolicyResourceType[];
    applicableOperations: PolicyOperation[];
    priority: number;
    rules: PolicyRule[];
    complianceControls: string[];
  };
  approvedById: string;
  approvedAt: Date;
  changeSummary?: string | null;
  createdAt: Date;
}

export interface PolicyEvaluationContext {
  organizationId: string;
  workspaceId?: string;
  principal: {
    id: string;
    role: Role;
    email?: string;
    ip?: string;
  };
  resourceType: PolicyResourceType;
  resourceId?: string;
  operation: PolicyOperation;
  environment?: WorkflowEnvironment;
  attributes: Record<string, unknown>;
  correlationId?: string;
}

export interface PolicyEvaluationDecision {
  decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "FLAG_FOR_REVIEW";
  isAllowed: boolean;
  requiresApproval: boolean;
  requiredApprovalRole?: Role;
  matchedPolicies: Array<{
    policyId: string;
    policyVersion: number;
    policyName: string;
    ruleId: string;
    outcome: PolicyRuleOutcome;
    severity: PolicyRuleSeverity;
    reasonCode: string;
    message: string;
  }>;
  violations: Array<{
    policyId: string;
    policyVersion: number;
    ruleId: string;
    reasonCode: string;
    message: string;
    severity: PolicyRuleSeverity;
  }>;
  warnings: Array<{
    code: string;
    message: string;
    policyId: string;
    severity: PolicyRuleSeverity;
  }>;
  auditRequired: boolean;
  evaluationDurationMs: number;
  evaluatedAt: string;
  correlationId: string;
}

export const CreatePolicyExceptionSchema = z.object({
  policyId: z.string().min(1, "Policy ID required"),
  ruleId: z.string().optional(),
  resourceType: PolicyResourceTypeEnum,
  resourceId: z.string().min(1, "Resource ID required"),
  operation: PolicyOperationEnum,
  reason: z.string().min(5, "Exception justification required").max(1000),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(24),
  workspaceId: z.string().optional(),
});
export type CreatePolicyExceptionRequest = z.infer<
  typeof CreatePolicyExceptionSchema
>;

export interface PolicyExceptionRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  policyId: string;
  policyVersion: number;
  ruleId?: string | null;
  resourceType: PolicyResourceType;
  resourceId: string;
  operation: PolicyOperation;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED";
  requestedById: string;
  approvedById?: string | null;
  approvedAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyViolationRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  policyId: string;
  policyVersion: number;
  ruleId: string;
  resourceType: PolicyResourceType;
  resourceId: string;
  operation: PolicyOperation;
  severity: PolicyRuleSeverity;
  reasonCode: string;
  message: string;
  status: "OPEN" | "ACKNOWLEDGED" | "EXCEPTION_GRANTED" | "RESOLVED";
  assignedToId?: string | null;
  remediationNotes?: string | null;
  detectedAt: Date;
  resolvedAt?: Date | null;
}

export const SimulatePolicySchema = z.object({
  policy: CreatePolicySchema.optional(),
  policyId: z.string().optional(),
  context: z.object({
    resourceType: PolicyResourceTypeEnum,
    resourceId: z.string().optional(),
    operation: PolicyOperationEnum,
    environment: WorkflowEnvironmentEnum.optional(),
    attributes: z.record(z.unknown()).default({}),
  }),
});
export type SimulatePolicyRequest = z.infer<typeof SimulatePolicySchema>;

// ==========================================
// ENTERPRISE DATA GOVERNANCE & BI SCHEMAS
// ==========================================

export const RoiAssumptionSchema = z.object({
  workflowId: z.string().optional(),
  manualMinutesPerRun: z.coerce.number().min(0).default(15.0),
  hourlyWage: z.coerce.number().min(0).default(45.0),
  licenseCostMonthly: z.coerce.number().min(0).default(0.0),
  infrastructureCostPerRun: z.coerce.number().min(0).default(0.0),
  currency: z.string().default("USD"),
});
export type RoiAssumptionInput = z.infer<typeof RoiAssumptionSchema>;

export interface RoiAssumptionRecord {
  id: string;
  organizationId: string;
  workflowId?: string | null;
  manualMinutesPerRun: number;
  hourlyWage: number;
  licenseCostMonthly: number;
  infrastructureCostPerRun: number;
  currency: string;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRoiBreakdown {
  workflowId: string;
  workflowName: string;
  executionCount: number;
  successfulExecutions: number;
  manualMinutesPerRun: number;
  hoursSaved: number;
  laborCostAvoided: number;
  infrastructureCost: number;
  netSavings: number;
}

export interface RoiCalculationResult {
  period: { from: string; to: string; range: string };
  totalExecutions: number;
  successfulExecutions: number;
  estimatedHoursSaved: number;
  estimatedLaborCostAvoided: number;
  licenseCostAllocated: number;
  infrastructureCostTotal: number;
  netSavings: number;
  currency: string;
  assumptionsUsed: {
    manualMinutesPerRun: number;
    hourlyWage: number;
    licenseCostMonthly: number;
    infrastructureCostPerRun: number;
    isCustom: boolean;
  };
  breakdownByWorkflow: WorkflowRoiBreakdown[];
}

export type DataQualityCheckStatus = "PASS" | "WARN" | "FAIL";

export interface DataQualityIssue {
  entityType: "execution" | "step" | "approval" | "event" | "schedule";
  recordId: string;
  issueType:
    | "MISSING_ID"
    | "INVALID_TIMESTAMP"
    | "NEGATIVE_DURATION"
    | "ORPHANED_RECORD"
    | "UNCLASSIFIED_FAILURE"
    | "ANOMALOUS_SPIKE";
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detectedAt: string;
}

export interface DataQualityCheckResult {
  checkName: string;
  status: DataQualityCheckStatus;
  score: number;
  evaluatedCount: number;
  issueCount: number;
  details: string;
}

export interface DataQualityReport {
  overallQualityScore: number;
  status: DataQualityCheckStatus;
  totalRecordsAudited: number;
  cleanRecordsCount: number;
  corruptedRecordsCount: number;
  auditedAt: string;
  checks: DataQualityCheckResult[];
  issues: DataQualityIssue[];
}

export interface GovernanceAnalyticsSummary {
  period: { from: string; to: string };
  totalPolicyEvaluations: number;
  evaluationsAllowed: number;
  evaluationsBlocked: number;
  evaluationsWarned: number;
  passRatePercentage: number;
  totalViolations: number;
  violationsBySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  totalExceptions: number;
  activeExceptions: number;
  approvals: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    averageWaitTimeMs: number;
  };
  enforcementDistribution: Record<string, number>;
}

export interface ConnectorMetricItem {
  connectionId: string;
  connectorName: string;
  provider: string;
  status: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  errorRatePercentage: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  rateLimitHits: number;
  lastUsedAt?: string | null;
}

export interface IntegrationAnalyticsSummary {
  period: { from: string; to: string };
  totalConnections: number;
  activeConnections: number;
  totalInvocations: number;
  overallSuccessRate: number;
  rateLimitSpikes: number;
  connectors: ConnectorMetricItem[];
}

export const SavedReportTypeEnum = z.enum([
  "EXECUTIVE_ROI",
  "OPERATIONAL_HEALTH",
  "INTEGRATION_RELIABILITY",
  "GOVERNANCE_AUDIT",
  "DATA_QUALITY",
  "CUSTOM",
]);
export type SavedReportType = z.infer<typeof SavedReportTypeEnum>;

export const CreateSavedReportSchema = z.object({
  name: z.string().min(1, "Report name is required").max(100),
  description: z.string().max(500).optional(),
  reportType: SavedReportTypeEnum.default("EXECUTIVE_ROI"),
  workspaceId: z.string().optional(),
  filters: z.record(z.any()).optional(),
  metrics: z.array(z.string()).optional(),
  scheduleCron: z.string().optional(),
  format: z.enum(["JSON", "CSV"]).default("JSON"),
});
export type CreateSavedReportRequest = z.infer<typeof CreateSavedReportSchema>;

export interface SavedReportRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  reportType: SavedReportType;
  filters?: Record<string, any>;
  metrics?: string[];
  scheduleCron?: string | null;
  format: "JSON" | "CSV";
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// ENTERPRISE RESOURCE GOVERNANCE & QUOTAS
// ==========================================

export const EnforcementActionEnum = z.enum(["REJECT", "QUEUE", "ALERT_ONLY"]);
export type EnforcementAction = z.infer<typeof EnforcementActionEnum>;

export const ResourceQuotaSchema = z.object({
  workspaceId: z.string().optional(),
  workflowId: z.string().optional(),
  maxMonthlyExecutions: z.coerce.number().int().min(-1).default(5000),
  maxConcurrentExecutions: z.coerce.number().int().min(-1).default(10),
  maxQueueDepth: z.coerce.number().int().min(1).default(50),
  maxExecutionDurationMs: z.coerce.number().int().min(1000).default(300000),
  maxStepCount: z.coerce.number().int().min(1).default(100),
  maxRetries: z.coerce.number().int().min(0).default(3),
  maxConnectorCallsPerRun: z.coerce.number().int().min(0).default(50),
  monthlyBudgetDollars: z.coerce.number().min(0).default(500.0),
  budgetAlertThresholdPercent: z.coerce.number().min(1).max(100).default(80),
  fairShareWeight: z.coerce.number().int().min(1).max(100).default(10),
  enforcementAction: EnforcementActionEnum.default("REJECT"),
});
export type ResourceQuotaInput = z.infer<typeof ResourceQuotaSchema>;

export interface ResourceQuotaRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  workflowId?: string | null;
  scopeType?: "PLAN_DEFAULT" | "ORGANIZATION" | "WORKSPACE" | "WORKFLOW";
  maxMonthlyExecutions: number;
  maxConcurrentExecutions: number;
  maxQueueDepth: number;
  maxExecutionDurationMs: number;
  maxStepCount: number;
  maxRetries: number;
  maxConnectorCallsPerRun: number;
  monthlyBudgetDollars: number;
  budgetAlertThresholdPercent: number;
  fairShareWeight: number;
  enforcementAction: EnforcementAction;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdmissionOutcome =
  | "ACCEPTED"
  | "QUEUED"
  | "QUOTA_EXCEEDED"
  | "REJECTED_QUOTA"
  | "CONCURRENT_EXECUTION_LIMIT_EXCEEDED"
  | "REJECTED_CONCURRENCY"
  | "REJECTED_QUEUE_CAPACITY"
  | "REJECTED_BUDGET"
  | "REJECTED_PROTECTION"
  | "REJECTED_POLICY"
  | "SUBSCRIPTION_SUSPENDED";

export interface AdmissionDecision {
  allowed: boolean;
  outcome: AdmissionOutcome;
  statusCode: number;
  reason: string;
  retryAfterSeconds?: number;
  metric?: string;
  limit?: number;
  currentUsage?: number;
  reservationId?: string;
  execution?: any;
}

export interface ResourceReservationRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  workflowId: string;
  executionId: string;
  reservedAt: Date;
  expiresAt: Date;
  releasedAt?: Date | null;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
}

export interface FairQueueItem {
  executionId: string;
  organizationId: string;
  workspaceId?: string | null;
  workflowId: string;
  priority: number;
  weight: number;
  enqueuedAt: Date;
  deficitCounter: number;
}

export interface FairSchedulingMetrics {
  totalQueued: number;
  activeTenantsCount: number;
  tenantQueueDepths: Record<string, number>;
  tenantActiveConcurrency: Record<string, number>;
  dispatchedThisCycle: number;
  starvationIncidentsAvoided: number;
}

export interface CostBudgetStatus {
  organizationId: string;
  monthlyBudgetDollars: number;
  estimatedMonthlySpendDollars: number;
  utilizationPercent: number;
  alertThresholdPercent: number;
  alertTriggered: boolean;
  budgetExceeded: boolean;
  currency: string;
  asOf: string;
}

export interface ResourceUtilizationSummary {
  organizationId: string;
  planName: string;
  monthlyExecutions: {
    current: number;
    limit: number;
    percentage: number;
  };
  concurrentExecutions: {
    active: number;
    limit: number;
    percentage: number;
  };
  queueDepth: {
    queued: number;
    limit: number;
    percentage: number;
  };
  budgets: {
    maxDurationMs: number;
    maxStepCount: number;
    maxConnectorCalls: number;
    monthlyBudgetDollars: number;
  };
  fairShareWeight: number;
  health: "HEALTHY" | "APPROACHING_LIMIT" | "CONGESTED" | "CRITICAL";
}

// ==========================================
// WORKFLOW SIMULATION, TESTING & DEBUGGING (Prompt 36)
// ==========================================

export const TestingModeEnum = z.enum([
  "STATIC_VALIDATION",
  "SIMULATION",
  "MOCKED_INTEGRATION",
  "ISOLATED_REAL_INTEGRATION",
]);
export type TestingMode = z.infer<typeof TestingModeEnum>;

export const NodeSimulationStatusEnum = z.enum([
  "PASSED",
  "FAILED",
  "SKIPPED",
  "MOCKED",
  "UNSUPPORTED",
  "BLOCKED",
  "NOT_REACHED",
]);
export type NodeSimulationStatus = z.infer<typeof NodeSimulationStatusEnum>;

export const AssertionTypeEnum = z.enum([
  "OUTPUT_EQUALS",
  "OUTPUT_MATCHES_SCHEMA",
  "BRANCH_TAKEN",
  "NODE_EXECUTED",
  "NODE_SKIPPED",
  "ERROR_RAISED",
  "CONNECTOR_CALLED",
  "BUDGET_RESPECTED",
  "POLICY_BLOCKED",
  "APPROVAL_REQUESTED",
]);
export type AssertionType = z.infer<typeof AssertionTypeEnum>;

export const FailureInjectionTypeEnum = z.enum([
  "TIMEOUT",
  "RATE_LIMIT_429",
  "PROVIDER_500",
  "INVALID_PAYLOAD",
  "NETWORK_ERROR",
  "STEP_ERROR",
]);
export type FailureInjectionType = z.infer<typeof FailureInjectionTypeEnum>;

export interface NodeSimulationResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeSimulationStatus;
  inputPayload?: unknown;
  outputPayload?: unknown;
  selectedHandle?: string;
  durationMs?: number;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
  isMocked?: boolean;
  mocked?: boolean;
  branchTaken?: string;
  redactedFields?: string[];
  injectedFailure?: string;
}

export interface AssertionRule {
  type: AssertionType;
  target: string;
  expected?: unknown;
  operator?: string;
  message?: string;
}

export interface AssertionResult {
  type: AssertionType;
  target: string;
  expected?: unknown;
  actual?: unknown;
  passed: boolean;
  message: string;
}

export interface SimulationRunResult {
  simulationId?: string;
  workflowId: string;
  workflowVersionId?: string | null;
  mode: TestingMode;
  status: "PASSED" | "FAILED" | "ERROR" | "COMPLETED";
  durationMs: number;
  totalNodes?: number;
  executedNodes?: number;
  mockedNodes?: number;
  failedNodes?: number;
  skippedNodes?: number;
  executedPath: string[];
  executionPath?: string[];
  unreachableNodes: string[];
  nodeResults: Record<string, NodeSimulationResult>;
  outputPayload?: Record<string, unknown>;
  finalOutput?: unknown;
  failureReason?: string | null;
  error?: { code?: string; message: string; details?: unknown };
  sideEffectsPrevented?: boolean;
  realIntegrationExecuted?: boolean;
  timestamp: string;
}

export interface WorkflowTestCaseRecord {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  workflowId: string;
  workflowVersionId?: string | null;
  name: string;
  description?: string | null;
  mode: TestingMode;
  inputData: Record<string, unknown>;
  mockFixtures?: Record<string, unknown>;
  failureInjections?: Record<
    string,
    { type: FailureInjectionType; message?: string }
  >;
  assertions: AssertionRule[];
  assertionRules?: AssertionRule[];
  lastRunStatus?: "PASSED" | "FAILED" | "ERROR";
  lastRunAt?: Date;
  createdById?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTestRunRecord {
  id: string;
  organizationId: string;
  testCaseId?: string | null;
  workflowId: string;
  workflowVersionId?: string | null;
  mode: TestingMode;
  status: "PASSED" | "FAILED" | "ERROR";
  executedPath: string[];
  unreachableNodes: string[];
  nodeResults: Record<string, NodeSimulationResult>;
  assertionResults: AssertionResult[];
  finalOutput?: unknown;
  failureReason?: string | null;
  durationMs: number;
  triggeredById?: string | null;
  createdAt: Date;
}

export interface TestFixtureRecord {
  id: string;
  organizationId: string;
  name: string;
  connectorType: string;
  operation: string;
  matchPattern?: string | null;
  responseStatus: number;
  responsePayload?: unknown;
  errorDetails?: unknown;
  isRateLimited?: boolean;
  isTimeout?: boolean;
  delayMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebugSessionRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersionId: string;
  breakpoints: string[];
  currentNodeId?: string | null;
  status: "PAUSED" | "RUNNING" | "COMPLETED" | "CANCELLED";
  activeBreakpointNodeId?: string | null;
  currentStepIndex?: number;
  contextData: Record<string, unknown>;
  stepHistory: NodeSimulationResult[];
  expiresAt: Date;
  createdAt: Date;
}

export interface RegressionComparisonResult {
  workflowId: string;
  baseVersionId: string;
  targetVersionId: string;
  isIdentical: boolean;
  pathIdentical?: boolean;
  hasRegressions?: boolean;
  basePath?: string[];
  targetPath?: string[];
  pathDifferences: {
    baseOnly: string[];
    targetOnly: string[];
    common: string[];
  };
  outputDifferences: Record<
    string,
    { base?: unknown; target?: unknown; matches: boolean }
  >;
  newFailures: string[];
  resolvedFailures: string[];
  summary: string;
}

export interface PublishingGateConfigRecord {
  id: string;
  organizationId: string;
  workflowId?: string | null;
  requireStaticValidation: boolean;
  requireTestSuitePass: boolean;
  requireRegressionCheck: boolean;
  requirePolicyCheck: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishingGateEvaluation {
  passed: boolean;
  checks: {
    staticValidation: { passed: boolean; message?: string };
    testSuite: {
      passed: boolean;
      totalTests: number;
      passedTests: number;
      message?: string;
    };
    regressionCheck: { passed: boolean; message?: string };
    policyCheck: { passed: boolean; message?: string };
  };
  reasons: string[];
}

// Zod Validation Schemas
export const AssertionRuleSchema = z.object({
  type: AssertionTypeEnum,
  target: z.string().min(1, "Target is required"),
  expected: z.unknown().optional(),
  operator: z.string().optional(),
  message: z.string().optional(),
});

export const CreateTestCaseSchema = z.object({
  name: z.string().min(1, "Test case name is required").max(100),
  description: z.string().max(500).optional(),
  workflowVersionId: z.string().optional(),
  mode: TestingModeEnum.default("SIMULATION"),
  inputData: z.record(z.unknown()).default({}),
  mockFixtures: z.record(z.unknown()).optional(),
  failureInjections: z
    .record(
      z.object({
        type: FailureInjectionTypeEnum,
        message: z.string().optional(),
      }),
    )
    .optional(),
  assertions: z.array(AssertionRuleSchema).default([]),
  assertionRules: z.array(AssertionRuleSchema).optional(),
});
export type CreateTestCaseInput = z.infer<typeof CreateTestCaseSchema>;

export const UpdateTestCaseSchema = CreateTestCaseSchema.partial();
export type UpdateTestCaseInput = z.infer<typeof UpdateTestCaseSchema>;

export const RunSimulationSchema = z.object({
  workflowVersionId: z.string().optional(),
  mode: TestingModeEnum.default("SIMULATION"),
  inputData: z.record(z.unknown()).default({}),
  mockFixtures: z.record(z.unknown()).optional(),
  failureInjections: z
    .union([
      z.record(
        z.object({
          type: FailureInjectionTypeEnum,
          message: z.string().optional(),
        }),
      ),
      z.array(
        z.object({
          nodeId: z.string(),
          type: FailureInjectionTypeEnum,
          message: z.string().optional(),
        }),
      ),
    ])
    .optional(),
  approvalDecisions: z
    .record(
      z.object({
        approved: z.boolean(),
        comment: z.string().optional(),
      }),
    )
    .optional(),
  authorizedForRealIntegration: z.boolean().default(false),
});
export type RunSimulationInput = z.infer<typeof RunSimulationSchema>;

export const CreateTestFixtureSchema = z.object({
  name: z.string().min(1, "Fixture name is required").max(100),
  connectorType: z.string().min(1, "Connector type is required"),
  operation: z.string().min(1, "Operation is required"),
  matchPattern: z.string().optional(),
  responseStatus: z.coerce.number().int().default(200),
  responsePayload: z.unknown().optional(),
  errorDetails: z.unknown().optional(),
  isRateLimited: z.boolean().default(false),
  isTimeout: z.boolean().default(false),
  delayMs: z.coerce.number().int().min(0).default(0),
});
export type CreateTestFixtureInput = z.infer<typeof CreateTestFixtureSchema>;

export const CreateDebugSessionSchema = z.object({
  workflowVersionId: z.string().optional(),
  breakpoints: z.array(z.string()).default([]),
  inputData: z.record(z.unknown()).default({}),
  mockFixtures: z.record(z.unknown()).optional(),
});
export type CreateDebugSessionInput = z.infer<typeof CreateDebugSessionSchema>;

export const CompareWorkflowVersionsSchema = z.object({
  baseVersionId: z.string().optional(),
  targetVersionId: z.string().min(1, "TargetVersionId is required"),
  testCaseId: z.string().optional(),
  inputData: z.record(z.unknown()).optional(),
  testInput: z.record(z.unknown()).optional(),
});
export type CompareWorkflowVersionsInput = z.infer<
  typeof CompareWorkflowVersionsSchema
>;

export const UpdatePublishingGateConfigSchema = z.object({
  requireStaticValidation: z.boolean().default(true),
  requireTestSuitePass: z.boolean().default(false),
  requireRegressionCheck: z.boolean().default(false),
  requirePolicyCheck: z.boolean().default(true),
});
export type UpdatePublishingGateConfigInput = z.infer<
  typeof UpdatePublishingGateConfigSchema
>;

// ==========================================
// ENTERPRISE API RELIABILITY & WEBHOOK SECURITY
// ==========================================

export interface ApiErrorDetail {
  field?: string;
  message: string;
  issue?: string;
  [key: string]: unknown;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown> | ApiErrorDetail[] | unknown;
  requestId: string;
  retryable: boolean;
  docUrl?: string;
}

export interface ApiResponseEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error: ApiErrorPayload | null;
  meta?: Record<string, unknown>;
}

export interface ApiVersionInfo {
  version: string;
  apiVersion: string;
  minSupportedVersion: string;
  status: "active" | "deprecated" | "sunset";
  releaseDate: string;
  documentationUrl: string;
  supportedVersions: string[];
}

export interface ApiDeprecationInfo {
  path: string;
  deprecatedSince: string;
  sunsetDate: string;
  alternativePath: string;
  reason: string;
  docUrl?: string;
}

export const RotateWebhookSecretSchema = z.object({
  gracePeriodHours: z.number().int().min(1).max(168).default(24),
});
export type RotateWebhookSecretInput = z.infer<
  typeof RotateWebhookSecretSchema
>;

export interface WebhookSignatureValidationOptions {
  payload: string | Buffer;
  signature?: string;
  secret?: string;
  timestamp?: string | number;
  maxAgeSeconds?: number;
  algorithm?: "sha256" | "sha1";
}

export interface WebhookSignatureValidationResult {
  isValid: boolean;
  errorCode?:
    | "MISSING_SIGNATURE"
    | "INVALID_SIGNATURE"
    | "TIMESTAMP_EXPIRED"
    | "MALFORMED_TIMESTAMP"
    | "WEBHOOK_REPLAY_DETECTED";
  message?: string;
}

/**
 * Validates HMAC-SHA256 signature and timestamp of inbound webhook payloads.
 */
export function verifyWebhookSignatureDetailed(
  options: WebhookSignatureValidationOptions,
): WebhookSignatureValidationResult {
  const {
    payload,
    signature,
    secret,
    timestamp,
    maxAgeSeconds = 300, // 5 minutes
    algorithm = "sha256",
  } = options;

  if (timestamp !== undefined) {
    let timestampMs: number;
    if (typeof timestamp === "number") {
      timestampMs = timestamp > 1e11 ? timestamp : timestamp * 1000;
    } else {
      const parsed = Date.parse(timestamp);
      timestampMs = !isNaN(parsed) ? parsed : parseInt(timestamp, 10);
      if (isNaN(timestampMs)) {
        return {
          isValid: false,
          errorCode: "MALFORMED_TIMESTAMP",
          message: "Provided webhook timestamp could not be parsed.",
        };
      }
      if (timestampMs < 1e11) {
        timestampMs *= 1000;
      }
    }

    const now = Date.now();
    const ageSeconds = Math.abs(now - timestampMs) / 1000;

    if (ageSeconds > maxAgeSeconds) {
      return {
        isValid: false,
        errorCode: "TIMESTAMP_EXPIRED",
        message: `Webhook timestamp outside permitted window (${Math.round(ageSeconds)}s > ${maxAgeSeconds}s).`,
      };
    }
  }

  if (!secret) {
    return { isValid: true };
  }

  if (!signature) {
    return {
      isValid: false,
      errorCode: "MISSING_SIGNATURE",
      message: "Missing signature header for signed webhook.",
    };
  }

  try {
    const rawPayloadString = Buffer.isBuffer(payload)
      ? payload.toString("utf8")
      : payload;

    let cleanSignature = signature.replace(/^(sha256=|sha1=)/i, "").trim();
    let headerTimestamp = timestamp;

    if (signature.includes("t=") || signature.includes("v1=")) {
      const parts = signature.split(",");
      const v1Part = parts.find((p) => p.trim().startsWith("v1="));
      const tPart = parts.find((p) => p.trim().startsWith("t="));
      if (v1Part) {
        cleanSignature = v1Part.trim().slice(3);
      }
      if (tPart && headerTimestamp === undefined) {
        headerTimestamp = Number(tPart.trim().slice(2));
      }
    }

    const signatureBuffer = Buffer.from(cleanSignature, "hex");

    const candidates = [rawPayloadString];
    if (headerTimestamp !== undefined) {
      candidates.unshift(`${headerTimestamp}.${rawPayloadString}`);
    }

    for (const candidate of candidates) {
      const hmac = crypto.createHmac(algorithm, secret);
      hmac.update(candidate);
      const expected = hmac.digest("hex");
      const expectedBuffer = Buffer.from(expected, "hex");

      if (
        expectedBuffer.length === signatureBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
      ) {
        return { isValid: true };
      }
    }

    return {
      isValid: false,
      errorCode: "INVALID_SIGNATURE",
      message: "Webhook cryptographic signature did not match expected value.",
    };
  } catch (err: any) {
    return {
      isValid: false,
      errorCode: "INVALID_SIGNATURE",
      message: `Signature verification failed: ${err.message}`,
    };
  }
}

export function verifyWebhookSignature(
  options: WebhookSignatureValidationOptions,
): boolean {
  return verifyWebhookSignatureDetailed(options).isValid;
}

/**
 * Computes an HMAC signature for a webhook payload.
 */
export function signWebhookPayload(
  secret: string,
  payload: string | Buffer | Record<string, unknown>,
  timestamp?: number | string,
  algorithm: "sha256" | "sha1" = "sha256",
): { signature: string; headerValue: string; timestamp: number } {
  const ts =
    typeof timestamp === "number"
      ? timestamp
      : timestamp
        ? Date.parse(String(timestamp))
        : Date.now();
  const rawPayload = Buffer.isBuffer(payload)
    ? payload.toString("utf8")
    : typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

  const signedContent = `${ts}.${rawPayload}`;
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(signedContent);
  const signatureHex = hmac.digest("hex");

  return {
    signature: signatureHex,
    headerValue: `t=${ts},v1=${signatureHex}`,
    timestamp: ts,
  };
}

/**
 * Enterprise FlowForge Typed SDK Client
 */
export interface FlowForgeClientOptions {
  baseUrl?: string;
  apiKey?: string;
  organizationId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface FlowForgeRequestOptions {
  idempotencyKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retryOnRateLimit?: boolean;
}

export class FlowForgeClient {
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly organizationId?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: FlowForgeClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:3001").replace(
      /\/+$/,
      "",
    );
    this.apiKey = options.apiKey;
    this.organizationId = options.organizationId;
    this.timeoutMs = options.timeoutMs || 10000;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.retryDelayMs = options.retryDelayMs || 500;
  }

  public async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options: FlowForgeRequestOptions = {},
  ): Promise<ApiResponseEnvelope<T>> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };

    if (body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
      headers["X-API-Key"] = this.apiKey;
    }

    if (this.organizationId) {
      headers["X-Organization-Id"] = this.organizationId;
    }

    const idempotencyKey =
      options.idempotencyKey ||
      (method !== "GET" && method !== "HEAD"
        ? `sdk_${crypto.randomUUID()}`
        : undefined);

    if (
      idempotencyKey &&
      !headers["Idempotency-Key"] &&
      !headers["X-Idempotency-Key"]
    ) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    let attempt = 0;
    const maxAttempts =
      (options.retryOnRateLimit !== false ? this.maxRetries : 0) + 1;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          options.timeoutMs || this.timeoutMs,
        );

        const fetchInit: RequestInit = {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        };

        const res = await fetch(url, fetchInit);
        clearTimeout(timeout);

        const responseText = await res.text();
        let parsed: any;
        try {
          parsed = responseText ? JSON.parse(responseText) : null;
        } catch {
          parsed = {
            success: res.ok,
            data: responseText,
            error: res.ok
              ? null
              : {
                  code: "HTTP_ERROR",
                  message: `Server returned HTTP ${res.status}`,
                  requestId: res.headers.get("x-request-id") || "unknown",
                  retryable: res.status === 429 || res.status === 503,
                },
          };
        }

        const isRetryableStatus = res.status === 429 || res.status === 503;
        const retryableInPayload = parsed?.error?.retryable === true;

        if (
          (isRetryableStatus || retryableInPayload) &&
          attempt < maxAttempts &&
          options.retryOnRateLimit !== false
        ) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader
            ? parseInt(retryAfterHeader, 10) * 1000
            : this.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, Math.min(retryAfterMs, 5000)));
          continue;
        }

        return parsed as ApiResponseEnvelope<T>;
      } catch (err: any) {
        if (attempt < maxAttempts) {
          await new Promise((r) =>
            setTimeout(r, this.retryDelayMs * Math.pow(2, attempt - 1)),
          );
          continue;
        }
        return {
          success: false,
          data: null,
          error: {
            code: "CLIENT_NETWORK_ERROR",
            message: err.message || "Failed to complete HTTP request",
            requestId: "sdk_err",
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      data: null,
      error: {
        code: "MAX_RETRIES_EXCEEDED",
        message: `Exceeded ${maxAttempts} request attempts.`,
        requestId: "sdk_err",
        retryable: false,
      },
    };
  }

  public get<T = unknown>(path: string, options?: FlowForgeRequestOptions) {
    return this.request<T>("GET", path, undefined, options);
  }

  public post<T = unknown>(
    path: string,
    body?: unknown,
    options?: FlowForgeRequestOptions,
  ) {
    return this.request<T>("POST", path, body, options);
  }

  public patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: FlowForgeRequestOptions,
  ) {
    return this.request<T>("PATCH", path, body, options);
  }

  public delete<T = unknown>(path: string, options?: FlowForgeRequestOptions) {
    return this.request<T>("DELETE", path, undefined, options);
  }

  public verifyWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string,
    timestamp?: string | number,
  ) {
    return verifyWebhookSignature({ payload, signature, secret, timestamp });
  }
}
