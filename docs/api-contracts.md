# FlowForge REST API Contracts

All endpoints return a standardized envelope structure:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { "page": 1, "pageSize": 20, "total": 100 }
}
```

In case of errors:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid workflow graph",
    "details": [ ... ]
  }
}
```

## Global Headers & Observability Conventions

- `X-Correlation-Id`: Client-supplied or server-generated unique correlation ID for distributed request tracing. Emitted on all API responses and structured JSON application logs.

---

## 1. Health & Dependency Readiness Endpoints

- `GET /health`: Basic process liveness check. Returns 200 with `{ status: "healthy", uptime, timestamp }`.
- `GET /ready`: Dependency readiness probe. Tests database and Redis availability. Returns 200 with `{ status: "ready", dependencies: { database: "connected" } }` or 503 if disconnected.

## 2. Authentication & Organization Endpoints

- `POST /api/v1/auth/register`: Create user and primary organization (transactional).
- `POST /api/v1/auth/login`: Authenticate and issue secure session cookie.
- `POST /api/v1/auth/logout`: Invalidate current session and clear cookie.
- `GET /api/v1/auth/me`: Retrieve current user profile, active organization context, and RBAC permissions.
- `GET /api/v1/organizations`: List all organizations where the caller holds membership.
- `POST /api/v1/organizations`: Create new organization (assigns caller as `OWNER`).
- `GET /api/v1/organizations/:organizationId`: Retrieve organization details.
- `PATCH /api/v1/organizations/:organizationId`: Update organization details (requires `org:write`).
- `GET /api/v1/organizations/:organizationId/members`: List members and assigned roles (requires `org:members:read`).
- `POST /api/v1/organizations/:organizationId/members`: Invite/add member (requires `org:members:write`; non-owners cannot assign `OWNER`).
- `PATCH /api/v1/organizations/:organizationId/members/:membershipId`: Update member role (enforces Last Owner Protection; requires `org:members:write`).
- `DELETE /api/v1/organizations/:organizationId/members/:membershipId`: Remove member from organization (enforces Last Owner Protection; requires `org:members:delete`).
- `GET /api/v1/organizations/:organizationId/audit-logs`: Query organization audit log events with pagination (`?page=1&pageSize=20`; requires `audit:read`).

## 3. Workflows Endpoints

- `GET /api/v1/workflows`: List workflows with pagination and filters (`?status=ACTIVE&search=order`).
- `POST /api/v1/workflows`: Create new workflow draft.
- `GET /api/v1/workflows/:id`: Retrieve workflow draft details and latest version.
- `PATCH /api/v1/workflows/:id`: Update workflow draft (name, description, nodes, edges).
- `DELETE /api/v1/workflows/:id`: Soft delete / archive workflow.
- `POST /api/v1/workflows/:id/validate`: Run graph validation checks on draft without publishing.
- `POST /api/v1/workflows/:id/publish`: Validate and publish draft as a new immutable version.
- `GET /api/v1/workflows/:id/versions`: List all published versions.
- `GET /api/v1/workflows/:id/versions/:versionId`: Retrieve specific historical version.

## 4. Workflow Execution Endpoints

- `POST /api/v1/workflows/:id/trigger`: Manually trigger execution of published workflow with payload. Supports `Idempotency-Key` header.
- `POST /api/v1/workflows/:id/execute`: Dispatch execution of published workflow with payload. Supports `Idempotency-Key` header to prevent duplicate execution. Returns HTTP 202 on initial dispatch, HTTP 200 with `{ idempotent: true }` on duplicate key match.
- `GET /api/v1/executions`: List executions with pagination and filtering (`?page=1&pageSize=20&status=FAILED&workflowId=...`).
- `GET /api/v1/executions/:id`: Retrieve complete execution record, step results, approvals, and timeline.
- `GET /api/v1/executions/:id/steps`: Retrieve ordered step execution timeline with attempt counts and input/output payloads.
- `POST /api/v1/executions/:id/cancel`: Cancel an active or queued execution with optional `{ reason }`. Transitions state to `CANCELLED`, aborts in-flight handlers, marks running steps as `SKIPPED`, cancels pending delays, rejects/invalidates pending approvals, and records cancellation audit entry. Rejects cancellation of terminal executions with HTTP 400 `INVALID_TRANSITION`.
- `POST /api/v1/executions/:id/retry`: Retry failed execution with optional `{ stepId, reason }`. Resets failed step or designated step to `PENDING`, clears error details, increments attempt and retry counts, transitions execution to `QUEUED`, and resumes execution. Rejects retry on non-failed executions with HTTP 400 `INVALID_STATE`.

