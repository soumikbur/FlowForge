import crypto from "crypto";
import {
  WorkflowDefinition,
  Role,
  OperationalIncidentRecord,
  PlanRecord,
  SubscriptionRecord,
  UsageRecord,
  InvoiceRecord,
  BillingWebhookEventRecord,
  DEFAULT_PLANS,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  OrganizationBrandingRecord,
  CustomDomainRecord,
  EnterpriseLicenseRecord,
  SsoConfigurationRecord,
  ExternalIdentityRecord,
  GroupRoleMappingRecord,
  ScimTokenRecord,
  OAuthClientRecord,
  IdempotencyRecord,
  RetentionPolicyRecord,
  RetentionJobRecord,
  PrivacyRequestRecord,
  LegalHoldRecord,
  ComplianceControlItem,
  AiConfigurationRecord,
  ProcessEventRecord,
  BusinessOutcomeRecord,
  WorkflowSloRecord,
  StreamEventRecord,
  EventDeduplicationRecord,
  ConnectorSubscriptionRecord,
  EventMetricsSummary,
  EventReplayPreviewResult,
  EventReplayResult,
  EventRedriveResult,
  ExtensionPackageRecord,
  ExtensionVersionRecord,
  ExtensionInstallationRecord,
  UpgradePreviewResult,
  ExtensionManifest,
  DeclaredCustomNode,
  ExecutionLeaseRecord,
  ScheduleExecutionClaimRecord,
  StepReconciliationRecord,
  HealthReadinessDetails,
  ReconcileExecutionStepRequest,
  SearchableResourceTypeEnum,
  SearchableResourceType,
  SearchQuery,
  SearchResultItem,
  UnifiedSearchResponse,
  SavedSearchRecord,
  CreateSavedSearchRequest,
  SearchMetricsSummary,
  PolicyRecord,
  PolicyVersionRecord,
  PolicyExceptionRecord,
  PolicyViolationRecord,
  PolicyRule,
  PolicyRuleCondition,
  PolicyEvaluationContext,
  PolicyEvaluationDecision,
  RoiAssumptionRecord,
  SavedReportRecord,
  ResourceQuotaRecord,
  ResourceReservationRecord,
  WorkflowTestCaseRecord,
  WorkflowTestRunRecord,
  TestFixtureRecord,
  DebugSessionRecord,
  PublishingGateConfigRecord,
} from "@flowforge/shared";

export type {
  WorkflowTestCaseRecord,
  WorkflowTestRunRecord,
  TestFixtureRecord,
  DebugSessionRecord,
  PublishingGateConfigRecord,
  ResourceQuotaRecord,
  ResourceReservationRecord,
  RoiAssumptionRecord,
  SavedReportRecord,
  PolicyRecord,
  PolicyVersionRecord,
  PolicyExceptionRecord,
  PolicyViolationRecord,
  PolicyRule,
  PolicyRuleCondition,
  PolicyEvaluationContext,
  PolicyEvaluationDecision,
  OperationalIncidentRecord,
  PlanRecord,
  SubscriptionRecord,
  UsageRecord,
  InvoiceRecord,
  BillingWebhookEventRecord,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  OrganizationBrandingRecord,
  CustomDomainRecord,
  EnterpriseLicenseRecord,
  SsoConfigurationRecord,
  ExternalIdentityRecord,
  GroupRoleMappingRecord,
  ScimTokenRecord,
  OAuthClientRecord,
  IdempotencyRecord,
  RetentionPolicyRecord,
  RetentionJobRecord,
  PrivacyRequestRecord,
  LegalHoldRecord,
  ComplianceControlItem,
  AiConfigurationRecord,
  ProcessEventRecord,
  BusinessOutcomeRecord,
  WorkflowSloRecord,
  StreamEventRecord,
  EventDeduplicationRecord,
  ConnectorSubscriptionRecord,
  EventMetricsSummary,
  EventReplayPreviewResult,
  EventReplayResult,
  EventRedriveResult,
  ExtensionPackageRecord,
  ExtensionVersionRecord,
  ExtensionInstallationRecord,
  UpgradePreviewResult,
  ExtensionManifest,
  DeclaredCustomNode,
  ExecutionLeaseRecord,
  ScheduleExecutionClaimRecord,
  StepReconciliationRecord,
  HealthReadinessDetails,
  ReconcileExecutionStepRequest,
  SearchableResourceTypeEnum,
  SearchableResourceType,
  SearchQuery,
  SearchResultItem,
  UnifiedSearchResponse,
  SavedSearchRecord,
  CreateSavedSearchRequest,
  SearchMetricsSummary,
};

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
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
  ipAddress?: string;
  userAgent?: string;
  lastActivityAt?: Date;
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
  lastUpdatedById?: string;
  sourceTemplateId?: string;
  sourceTemplateVersionId?: string;
  workspaceId?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  actorType?: "USER" | "API_KEY" | "OAUTH_CLIENT" | "SYSTEM" | string;
  actorId?: string;
  authMethod?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED" | string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  recordHash?: string;
  prevRecordHash?: string;
  createdAt: Date;
}

