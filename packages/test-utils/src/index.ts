import { WorkflowDefinition, Role } from "@flowforge/shared";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
  billingEmail?: string | null;
  enforce2FA?: boolean;
  allowedIpRanges?: string[];
  executionRetentionDays?: number;
  auditRetentionDays?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
}

export interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  draftDefinition: WorkflowDefinition;
  draftRevision?: number;
  publishedVersionId?: string;
  createdById?: string;
  sourceTemplateId?: string;
  sourceTemplateVersionId?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export interface WorkflowVersionRecord {
  id: string;
  workflowId: string;
  versionNumber: number;
  definition: WorkflowDefinition;
  contentHash?: string;
  releaseNotes?: string;
  publishedAt: Date;
  publishedById?: string;
}

export interface WorkflowExecutionRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersionId: string;
  environment?: "development" | "staging" | "production";
  triggerType: "MANUAL" | "WEBHOOK" | "SCHEDULE";
  triggerPayload: Record<string, unknown>;
  idempotencyKey?: string;
  status:
    | "QUEUED"
    | "RUNNING"
    | "WAITING_APPROVAL"
    | "WAITING_DELAY"
    | "RETRYING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED";
  contextData: Record<string, unknown>;
  currentNodeId?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  errorDetails?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDeploymentRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersionId: string;
  environment: "development" | "staging" | "production";
  status: "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK";
  deployedById?: string;
  deployedAt: Date;
  previousVersionId?: string;
  releaseNotes?: string;
  rollbackReason?: string;
  idempotencyKey?: string;
}

export interface ExecutionStepRecord {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status:
    "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "WAITING";
  inputPayload?: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  attempt: number;
}

export interface ApprovalRecord {
  id: string;
  organizationId: string;
  executionId: string;
  stepId: string;
  title: string;
  description?: string;
  requiredRole: Role;
  status: "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT";
  decisionComment?: string;
  decidedById?: string;
  decidedAt?: Date;
  assignedUserId?: string;
  expiresAt?: Date;
  timeoutPolicy?: "REJECT" | "FAIL";
  createdAt: Date;
}

export interface WebhookConfigRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  name: string;
  enabled: boolean;
  signingSecret: string;
  eventFilter?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEventRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  webhookId?: string;
  idempotencyKey?: string;
  source?: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "PROCESSED" | "FAILED";
  executionId?: string;
  createdAt: Date;
}