## 5. Approvals Endpoints

- `GET /api/v1/approvals`: List pending and historical approvals with pagination and filters (`?status=PENDING&assignedToMe=true&page=1&pageSize=20`). Returns enriched approval objects with workflow and execution metadata.
- `GET /api/v1/approvals/:id`: Retrieve single approval request with full execution context, step summary, decider details, and assignee details.
- `POST /api/v1/approvals/:id/decide`: Submit decision (`APPROVE` or `REJECT`) with optional comment. Enforces atomic conflict guard (HTTP 409 `ALREADY_DECIDED`), self-approval prevention (HTTP 403 `SELF_APPROVAL_FORBIDDEN` for workflow creators unless explicitly allowed or caller is `OWNER`), and assignee/role authorization (HTTP 403 `NOT_ASSIGNED` / `INSUFFICIENT_ROLE`). Resumes or terminates workflow execution and logs audit event.
- `POST /api/v1/approvals/:id/reassign`: Reassign an active approval to another organization member or role (`{ assignedUserId?, requiredRole?, reason? }`). Validates target user is an active organization member (HTTP 400 `INVALID_ASSIGNEE`), verifies approval is pending (HTTP 409 `ALREADY_DECIDED`), and records audit entry.

## 6. Webhooks, Schedules & Integration Credentials Endpoints

### 6.1 Webhook Triggers & Configuration
- `POST /api/v1/webhooks/incoming/:id`: Ingest external webhook targeting a registered webhook or workflow. Verifies constant-time HMAC signature (`X-Signature-256`), enforces replay window (`X-Webhook-Timestamp` max 300s), and deduplicates by event ID (`X-Idempotency-Key`).
- `GET /api/v1/webhooks`: List webhook configurations for caller's organization (signing secrets redacted).
- `POST /api/v1/webhooks`: Create webhook configuration for a published workflow (generates `whsec_...` signing secret, returned only upon creation).
- `GET /api/v1/webhooks/config/:id`: Retrieve webhook configuration metadata (secret redacted).
- `PATCH /api/v1/webhooks/config/:id`: Update webhook configuration (name, enabled status, event filters).
- `POST /api/v1/webhooks/config/:id/rotate-secret`: Rotate webhook signing secret (returns new secret once).
- `DELETE /api/v1/webhooks/config/:id`: Delete webhook configuration.
- `GET /api/v1/webhooks/config/:id/deliveries`: Query historical delivery events for the webhook.

### 6.2 Scheduled Triggers
- `GET /api/v1/schedules`: List schedules for caller's organization.
- `POST /api/v1/schedules`: Create schedule for published workflow (supports recurring 5-field cron, one-time execution, IANA timezones, misfire policies; calculates `nextRunAt` in UTC).
- `GET /api/v1/schedules/:id`: Retrieve schedule details.
- `PATCH /api/v1/schedules/:id`: Update schedule definition and recalculate next occurrence.
- `DELETE /api/v1/schedules/:id`: Delete schedule.
- `POST /api/v1/schedules/:id/run-now`: Immediately trigger manual execution of the scheduled workflow.

### 6.3 Integration Credentials
- `GET /api/v1/credentials`: List credentials for caller's organization (secrets and encrypted blobs never exposed).
- `POST /api/v1/credentials`: Register credential (encrypted at rest using AES-256-GCM authenticated encryption).
- `GET /api/v1/credentials/:id`: Retrieve credential metadata.
- `DELETE /api/v1/credentials/:id`: Delete credential.

## 7. Dashboard & Metrics Endpoints

- `GET /api/v1/dashboard/stats`: Returns aggregated stats (total workflows, active, success rate, failed count, pending approvals).
- `GET /api/v1/dashboard/activity`: Recent execution events and alerts.


## 8. Workflow Graph Validation Error Codes

When validating a workflow draft via `POST /api/v1/workflows/:id/validate`, the endpoint returns `{ success: true, data: { isValid: boolean, errors: ValidationError[], warnings: ValidationWarning[] } }`.

