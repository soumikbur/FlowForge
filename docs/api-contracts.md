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