export interface ScheduleRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  name: string;
  cronExpression?: string;
  scheduledAt?: Date;
  timezone: string;
  enabled: boolean;
  misfirePolicy: "RUN_ONCE" | "SKIP";
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialRecord {
  id: string;
  organizationId: string;
  name: string;
  type: "API_KEY" | "BEARER_TOKEN" | "BASIC_AUTH" | "SMTP";
  encryptedData: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DelayRecord {
  id: string;
  executionId: string;
  stepId: string;
  resumeAt: Date;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
}

export interface OperationalAlertRecord {
  id: string;
  organizationId: string;
  workflowId?: string;
  ruleType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED";
  title: string;
  message: string;
  contextJson?: Record<string, unknown>;
  triggeredAt: Date;
  resolvedAt?: Date;
  resolvedById?: string;
  resolutionNote?: string;
  dedupKey?: string;
}

export interface OrganizationInvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  tokenHash: string;
  inviterId: string;
  expiresAt: Date;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  createdById: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export interface IntegrationConnectionRecord {
  id: string;
  organizationId: string;
  connectorId: string;
  name: string;
  status: "ACTIVE" | "DISABLED" | "REVOKED";
  authType: string;
  encryptedData: string;
  metadata?: Record<string, unknown>;
  lastTestedAt?: Date;
  lastTestStatus?: string;
  createdById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTemplateRecord {
  id: string;
  organizationId?: string | null;
  name: string;
  shortDescription: string;
  description?: string | null;
  category: string;
  tags: string[];
  visibility: "PRIVATE" | "ORGANIZATION" | "PLATFORM";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  draftDefinition: WorkflowDefinition;
  requiredConnections: string[];
  requiredInputs: Record<string, unknown>;
  usageCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  createdById?: string | null;
  publishedVersionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTemplateVersionRecord {
  id: string;
  templateId: string;
  versionNumber: number;
  definition: WorkflowDefinition;
  requiredConnections: string[];
  requiredInputs: Record<string, unknown>;
  contentHash: string;
  releaseNotes?: string | null;
  publishedById?: string | null;
  publishedAt: Date;
}

export class InMemoryDatabase {
  public users = new Map<string, UserRecord>();
  public organizations = new Map<string, OrganizationRecord>();
  public memberships = new Map<string, MembershipRecord>();
  public sessions = new Map<string, SessionRecord>();
  public workflows = new Map<string, WorkflowRecord>();
  public versions = new Map<string, WorkflowVersionRecord>();
  public executions = new Map<string, WorkflowExecutionRecord>();
  public steps = new Map<string, ExecutionStepRecord>();
  public approvals = new Map<string, ApprovalRecord>();
  public webhooks = new Map<string, WebhookConfigRecord>();
  public webhookEvents = new Map<string, WebhookEventRecord>();
  public schedules = new Map<string, ScheduleRecord>();
  public credentials = new Map<string, CredentialRecord>();
  public delays = new Map<string, DelayRecord>();
  public deployments = new Map<string, WorkflowDeploymentRecord>();
  public alerts = new Map<string, OperationalAlertRecord>();
  public invitations = new Map<string, OrganizationInvitationRecord>();
  public apiKeys = new Map<string, ApiKeyRecord>();
  public connections = new Map<string, IntegrationConnectionRecord>();
  public templates = new Map<string, WorkflowTemplateRecord>();
  public templateVersions = new Map<string, WorkflowTemplateVersionRecord>();
  public auditLogs: Array<AuditLogRecord> = [];

  public recordAudit(record: Omit<AuditLogRecord, "id" | "createdAt">): AuditLogRecord {
    const auditRecord: AuditLogRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      ...record,
    };
    this.auditLogs.push(auditRecord);
    return auditRecord;
  }

  public clear(): void {
    this.users.clear();
    this.organizations.clear();
    this.memberships.clear();
    this.sessions.clear();
    this.workflows.clear();
    this.versions.clear();
    this.executions.clear();
    this.steps.clear();
    this.approvals.clear();
    this.webhooks.clear();
    this.webhookEvents.clear();
    this.schedules.clear();
    this.credentials.clear();
    this.delays.clear();
    this.deployments.clear();
    this.alerts.clear();
    this.invitations.clear();
    this.apiKeys.clear();
    this.connections.clear();
    this.templates.clear();
    this.templateVersions.clear();
    this.auditLogs = [];
  }
}

export const sampleOrderWorkflow: WorkflowDefinition = {
  nodes: [
    {
      id: "node_trigger",
      type: "TRIGGER",
      name: "Order Webhook",
      config: { triggerType: "WEBHOOK", webhookPath: "/orders" },
      position: { x: 100, y: 50 },
    },
    {
      id: "node_condition",
      type: "CONDITION",
      name: "Check Order > $10,000",
      config: { expression: "trigger.payload.orderValue > 10000" },
      position: { x: 100, y: 180 },
    },
    {
      id: "node_approval",
      type: "APPROVAL",
      name: "Manager Approval Required",
      config: {
        title: "High Value Order Approval",
        requiredRole: "ADMIN",
        timeoutSeconds: 86400,
      },
      position: { x: 260, y: 320 },
    },
    {
      id: "node_email",
      type: "EMAIL",
      name: "Send Customer Confirmation",
      config: {
        to: "customer@example.com",
        subject: "Order Processed",
        template:
          "Your order of ${{trigger.payload.orderValue}} has been approved!",
      },
      position: { x: -60, y: 320 },
    },
    {
      id: "node_end",
      type: "END",
      name: "Workflow Complete",
      config: {},
      position: { x: 100, y: 480 },
    },
  ],
  edges: [
    { id: "e1", source: "node_trigger", target: "node_condition" },
    {
      id: "e2_true",
      source: "node_condition",
      sourceHandle: "true",
      target: "node_approval",
    },
    {
      id: "e2_false",
      source: "node_condition",
      sourceHandle: "false",
      target: "node_email",
    },
    { id: "e3", source: "node_approval", target: "node_email" },
    { id: "e4", source: "node_email", target: "node_end" },
  ],
};