| Error Code | Meaning |
| :--- | :--- |
| `EMPTY_GRAPH` | Graph contains zero nodes |
| `RESOURCE_LIMIT_EXCEEDED` | Definition exceeds max nodes (500) or edges (1000) |
| `MISSING_TRIGGER_NODE` | No `TRIGGER` node present in definition |
| `MULTIPLE_TRIGGER_NODES` | More than 1 `TRIGGER` node found |
| `DUPLICATE_NODE_ID` | Multiple nodes share the same identifier |
| `DUPLICATE_EDGE_ID` | Multiple edges share the same identifier |
| `UNKNOWN_NODE_TYPE` | Node type is not recognized by engine registry |
| `INVALID_NODE_CONFIG` | Node config violates Zod schema for its type |
| `MISSING_SOURCE_NODE` | Edge references nonexistent source node |
| `MISSING_TARGET_NODE` | Edge references nonexistent target node |
| `SELF_CONNECTION_NOT_ALLOWED` | Edge has source identical to target |
| `TERMINAL_HAS_OUTGOING_EDGES` | An `END` terminal node has outgoing edges |
| `TRIGGER_HAS_INCOMING_EDGES` | A `TRIGGER` node has inward edges |
| `INVALID_CONDITION_HANDLE` | Condition edge handle is not 'true' or 'false' |
| `INCOMPLETE_CONDITION_BRANCHES` | Condition node missing either 'true' or 'false' edge |
| `UNREACHABLE_NODE` | Node is disconnected/unreachable from trigger |
| `CYCLE_DETECTED` | Directed cycle detected in workflow graph |
| `MISSING_TERMINAL_PATH` | No path from trigger reaches an `END` node |

## 9. Workflow Versioning, Deployments & Environment Promotion Endpoints

### 9.1 Immutability Boundary & Draft Management
- `PATCH /api/v1/workflows/:id`: Update workflow draft metadata or definition. Supports `expectedRevision` body parameter and `If-Match` header. Rejects concurrent modifications with `409 DRAFT_CONFLICT`.
- `POST /api/v1/workflows/:id/publish`: Validate workflow graph, compute canonical content hash (`SHA-256`), prevent duplicate publishing of identical graphs (`409 UNCHANGED_CONTENT`), create immutable `WorkflowVersionRecord`, and automatically deploy to `development`.
- `PUT|PATCH|DELETE /api/v1/workflows/:id/versions/:versionId`: Always rejected with `405 VERSION_IMMUTABLE`.
- `POST /api/v1/workflows/:id/versions/:versionId/create-draft`: Restore a historical immutable version snapshot back into the editable draft definition, incrementing `draftRevision`.

### 9.2 Semantic Version Comparison
- `GET /api/v1/workflows/:id/compare?fromVersionId=:v1&toVersionId=:v2` (alias `baseVersionId`, `targetVersionId`):
  - Returns structured semantic comparison between two published versions or draft (`isIdentical`, `addedNodes`, `removedNodes`, `modifiedNodes`, `addedEdges`, `removedEdges`, `summary`).
  - Automatically redacts sensitive passwords, tokens, API keys, and credential references with `[REDACTED]`.

### 9.3 Multi-Environment Promotion & Deployments
- `GET /api/v1/workflows/:id/deployments`: List deployment history for workflow across all environments sorted by `deployedAt` descending.
- `GET /api/v1/workflows/:id/environments/:environment`: Retrieve the currently active deployment for specified environment (`development`, `staging`, `production`).
- `POST /api/v1/workflows/:id/promote` (alias `POST /:id/deploy`):
  - Promotes a published version to `targetEnvironment` (`development`, `staging`, `production`).
  - Supports `idempotency-key` header to prevent duplicate deployment transactions.
  - Verifies version content hash integrity against definition AST before promotion (`422 HASH_VERIFICATION_FAILED`).
  - Enforces elevated production RBAC: restricts `MEMBER` from deploying to `production` (`403 PRODUCTION_DEPLOY_UNAUTHORIZED`); requires `OWNER` or `ADMIN`.
- `POST /api/v1/workflows/:id/environments/:environment/rollback`:
  - Safely rolls back the target environment to a previous version or specified `targetVersionId`.
  - Marks current active deployment as `ROLLED_BACK` and creates an audit-backed `ACTIVE` rollback deployment.
  - Requires `OWNER` or `ADMIN` for `production` rollback (`403 PRODUCTION_DEPLOY_UNAUTHORIZED`).
  - Does NOT mutate existing in-flight workflow executions.

