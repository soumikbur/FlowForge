# FlowForge Platform — Production Observability, Incident Response & Self-Healing Operations Guide

**Audience:** Site Reliability Engineers, DevOps, On-Call Engineers, Release Quality Assurance  
**Milestone:** Prompt 20 — Production Observability, Incident Response, and Self-Healing Operations

---

## 1. Observability Architecture Overview

FlowForge provides a layered, tenant-aware observability architecture designed for rapid incident detection, root-cause diagnosis, and safe operational recovery without introducing high-cardinality monitoring overhead:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API & Client Gateway                             │
│       • X-Correlation-Id Header Propagation                                 │
│       • Liveness (/health/live), Readiness (/health/ready) Probes           │
│       • Diagnostic Metrics (/health/metrics, /api/v1/metrics)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
┌──────────────────────────────────────┐┌──────────────────────────────────────┐
│       Structured Logging Layer       ││     Execution Lifecycle Stream       │
│ • JSON-formatted structured logs     ││ • 16 Canonical Lifecycle Events      │
│ • Automatic credential & token mask  ││ • Step durations & bottleneck flags  │
│ • Correlation across API & workers   ││ • Chronological timeline endpoint    │
└──────────────────┬───────────────────┘└──────────────────┬───────────────────┘
                   │                                       │
                   └─────────────────┬─────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│               Incident Response & Self-Healing Engine                       │
│ • Operational Incidents API (/api/v1/incidents) with fingerprint grouping   │
│ • Safe Operator-Controlled Recovery (/api/v1/executions/:id/recover)        │
│ • Ambiguous External Side-Effect Protection (Idempotency key enforcement)   │
│ • Automated Stale Execution Recovery & Transactional Outbox Self-Healing    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Structured Logging Conventions & Redaction Standards

### 2.1 Schema & Field Invariants

All services (`flowforge-api`, `flowforge-worker`, `flowforge-scheduler`) utilize the standard `StructuredLogger` emitting JSON logs:

```json
{
  "timestamp": "2026-10-31T06:20:00.000Z",
  "level": "info",
  "service": "flowforge-api",
  "environment": "production",
  "correlationId": "corr_8f93e2b10a4c",
  "organizationId": "org_acme_corp",
  "workflowId": "wf_order_pipeline",
  "executionId": "exec_987654321",
  "nodeId": "node_http_charge",
  "eventType": "NODE_STARTED",
  "message": "Calling payment provider gateway",
  "durationMs": 240
}
```

### 2.2 Sensitive Field Masking

The log sanitizer (`sanitizeLogValue`) recursively inspects metadata objects and redacts values whose keys match sensitive patterns (`/password/i`, `/secret/i`, `/token/i`, `/key/i`, `/auth/i`, `/credential/i`, `/cookie/i`), replacing them with `"[REDACTED]"`. Bearer and Basic authentication headers are stripped before serialization.

---

## 3. Workflow Execution Lifecycle Event Stream

Each workflow execution emits a continuous, immutable stream of lifecycle events queryable via:
`GET /api/v1/executions/:id/events`

| Lifecycle Event       | Trigger Condition                            | Key Diagnostic Attributes                     |
| :-------------------- | :------------------------------------------- | :-------------------------------------------- |
| `EXECUTION_ACCEPTED`  | Execution queued via API, Webhook, or Cron   | `triggerType`, `environment`                  |
| `EXECUTION_STARTED`   | Worker begins execution processing           | `startedAt`, worker concurrency count         |
| `NODE_STARTED`        | Worker enters step execution                 | `nodeId`, `nodeType`, `nodeName`, `attempt`   |
| `NODE_COMPLETED`      | Step completes successfully                  | `durationMs`, `outputPayload` (sanitized)     |
| `NODE_FAILED`         | Step execution throws error                  | `errorMessage`, `errorTaxonomyCode`           |
| `CONDITION_EVALUATED` | Decision node evaluates branching expression | `conditionResult`, branch taken               |
| `APPROVAL_REQUESTED`  | Execution pauses awaiting human decision     | `requiredRole`, `assignedUserId`, `expiresAt` |
| `APPROVAL_RESOLVED`   | User approves or rejects step                | `decision`, `decisionComment`, `decidedBy`    |
| `RETRY_SCHEDULED`     | Transient step failure triggers backoff      | `retryCount`, `backoffDelayMs`                |
| `EXECUTION_CANCELLED` | Execution stopped by operator                | `cancellationReason`                          |
| `EXECUTION_COMPLETED` | Terminal state reached successfully          | `totalDurationMs`, step count                 |
| `EXECUTION_FAILED`    | Terminal error or retries exhausted          | `errorDetails`, `failureCategory`             |
| `RECOVERY_INITIATED`  | Self-healing engine reconciles execution     | `recoveryAction`, `operatorReason`            |

---

## 4. Error Taxonomy & Failure Diagnostics

Errors are classified using stable machine-readable error codes (`ErrorTaxonomyCode`) to determine automated retry safety:

| Taxonomy Code            | Category Description                            |        Automated Retry Safety        | Recommended Action                            |
| :----------------------- | :---------------------------------------------- | :----------------------------------: | :-------------------------------------------- |
| `HTTP_TIMEOUT`           | External connector or HTTP request timed out    | **Retryable** (with Idempotency Key) | Verify downstream status; retry with backoff  |
| `RATE_LIMIT_ERROR`       | Upstream API returned HTTP 429                  |            **Retryable**             | Respect `Retry-After` header                  |
| `DATABASE_ERROR`         | Connection pool starvation or transient error   |            **Retryable**             | Re-queue after pool availability              |
| `QUEUE_ERROR`            | Redis lock expiration or worker disconnect      |            **Retryable**             | Reclaim worker lease                          |
| `WORKER_CRASH`           | Container terminated during step execution      |            **Retryable**             | Reclaim lease or reconcile as FAILED          |
| `VALIDATION_ERROR`       | Graph cycles, missing handles, invalid schema   |          **NON-RETRYABLE**           | Reject immediately; do not retry              |
| `AUTH_ERROR`             | Invalid API key, expired token, signature error |          **NON-RETRYABLE**           | Rotate credentials; require user intervention |
| `AUTHORIZATION_ERROR`    | RBAC role permission denied                     |          **NON-RETRYABLE**           | Review user role assignments                  |
| `TENANT_ISOLATION_ERROR` | Cross-tenant data access violation              |          **NON-RETRYABLE**           | Security violation alert; block request       |
| `BUSINESS_RULE_ERROR`    | User expression evaluated to failure            |          **NON-RETRYABLE**           | Workflow logic fix required                   |

---

## 5. Incident Management & Fingerprint Deduplication

Mounted at `/api/v1/incidents`:

1. **Automated Deduplication:** Multiple errors sharing the same `fingerprint` (e.g. `fp_gateway_timeout_stripe`) update the existing active incident record (`occurrenceCount += 1`, `lastObservedAt = now`) without generating noisy alert storms.
2. **Tenant Isolation:** Incidents are strictly partitioned by `organizationId`. Cross-tenant requests receive `404 Not Found`.
3. **Incident Lifecycle:** Incidents transition from `OPEN` -> `INVESTIGATING` -> `MITIGATED` -> `RESOLVED`.
4. **Resolution Tracking:** Resolving an incident records `resolvedAt`, `resolvedById`, and a mandatory `resolutionSummary`.

---

## 6. Safe Automated Recovery (Self-Healing Operations)

### 6.1 Ambiguous External Side-Effect Invariant

> [!IMPORTANT]
> **Core Safety Invariant:** Never automatically re-execute an external action merely because its previous outcome is unknown.

If an HTTP request timed out while contacting an external service without an `Idempotency-Key` header:

- The external server may have processed the transaction (e.g. charged a card or fired a webhook).
- Automated retry is **strictly forbidden**.
- The operator recovery endpoint (`POST /api/v1/executions/:id/recover`) enforces this guard:
  - If `action: "RETRY_SAFE"` is submitted for an ambiguous step without `confirmAmbiguousSideEffect: true`, the API rejects the request with HTTP 400:
    `"AMBIGUOUS_SIDE_EFFECT_CONFIRMATION_REQUIRED"`
  - Once the operator confirms via out-of-band logs that the external action did not occur, supplying `confirmAmbiguousSideEffect: true` safely advances the step into `PENDING` and re-queues the execution.

### 6.2 Transactional Outbox Self-Healing

The self-healing outbox runner (`reprocessPendingOutboxEvents`):

- Periodically scans for `PENDING` or `FAILED` outbox events that were interrupted by worker restarts.
- Retries delivery up to `maxRetries: 5`.
- If an event exceeds the maximum retry limit, it transitions into `DEAD_LETTER` to prevent poison pills from blocking subsequent event notifications.

---

## 7. Operational Troubleshooting Matrix

| Operational Symptom                      | Probable Root Causes                                 | Diagnostic Evidence                                                                                   | Safe Remediation Procedure                                                                                                                      |
| :--------------------------------------- | :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Unavailable (503)**                | Database connection loss or configuration error      | Check `/health/ready`; inspect `apps/api` logs for `"PrismaClientInitializationError"`                | Verify PostgreSQL container health and connection pool saturation (`DATABASE_POOL_MAX`).                                                        |
| **Queue Backlog Growing**                | Worker capacity saturated or jobs accumulating       | Check `/health/metrics` (`flowforge_worker_active_executions >= 45`); inspect queue latency           | Verify worker liveness on port 4001; scale worker replicas or tune `maxGlobalConcurrency`.                                                      |
| **Executions Stuck in RUNNING**          | Worker process crashed without clean lease release   | Execution `startedAt` > 5m ago with no recent step update; no active AbortController                  | Run automated stale recovery (`runner.recoverStaleExecutions(300000)`) or submit `POST /api/v1/executions/:id/recover` with `RECONCILE_FAILED`. |
| **Notifications Delayed**                | Outbox processor stalled or upstream webhook slow    | Outbox status remains `PENDING`; `/health/metrics` shows circuit breaker open                         | Execute `reprocessPendingOutboxEvents(apiStore)`; inspect circuit breaker status for failing webhook host.                                      |
| **Connector Failures Increasing**        | Downstream 3rd-party provider outage or rate-limited | Circuit breaker transitions to `OPEN`; `classifyFailure` returns `HTTP_TIMEOUT` or `RATE_LIMIT_ERROR` | Circuit breaker will fast-fail outbound calls to protect worker threads. Check provider status page.                                            |
| **Duplicate External Effects Suspected** | Retry executed without idempotency key               | Step logs show multiple `NODE_STARTED` for same node; duplicate payload IDs                           | Halt automated retries; verify `Idempotency-Key` header configuration on HTTP nodes. Use `confirmAmbiguousSideEffect` safeguards.               |
