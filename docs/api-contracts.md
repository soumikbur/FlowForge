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

## 1. Authentication & Organization Endpoints
- `POST /api/v1/auth/register`: Create user and primary organization.
- `POST /api/v1/auth/login`: Authenticate and issue secure session cookie.
- `POST /api/v1/auth/logout`: Invalidate current session.
- `GET /api/v1/auth/me`: Retrieve current user profile and memberships.
- `GET /api/v1/organizations`: List user organizations.
- `POST /api/v1/organizations/switch`: Switch active organization context.

## 2. Workflows Endpoints
- `GET /api/v1/workflows`: List workflows with pagination and filters (`?status=ACTIVE&search=order`).
- `POST /api/v1/workflows`: Create new workflow draft.
- `GET /api/v1/workflows/:id`: Retrieve workflow draft details and latest version.
- `PATCH /api/v1/workflows/:id`: Update workflow draft (name, description, nodes, edges).
- `DELETE /api/v1/workflows/:id`: Soft delete / archive workflow.
- `POST /api/v1/workflows/:id/validate`: Run graph validation checks on draft without publishing.
- `POST /api/v1/workflows/:id/publish`: Validate and publish draft as a new immutable version.
- `GET /api/v1/workflows/:id/versions`: List all published versions.
- `GET /api/v1/workflows/:id/versions/:versionId`: Retrieve specific historical version.

## 3. Workflow Execution Endpoints
- `POST /api/v1/workflows/:id/trigger`: Manually trigger execution of published workflow with payload.
- `GET /api/v1/executions`: List executions with filtering (`?status=FAILED&workflowId=...`).
- `GET /api/v1/executions/:id`: Retrieve complete execution record, step results, and timeline.
- `POST /api/v1/executions/:id/cancel`: Cancel an active or queued execution.
- `POST /api/v1/executions/:id/retry`: Retry execution from failed step.

## 4. Approvals Endpoints
- `GET /api/v1/approvals`: List pending and historical approvals for user role.
- `GET /api/v1/approvals/:id`: Retrieve single approval request and execution context.
- `POST /api/v1/approvals/:id/decide`: Submit decision (`APPROVE` or `REJECT`) with optional comment. Resumes or terminates workflow execution.

## 5. Webhooks & Integrations Endpoints
- `POST /api/v1/webhooks/:workflowId`: Ingest external webhook, verify signature/token, queue execution.
- `GET /api/v1/integrations/credentials`: List credentials (names, types, no secrets revealed).
- `POST /api/v1/integrations/credentials`: Register or update encrypted credential.
- `DELETE /api/v1/integrations/credentials/:id`: Remove credential.

## 6. Dashboard & Metrics Endpoints
- `GET /api/v1/dashboard/stats`: Returns aggregated stats (total workflows, active, success rate, failed count, pending approvals).
- `GET /api/v1/dashboard/activity`: Recent execution events and alerts.