### 9.4 Execution Environment Version Resolution
- `POST /api/v1/workflows/:id/trigger` and `POST /api/v1/workflows/:id/execute`:
  - Accepts `x-environment` header or `environment` in body (defaulting to `development` for manual builder triggers).
  - Webhooks and schedules default to active `production` deployment.
  - Resolves active `workflowVersionId` and permanently records it on `WorkflowExecutionRecord`, guaranteeing execution immutability.


## 10. Analytics, Monitoring, and Operational Intelligence Endpoints

All analytics endpoints strictly enforce multi-tenant organization isolation (`req.organizationId`) and Role-Based Access Control (`analytics:read` for inspection, `analytics:write` for mutation/alerts).

### 10.1 Execution Analytics Overview
- `GET /api/v1/analytics/overview`:
  - **Query Parameters**: `range` (`1h`, `24h`, `7d`, `30d`, `custom`), `from` (ISO string), `to` (ISO string), `workflowId`, `environment` (`development`, `staging`, `production`).
  - **Interval Semantics**: Half-open intervals `[from, to)` preventing duplicate counting across window boundaries.
  - **Metrics Returned**:
    - `total`: Total executions within time window.
    - `statusBreakdown`: Counts for `succeeded`, `failed`, `cancelled`, `running`, `waitingApproval`, `waitingDelay`.
    - `successRate`: Percentage of terminal executions that succeeded: `successful / (successful + failed) * 100`.
    - `failureRate`: Percentage of terminal executions that failed: `failed / (successful + failed) * 100`.
    - `durationPercentiles`: Linear-interpolated `medianMs` (P50), `p95Ms`, `p99Ms`, and `averageMs` computed over terminal completed runs.
    - `retryStats`: Total retries and retry rate (`retries / totalExecutions`). Retries do not inflate base execution counts.
    - `trends`: Comparison against the prior equivalent duration window (`totalExecutionsChangePercent`, `successRateChangePercent`).

### 10.2 Time-Series Execution Trends
- `GET /api/v1/analytics/trends`:
  - **Query Parameters**: `range` (`1h`, `24h`, `7d`, `30d`, `custom`), `bucketSize` (`hour` or `day`), `workflowId`.
  - **Response**: Array of chronological buckets `{ timestamp, total, successful, failed, cancelled, avgDurationMs }`.

### 10.3 Workflow Performance & Ranking
- `GET /api/v1/analytics/workflows`:
  - **Query Parameters**: `range`, `sortBy` (`executionCount`, `successRate`, `avgDurationMs`, `failureRate`), `order` (`asc`, `desc`).
  - **Response**: Ranked list of organization workflows with execution totals, success/failure rates, duration percentiles, retry counts, `lastExecutedAt`, `lastFailedAt`, and `commonFailureCategory`.

### 10.4 Node-Level Performance & Bottleneck Analysis
- `GET /api/v1/analytics/workflows/:id/nodes`:
  - **Path Parameter**: `id` (Workflow ID).
  - **Response**:
    - `nodes`: Array of node performance summaries `{ nodeId, nodeName, nodeType, executionCount, failureCount, failureRate, retryCount, avgDurationMs, medianDurationMs, p95DurationMs, percentageOfTotalDuration, isBottleneck }`.
    - `bottlenecks`: Filtered array of nodes marked `isBottleneck = true` (highest latency contributors and elevated failure points).

### 10.5 Structured Failure Analysis & Credential Sanitization
- `GET /api/v1/analytics/failures`:
  - **Query Parameters**: `range`, `workflowId`.
  - **Classification Categories**: `VALIDATION_ERROR`, `AUTH_ERROR`, `INTEGRATION_ERROR`, `HTTP_TIMEOUT`, `SERVICE_ERROR`, `RATE_LIMITED`, `NODE_CONFIG_ERROR`, `RUNTIME_ERROR`, `QUEUE_ERROR`, `CANCELLATION`, `UNKNOWN_ERROR`.
  - **Sanitization Guarantee**: Redacts sensitive passwords, secrets, Bearer tokens (`Bearer <token>`), and JWTs (`eyJ...`) with `[REDACTED]`.
  - **Response**: `totalFailures`, `categories` breakdown map, `topFailingNodes` frequency map, `topFailingWorkflows` frequency map, and list of `recentFailures` with sanitized messages and error details.

