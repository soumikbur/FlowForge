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

- `POST /api/v1/workflows/:id/trigger`: Manually trigger execution of published workflow with payload.
- `GET /api/v1/executions`: List executions with filtering (`?status=FAILED&workflowId=...`).
- `GET /api/v1/executions/:id`: Retrieve complete execution record, step results, and timeline.
- `POST /api/v1/executions/:id/cancel`: Cancel an active or queued execution.
- `POST /api/v1/executions/:id/retry`: Retry execution from failed step.

## 5. Approvals Endpoints

- `GET /api/v1/approvals`: List pending and historical approvals for user role.
- `GET /api/v1/approvals/:id`: Retrieve single approval request and execution context.
- `POST /api/v1/approvals/:id/decide`: Submit decision (`APPROVE` or `REJECT`) with optional comment. Resumes or terminates workflow execution.

## 6. Webhooks & Integrations Endpoints

- `POST /api/v1/webhooks/:workflowId`: Ingest external webhook, verify signature/token, queue execution.
- `GET /api/v1/integrations/credentials`: List credentials (names, types, no secrets revealed).
- `POST /api/v1/integrations/credentials`: Register or update encrypted credential.
- `DELETE /api/v1/integrations/credentials/:id`: Remove credential.

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