export function sanitizeAuditMetadata(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const REDACT_PATTERN =
    /password|secret|token|key|authorization|apiKey|clientSecret/i;
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_PATTERN.test(k)) {
      result[k] = "[REDACTED]";
    } else if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      result[k] = sanitizeAuditMetadata(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
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
  triggerType: "MANUAL" | "WEBHOOK" | "SCHEDULE" | "EVENT";
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
  secondarySigningSecret?: string | null;
  secretRotatedAt?: Date | null;
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
  workspaceId?: string;
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

export interface WorkflowCollaboratorRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  userId: string;
  role: "MAINTAINER" | "EDITOR" | "VIEWER";
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowCommentRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  userId: string;
  content: string;
  nodeId?: string | null;
  parentId?: string | null;
  draftRevision?: number | null;
  isResolved: boolean;
  resolvedById?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowActivityRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  userId?: string | null;
  type:
    | "WORKFLOW_CREATED"
    | "DRAFT_UPDATED"
    | "WORKFLOW_PUBLISHED"
    | "OWNERSHIP_TRANSFERRED"
    | "COLLABORATOR_ADDED"
    | "COLLABORATOR_REMOVED"
    | "COLLABORATOR_ROLE_UPDATED"
    | "COMMENT_ADDED"
    | "COMMENT_RESOLVED"
    | "COMMENT_DELETED";
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface OutboxEventRecord {
  id: string;
  organizationId: string;
  eventType: string;
  payload: any;
  status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  attemptCount: number;
  lastAttemptAt?: Date | null;
  error?: string | null;
  createdAt: Date;
  publishedAt?: Date | null;
}

export interface NotificationRecord {
  id: string;
  organizationId: string;
  userId: string;
  eventId?: string | null;
  title: string;
  message: string;
  category: "WORKFLOW" | "APPROVAL" | "COLLABORATION" | "SYSTEM" | "SECURITY";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  isRead: boolean;
  readAt?: Date | null;
  resourceType?: string | null;
  resourceId?: string | null;
  linkUrl?: string | null;
  createdAt: Date;
}

export interface NotificationPreferenceRecord {
  id: string;
  organizationId: string;
  userId: string;
  category: "WORKFLOW" | "APPROVAL" | "COLLABORATION" | "SYSTEM" | "SECURITY";
  inApp: boolean;
  email: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookSubscriptionRecord {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string;
  secondarySecret?: string | null;
  secretRotatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  eventId: string;
  url: string;
  status:
    | "PENDING"
    | "PROCESSING"
    | "SUCCEEDED"
    | "DELIVERED"
    | "RETRY_SCHEDULED"
    | "FAILED_PERMANENTLY"
    | "DEAD_LETTERED";
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date | null;
  statusCode?: number | null;
  durationMs?: number | null;
  error?: string | null;
  requestPayload: Record<string, unknown>;
  responseBody?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface WorkflowImportRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  sourceWorkflowId?: string | null;
  sourceRevision?: number | null;
  packageHash: string;
  packageFormatVersion: string;
  conflictStrategy: "CREATE_NEW" | "RENAME" | "REPLACE_DRAFT";
  strategy?: "CREATE_NEW" | "RENAME" | "REPLACE_DRAFT";
  connectorMappings: Record<string, string>;
  compatibilityStatus: string;
  importedById?: string | null;
  createdAt: Date;
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
  public incidents = new Map<string, OperationalIncidentRecord>();
  public invitations = new Map<string, OrganizationInvitationRecord>();
  public apiKeys = new Map<string, ApiKeyRecord>();
  public connections = new Map<string, IntegrationConnectionRecord>();
  public templates = new Map<string, WorkflowTemplateRecord>();
  public templateVersions = new Map<string, WorkflowTemplateVersionRecord>();
  public collaborators = new Map<string, WorkflowCollaboratorRecord>();
  public comments = new Map<string, WorkflowCommentRecord>();
  public activities: Array<WorkflowActivityRecord> = [];
  public auditLogs: Array<AuditLogRecord> = [];
  public outboxEvents = new Map<string, OutboxEventRecord>();
  public notifications = new Map<string, NotificationRecord>();
  public notificationPreferences = new Map<
    string,
    NotificationPreferenceRecord
  >();
  public webhookSubscriptions = new Map<string, WebhookSubscriptionRecord>();
  public webhookDeliveries = new Map<string, WebhookDeliveryRecord>();
  public workflowImports = new Map<string, WorkflowImportRecord>();
  public plans = new Map<string, PlanRecord>();
  public subscriptions = new Map<string, SubscriptionRecord>();
  public usageRecords = new Map<string, UsageRecord>();
  public invoices = new Map<string, InvoiceRecord>();
  public billingWebhookEvents = new Map<string, BillingWebhookEventRecord>();
  public workspaces = new Map<string, WorkspaceRecord>();
  public workspaceMembers = new Map<string, WorkspaceMemberRecord>();
  public brandings = new Map<string, OrganizationBrandingRecord>();
  public customDomains = new Map<string, CustomDomainRecord>();
  public enterpriseLicenses = new Map<string, EnterpriseLicenseRecord>();
  public ssoConfigurations = new Map<string, SsoConfigurationRecord>();
  public externalIdentities = new Map<string, ExternalIdentityRecord>();
  public groupRoleMappings = new Map<string, GroupRoleMappingRecord>();
  public scimTokens = new Map<string, ScimTokenRecord>();
  public oauthClients = new Map<string, OAuthClientRecord>();
  public idempotencyRecords = new Map<string, IdempotencyRecord>();
  public retentionPolicies = new Map<string, RetentionPolicyRecord>();
  public retentionJobs = new Map<string, RetentionJobRecord>();
  public privacyRequests = new Map<string, PrivacyRequestRecord>();
  public legalHolds = new Map<string, LegalHoldRecord>();
  public aiConfigurations = new Map<string, AiConfigurationRecord>();
  public slos = new Map<string, WorkflowSloRecord>();
  public businessOutcomes = new Map<string, BusinessOutcomeRecord>();
  public processEvents: Array<ProcessEventRecord> = [];
  public streamEvents = new Map<string, StreamEventRecord>();
  public eventDeduplications = new Map<string, EventDeduplicationRecord>();
  public connectorSubscriptions = new Map<
    string,
    ConnectorSubscriptionRecord
  >();
  public extensionPackages = new Map<string, ExtensionPackageRecord>();
  public extensionVersions = new Map<string, ExtensionVersionRecord>();
  public extensionInstallations = new Map<
    string,
    ExtensionInstallationRecord
  >();
  public executionLeases = new Map<string, ExecutionLeaseRecord>();
  public scheduleClaims = new Map<string, ScheduleExecutionClaimRecord>();
  public stepReconciliations = new Map<string, StepReconciliationRecord>();
  public savedSearches = new Map<string, SavedSearchRecord>();
  public policies = new Map<string, PolicyRecord>();
  public policyVersions = new Map<string, PolicyVersionRecord>();
  public policyExceptions = new Map<string, PolicyExceptionRecord>();
  public policyViolations = new Map<string, PolicyViolationRecord>();
  public roiAssumptions = new Map<string, RoiAssumptionRecord>();
  public savedReports = new Map<string, SavedReportRecord>();
  public resourceQuotas = new Map<string, ResourceQuotaRecord>();
  public resourceReservations = new Map<string, ResourceReservationRecord>();
  public workflowTestCases = new Map<string, WorkflowTestCaseRecord>();
  public workflowTestRuns = new Map<string, WorkflowTestRunRecord>();
  public testFixtures = new Map<string, TestFixtureRecord>();
  public debugSessions = new Map<string, DebugSessionRecord>();
  public publishingGateConfigs = new Map<string, PublishingGateConfigRecord>();

  constructor() {
    for (const plan of Object.values(DEFAULT_PLANS)) {
      this.plans.set(plan.id, { ...plan });
      this.plans.set(plan.slug, { ...plan });
    }
  }

  public publishOutboxEvent(event: any): OutboxEventRecord {
    const outboxRecord: OutboxEventRecord = {
      id:
        event.id ||
        `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: event.organizationId,
      eventType: event.type,
      payload: event,
      status: "PENDING",
      attemptCount: 0,
      createdAt: new Date(),
    };
    this.outboxEvents.set(outboxRecord.id, outboxRecord);
    return outboxRecord;
  }

  public createNotification(
    record: Omit<
      NotificationRecord,
      "id" | "createdAt" | "isRead" | "readAt"
    > & {
      isRead?: boolean;
      readAt?: Date | null;
    },
  ): NotificationRecord {
    const notif: NotificationRecord = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      isRead: record.isRead ?? false,
      readAt: record.readAt ?? null,
      ...record,
    };
    this.notifications.set(notif.id, notif);
    return notif;
  }

  public recordAudit(
    record: Omit<
      AuditLogRecord,
      "id" | "createdAt" | "recordHash" | "prevRecordHash"
    > & {
      id?: string;
      createdAt?: Date;
      recordHash?: string;
      prevRecordHash?: string;
    },
  ): AuditLogRecord {
    const auditId =
      record.id ||
      `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = record.createdAt || new Date();

    // Sensitive metadata sanitization
    const sanitizedMetadata = record.metadata
      ? sanitizeAuditMetadata(record.metadata)
      : undefined;

    // Tamper-evident hash chaining per organization
    const orgLogs = this.auditLogs.filter(
      (l) => l.organizationId === record.organizationId,
    );
    const lastLog =
      orgLogs.length > 0 ? orgLogs[orgLogs.length - 1] : undefined;
    const prevRecordHash =
      record.prevRecordHash || lastLog?.recordHash || "GENESIS_HASH";

    const hashPayload = `${prevRecordHash}:${auditId}:${now.toISOString()}:${record.organizationId}:${record.action}:${record.resourceType}:${record.resourceId}:${record.outcome || "SUCCESS"}:${JSON.stringify(sanitizedMetadata || {})}`;
    const recordHash =
      record.recordHash ||
      crypto.createHash("sha256").update(hashPayload).digest("hex");

    const auditRecord: AuditLogRecord = {
      id: auditId,
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      userId: record.userId,
      actorType: record.actorType || (record.userId ? "USER" : "SYSTEM"),
      actorId: record.actorId || record.userId,
      authMethod: record.authMethod,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      outcome: record.outcome || "SUCCESS",
      metadata: sanitizedMetadata,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      correlationId: record.correlationId,
      recordHash,
      prevRecordHash,
      createdAt: now,
    };

    this.auditLogs.push(auditRecord);
    return auditRecord;
  }

  public recordActivity(
    record: Omit<WorkflowActivityRecord, "id" | "createdAt">,
  ): WorkflowActivityRecord {
    const activityRecord: WorkflowActivityRecord = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      ...record,
    };
    this.activities.push(activityRecord);
    return activityRecord;
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
    this.incidents.clear();
    this.invitations.clear();
    this.apiKeys.clear();
    this.connections.clear();
    this.templates.clear();
    this.templateVersions.clear();
    this.collaborators.clear();
    this.comments.clear();
    this.outboxEvents.clear();
    this.notifications.clear();
    this.notificationPreferences.clear();
    this.webhookSubscriptions.clear();
    this.webhookDeliveries.clear();
    this.workflowImports.clear();
    this.subscriptions.clear();
    this.usageRecords.clear();
    this.invoices.clear();
    this.billingWebhookEvents.clear();
    this.workspaces.clear();
    this.workspaceMembers.clear();
    this.brandings.clear();
    this.customDomains.clear();
    this.enterpriseLicenses.clear();
    this.ssoConfigurations.clear();
    this.externalIdentities.clear();
    this.groupRoleMappings.clear();
    this.scimTokens.clear();
    this.oauthClients.clear();
    this.idempotencyRecords.clear();
    this.retentionPolicies.clear();
    this.retentionJobs.clear();
    this.privacyRequests.clear();
    this.legalHolds.clear();
    this.aiConfigurations.clear();
    this.slos.clear();
    this.businessOutcomes.clear();
    this.processEvents = [];
    this.streamEvents.clear();
    this.eventDeduplications.clear();
    this.connectorSubscriptions.clear();
    this.extensionPackages.clear();
    this.extensionVersions.clear();
    this.extensionInstallations.clear();
    this.executionLeases.clear();
    this.scheduleClaims.clear();
    this.stepReconciliations.clear();
    this.savedSearches.clear();
    this.policies.clear();
    this.policyVersions.clear();
    this.policyExceptions.clear();
    this.policyViolations.clear();
    this.roiAssumptions.clear();
    this.savedReports.clear();
    this.resourceQuotas.clear();
    this.resourceReservations.clear();
    this.workflowTestCases.clear();
    this.workflowTestRuns.clear();
    this.testFixtures.clear();
    this.debugSessions.clear();
    this.publishingGateConfigs.clear();
    this.plans.clear();
    for (const plan of Object.values(DEFAULT_PLANS)) {
      this.plans.set(plan.id, { ...plan });
      this.plans.set(plan.slug, { ...plan });
    }
    this.activities = [];
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