### 10.6 Organization Resource & Usage Analytics
- `GET /api/v1/analytics/usage`:
  - **Response**: Tenant resource utilization summary: `totalWorkflows`, `activeWorkflows`, `publishedVersions`, `totalExecutions`, `totalStepsExecuted`, `triggerVolume` (by `MANUAL`, `WEBHOOK`, `SCHEDULE`), `approvals` (`total`, `pending`, `decided`), `activeSchedules`, and `activeWebhooks`.

### 10.7 Operational Infrastructure Telemetry
- `GET /api/v1/analytics/operational`:
  - **Response**:
    - `queue`: `queuedJobs`, `runningJobs`, `waitingApprovalJobs`, `waitingDelayJobs`, `totalInFlight`.
    - `scheduler`: `activeSchedules`, `overdueCount`, `maxLagSeconds`, `status` (`HEALTHY` or `DEGRADED`).
    - `delays`: `pendingDelays`, `overdueCount`, `maxLagSeconds`.
    - `worker`: `status` (`ONLINE`), `heartbeatTimestamp`.
    - `alertsCount`: Count of currently active operational alerts.

### 10.8 Operational Alerts, Deduplication & Resolution
- `GET /api/v1/analytics/alerts`:
  - **Query Parameters**: `status` (`ACTIVE`, `RESOLVED`), `severity` (`INFO`, `WARNING`, `CRITICAL`).
  - **Response**: Array of operational alerts sorted by `triggeredAt` descending.
- `POST /api/v1/analytics/alerts/evaluate`:
  - **Permissions**: Requires `analytics:write` (`OWNER`, `ADMIN`).
  - **Evaluation Rules**:
    - `HIGH_FAILURE_RATE`: Triggers CRITICAL alert when 1-hour failure rate exceeds 25% with >= 4 executions.
    - `CONSECUTIVE_FAILURES`: Triggers WARNING alert when last 3 executions of any workflow terminate in `FAILED`.
    - `QUEUE_BACKLOG`: Triggers WARNING alert when queued executions exceed 15.
    - `SCHEDULER_LAG`: Triggers WARNING alert when enabled schedules are overdue by > 2 minutes.
  - **Deduplication Cooldown**: 15-minute cooldown per `dedupKey` (`${orgId}_${ruleType}_${target}`) preventing alert spam.
- `POST /api/v1/analytics/alerts/:id/resolve`:
  - **Permissions**: Requires `analytics:write` (`OWNER`, `ADMIN`).
  - **Body**: `{ resolutionNote?: string }`.
  - **Response**: Updates alert `status` to `RESOLVED`, sets `resolvedAt`, `resolvedById`, records `resolutionNote`, and emits an audit log `alert.resolved`.


## 11. Enterprise Security, Governance, Invitations, API Keys & Retention Endpoints

### 11.1 Organization Governance & Settings
- `GET /api/v1/organizations/:organizationId/settings`:
  - **Permissions**: Requires membership in target organization (`org:read`).
  - **Response**: `{ id, name, slug, timezone, billingEmail, enforce2FA, allowedIpRanges, executionRetentionDays, auditRetentionDays, role }`.
- `PATCH /api/v1/organizations/:organizationId/settings`:
  - **Permissions**: Requires `org:write` (`OWNER`, `ADMIN`). Blocked for API keys.
  - **Body**: `{ name?, timezone?, billingEmail?, enforce2FA?, allowedIpRanges?, executionRetentionDays?, auditRetentionDays? }`.
  - **Validation**: Enforces valid IANA timezone string, positive retention integer ranges, and IP CIDR formatting.
  - **Auditing**: Emits `organization.settings_updated`.
- `POST /api/v1/organizations/:organizationId/transfer-ownership`:
  - **Permissions**: Restrictive `OWNER` only. Blocked for API keys.
  - **Body**: `{ newOwnerUserId: string }`.
  - **Invariants**: Target user must be an existing organization member. Promotes target to `OWNER` and demotes caller to `ADMIN`.
  - **Auditing**: Emits `organization.ownership_transferred`.

### 11.2 Member Administration & Last-Owner Protection
- `GET /api/v1/organizations/:organizationId/members`:
  - **Query Parameters**: `page`, `pageSize`, `search` (filter by email or name), `status` (role filter).
  - **Security**: Strips `passwordHash`, sessions, and credential metadata from member objects.
- `PATCH /api/v1/organizations/:organizationId/members/:membershipId`:
  - **Invariants**: Non-owners cannot promote or demote `OWNER` role (`403`). Demoting the sole organization owner is rejected (`400 LAST_OWNER_PROTECTION`).
- `DELETE /api/v1/organizations/:organizationId/members/:membershipId`:
  - **Invariants**: Non-owners cannot remove `OWNER` role (`403`). Removing the sole organization owner is rejected (`400 LAST_OWNER_PROTECTION`).

### 11.3 Secure Member Invitation Lifecycle
- `POST /api/v1/organizations/:organizationId/invitations`:
  - **Permissions**: Requires `org:members:write` (`OWNER`, `ADMIN`). Non-owners cannot invite with role `OWNER`.
  - **Body**: `{ email: string, role: "ADMIN" | "MEMBER" | "VIEWER" }`.
  - **Security Guarantee**: Generates 32-byte cryptographic random token (`rawToken`). Stores SHA-256 `tokenHash` in database. Raw token is returned **strictly once** in 201 response and never logged in audit metadata.
  - **Invariants**: Rejects duplicate pending invitations for the same email (`409 INVITATION_ALREADY_EXISTS`) and existing members (`409 MEMBER_EXISTS`).
- `GET /api/v1/organizations/:organizationId/invitations`:
  - **Permissions**: Requires `org:members:read`. Filterable by `status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`). Raw tokens and token hashes are omitted.
- `POST /api/v1/organizations/:organizationId/invitations/:invitationId/revoke`:
  - **Permissions**: Requires `org:members:write`. Sets status to `REVOKED`.
- `POST /api/v1/organizations/invitations/accept`:
  - **Public / Authenticated Entrypoint**: Accepts `{ token: string }`.
  - **Verification**: Matches SHA-256 hash. Verifies single-use (`PENDING` only) and expiry timestamp (`7 days`). Atomically creates organization membership with invited role, updates invitation status to `ACCEPTED`, and emits `organization.invitation.accepted`. Re-using an accepted token returns `400 INVITATION_ALREADY_USED`.

### 11.4 Scoped API Credentials & Service Access
- `POST /api/v1/organizations/:organizationId/api-keys`:
  - **Permissions**: Requires `api-keys:write` (`OWNER`, `ADMIN`). Blocked for API keys.
  - **Body**: `{ name: string, scopes: ApiKeyScope[], expiresInDays?: number }`.
  - **Token Format**: `ff_live_<randomHex32>`.
  - **Security Guarantee**: Stored as SHA-256 `keyHash` and 16-character `keyPrefix`. Plaintext token revealed **strictly once** in 201 response.
- `GET /api/v1/organizations/:organizationId/api-keys`:
  - **Permissions**: Requires `api-keys:read` (`OWNER`, `ADMIN`). Lists key metadata (`id`, `name`, `keyPrefix`, `scopes`, `lastUsedAt`, `expiresAt`, `revokedAt`).
- `DELETE /api/v1/organizations/:organizationId/api-keys/:keyId`:
  - **Permissions**: Requires `api-keys:write`. Marks key as revoked (`revokedAt = now`).
- **Authentication via API Key**:
  - Accepts `Authorization: Bearer ff_live_...` or `x-api-key: ff_live_...`.
  - Enforces explicit scopes (`workflow:read`, `workflow:execute`, `workflow:write`, `analytics:read`, `audit:read`). Unscoped operations return `403 INSUFFICIENT_SCOPE`.
  - Denies access to user session or organizational ownership administration.
  - Updates `lastUsedAt` timestamp on each successful request.

### 11.5 Data Retention & Privacy Controls
- `POST /api/v1/organizations/:organizationId/retention/cleanup`:
  - **Permissions**: Requires `retention:write` (`OWNER`). Blocked for API keys.
  - **Body**: `{ dryRun?: boolean, olderThanDays?: number }`.
  - **Active State Preservation Invariant**: Never prunes non-terminal executions (`QUEUED`, `RUNNING`, `WAITING_APPROVAL`, `WAITING_DELAY`, `RETRYING`). Prunes only terminal runs (`SUCCEEDED`, `FAILED`, `CANCELLED`) older than the retention cutoff.
  - **Auditing**: Emits `organization.retention.cleanup` with candidate count, pruned count, and cutoff timestamp.

### 11.6 Rate Limiting & Abuse Controls
- Standard RFC rate-limiting headers returned on API responses:
  - `Retry-After`: Seconds to wait before retrying (on HTTP 429).
  - `X-RateLimit-Limit`: Maximum requests permitted in window.
  - `X-RateLimit-Remaining`: Remaining request quota.
  - `X-RateLimit-Reset`: Unix timestamp when current window resets.

---

## 12. Connectors & Integration Connections API

### 12.1 Connector Catalog
- `GET /api/v1/connectors`:
  - **Query Parameters**: `category?: ConnectorCategory` (`HTTP`, `NOTIFICATION`, `DATABASE`, `AI`, `CUSTOM`).
  - **Response**: Array of registered connector definitions with operation specifications and authentication parameter schemas (`http-api`, `smtp-email`, `slack-webhook`).
- `GET /api/v1/connectors/:connectorId`:
  - **Response**: Full connector specification, operation schemas, and parameter constraints. 404 if not found.

### 12.2 Organization Connections Management
- `GET /api/v1/organizations/:organizationId/connections`:
  - **Permissions**: Requires `connections:read` or `org:read`.
  - **Response**: List of configured connections. Sensitive secrets are never exposed; returns `maskedSummary` (e.g. `apiKey: ••••••••1234`), status (`ACTIVE`, `DISABLED`, `REVOKED`), and last tested diagnostics.
- `POST /api/v1/organizations/:organizationId/connections`:
  - **Permissions**: Requires `connections:write` (`OWNER`, `ADMIN`).
  - **Body**: `{ connectorId: string, name: string, authType?: AuthType, credentialData: Record<string, unknown>, metadata?: Record<string, unknown> }`.
  - **Security**: Credentials encrypted with AES-256-GCM authenticated encryption (`iv:authTag:ciphertext`).
  - **Response**: 201 Created with masked summary. Plaintext is discarded immediately after encryption.
- `GET /api/v1/organizations/:organizationId/connections/:connectionId`:
  - **Permissions**: Requires `connections:read`.
  - **Response**: Connection details with masked summary. 404 if not found or organization mismatch.
- `PATCH /api/v1/organizations/:organizationId/connections/:connectionId`:
  - **Permissions**: Requires `connections:write`.
  - **Body**: `{ name?: string, status?: ConnectionStatus, metadata?: Record<string, unknown> }`.
  - **Response**: Updated connection metadata.
- `POST /api/v1/organizations/:organizationId/connections/:connectionId/rotate`:
  - **Permissions**: Requires `connections:write`.
  - **Body**: `{ credentialData: Record<string, unknown> }`.
  - **Security**: Re-encrypts credentials with fresh IV and auth tag. Resets `lastTestedAt` and `lastTestStatus`.
  - **Audit**: Emits `connection:rotate`.
- `POST /api/v1/organizations/:organizationId/connections/:connectionId/test`:
  - **Permissions**: Requires `connections:read` or `connections:write`.
  - **Execution**: Decrypts credentials server-side and executes health probe against the target service within strict timeouts.
  - **Response**: `ConnectionTestResult` (`{ success: boolean, message: string, latencyMs?: number, errorCategory?: string, testedAt: string }`). Error messages are sanitized via deep redaction. Updates `lastTestedAt` and `lastTestStatus`.
- `POST /api/v1/organizations/:organizationId/connections/test-draft`:
  - **Permissions**: Requires `connections:write`.
  - **Body**: `{ connectorId: string, credentialData: Record<string, unknown>, config?: Record<string, unknown> }`.
  - **Execution**: Evaluates credentials before saving. Enforces SSRF defenses (blocks `127.0.0.1`, `169.254.169.254`, and private subnets).
- `DELETE /api/v1/organizations/:organizationId/connections/:connectionId`:
  - **Permissions**: Requires `connections:write`.
  - **Action**: Revokes and removes connection. Subsequent accesses return 404.

---

## 13. Workflow Templates & Marketplace API

### 13.1 Template Catalog Discovery
- `GET /api/v1/templates`:
  - **Query Parameters**: `category?: string`, `tag?: string`, `search?: string`, `visibility?: TemplateVisibility`, `status?: TemplateStatus`, `page?: number`, `pageSize?: number`.
  - **Multi-Tenant Isolation**: Enforces tenant boundary. Users see only verified `PLATFORM` templates, templates published within their active `ORGANIZATION`, and their own `PRIVATE` drafts. Never returns other tenants' organization or private templates.
  - **Response**: Paginated array of templates with required connections, category, usage count, and latest published version metadata.

### 13.2 Template Retrieval & Lifecycle
- `GET /api/v1/templates/:templateId`:
  - **Permissions**: Requires authenticated session. Enforces tenant visibility (404/restricted if unauthorized).
  - **Response**: Template record with draft/published definition, required connections, and version info.
- `POST /api/v1/templates`:
  - **Permissions**: `templates:write` or `workflow:write`. Organization context required for `visibility: "ORGANIZATION"`.
  - **Body**: `{ name: string, shortDescription: string, description?: string, category?: string, tags?: string[], visibility?: TemplateVisibility, workflowId?: string, definition?: WorkflowDefinition }`.
  - **Sanitization Invariant**: Deep-scrubs sensitive credentials (`password`, `secret`, `token`, `apiKey`, `authorization`, `webhookUrl`) to `"[REDACTED]"`, strips tenant-specific `connectionId` references, removes runtime state (`executionId`, `lastOutput`), deactivates triggers (`enabled: false`), and extracts required connector list (`requiredConnections`).
  - **Response**: 201 Created with initial `DRAFT` status and `usageCount: 0`. Emits `template:create` audit event.
- `PATCH /api/v1/templates/:templateId`:
  - **Permissions**: Template creator or Organization Owner/Admin.
  - **Body**: `{ name?: string, shortDescription?: string, description?: string, category?: string, tags?: string[], visibility?: TemplateVisibility, status?: TemplateStatus, definition?: WorkflowDefinition }`.
  - **Response**: Updated template record. Emits `template:update` audit event.
- `DELETE /api/v1/templates/:templateId`:
  - **Permissions**: Template creator or Organization Owner/Admin.
  - **Action**: Marks status as `ARCHIVED`. Archived templates are excluded from default catalog search. Emits `template:archive` audit event.

### 13.3 Immutable Versioning & Comparison
- `POST /api/v1/templates/:templateId/publish`:
  - **Permissions**: `templates:publish` (`OWNER`, `ADMIN`) or template creator.
  - **Body**: `{ releaseNotes?: string }`.
  - **Invariants**: Computes deterministic SHA-256 `contentHash`, generates monotonically incremented `versionNumber`, stores immutable snapshot in `workflow_template_versions`, and updates template `status: "PUBLISHED"` and `publishedVersionId`. Emits `template:publish` audit event.
- `GET /api/v1/templates/:templateId/versions`:
  - **Response**: Array of published immutable versions sorted in descending order.
- `GET /api/v1/templates/:templateId/versions/:versionId`:
  - **Response**: Specific version definition and metadata.
- `GET /api/v1/templates/:templateId/compare`:
  - **Query Parameters**: `sourceVersionId?: string`, `targetVersionId?: string`.
  - **Response**: Semantic diff comparing node additions, deletions, configuration changes, and edge modifications.

### 13.4 Workflow Instantiation
- `POST /api/v1/templates/:templateId/instantiate`:
  - **Permissions**: Requires `workflow:write` in target active organization.
  - **Body**: `{ name?: string, description?: string, versionId?: string, connectionMappings?: Record<string, string>, inputValues?: Record<string, unknown> }`.
  - **Security & Cross-Tenant Defense**:
    - Rejects cross-tenant template access with 404.
    - If `connectionMappings` contains a `connectionId`, verifies that it belongs to caller's target organization. Rejects cross-tenant connection IDs with 403 `CROSS_TENANT_CONNECTION_FORBIDDEN`.
  - **Graph Instantiation**:
    - Regenerates completely new unique UUIDs for all nodes (`node_<type>_<uuid>`) and edges (`edge_<uuid>`).
    - Remaps edge `source` and `target` handles to preserve graph topology with zero ID collisions.
    - Binds user-provided connection IDs.
    - Sets triggers to inactive (`enabled: false`).
    - Validates instantiated definition against all structural rules.
  - **Persistence & Provenance**:
    - Creates `Workflow` record in caller's active organization with `status: "DRAFT"` and `publishedVersionId: undefined`.
    - Permanently records provenance: `sourceTemplateId: template.id` and `sourceTemplateVersionId: version.id`.
    - Atomically increments template `usageCount`.
    - Emits `workflow:instantiate_from_template` audit event.
  - **Response**: 201 Created with newly instantiated workflow record.


