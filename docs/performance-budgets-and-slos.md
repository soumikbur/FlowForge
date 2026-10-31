# FlowForge Performance Budgets, Service Level Objectives (SLOs), and Resilience Architecture

## 1. Executive Summary & Measurement Methodology

This document formalizes the performance budgets, Service Level Objectives (SLOs), Service Level Indicators (SLIs), error budgets, and operational recovery objectives for the **FlowForge Business Workflow Automation Platform**.

All latency budgets and throughput targets are grounded directly in empirical benchmark measurements captured on the FlowForge production codebase across 11 critical workloads (100–1,000 warm iterations per workload):

| Workload | Critical Path Endpoint / Operation | Measured p50 | Measured p95 | Measured p99 | Throughput (ops/sec) | Latency Budget (p95 Target) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Workflow List** | `GET /api/v1/workflows` | 1.82ms | 2.71ms | 20.72ms | 438.5 ops/s | **< 15.0ms** |
| **2. Workflow Editor Load** | `GET /api/v1/workflows/:id` | 1.45ms | 1.92ms | 2.68ms | 665.5 ops/s | **< 10.0ms** |
| **3. Graph Validation** | `validateWorkflowGraph` (Uncached) | 0.01ms | 0.04ms | 0.06ms | 53,247 ops/s | **< 0.10ms** |
| **3b. Graph Validation** | `validateWorkflowGraph` (Cached) | 0.00ms | 0.01ms | 0.02ms | >100,000 ops/s | **< 0.02ms** |
| **4. Save Draft** | `PATCH /api/v1/workflows/:id` | 1.54ms | 1.92ms | 14.53ms | 545.1 ops/s | **< 15.0ms** |
| **5. Publish Version** | `POST /api/v1/workflows/:id/publish` | 1.64ms | 2.33ms | 2.33ms | 603.6 ops/s | **< 20.0ms** |
| **6. Start Execution** | `POST /api/v1/executions` | 1.50ms | 2.17ms | 2.74ms | 644.1 ops/s | **< 15.0ms** |
| **7. Step Execution** | `WorkflowExecutionRunner.processExecution` | 0.00ms | 0.01ms | 0.36ms | 69,188 ops/s | **< 5.0ms / step** |
| **8. Execution History** | `GET /api/v1/executions` | 1.35ms | 1.74ms | 2.17ms | 708.3 ops/s | **< 10.0ms** |
| **9. Analytics Overview** | `GET /api/v1/analytics/overview` | 1.39ms | 1.96ms | 2.38ms | 678.3 ops/s | **< 15.0ms** |
| **10. Event Delivery** | `publishDomainEvent` | 0.01ms | 0.05ms | 0.70ms | 32,258 ops/s | **< 1.0ms** |
| **11. Import Preview** | `POST /api/v1/workflows/import/preview` | 1.56ms | 2.20ms | 3.50ms | 607.2 ops/s | **< 20.0ms** |

---

## 2. Service Level Objectives (SLOs) & Service Level Indicators (SLIs)

### 2.1 Availability SLO
- **Objective**: 99.9% availability across a rolling 30-day window for core workflow authoring, API endpoints, and execution services.
- **Allowed Downtime (Error Budget)**: $\le 43.8$ minutes per month (or 0.1% of all requests returning unexpected 5xx responses).
- **SLI Formulation**:
  $$\text{SLI}_{\text{availability}} = \frac{\sum \text{Successful HTTP Requests } (2\text{xx}, 3\text{xx}, 4\text{xx})}{\sum \text{Total HTTP Requests received}} \times 100\%$$

### 2.2 Latency SLOs (p95 and p99)
- **API Read Latency**: $99\%$ of `GET` requests (workflows, versions, executions, analytics) must complete in under **50ms**; $95\%$ must complete in under **15ms**.
- **API Mutation Latency**: $99\%$ of `POST`, `PATCH`, and `DELETE` requests must complete in under **100ms**; $95\%$ must complete in under **30ms**.
- **Workflow Step Dispatch Latency**: $99\%$ of in-memory step evaluations must complete in under **5ms**.

### 2.3 Execution Freshness & Stale Recovery SLO
- **Objective**: Zero active executions stranded in `RUNNING` for longer than 5 minutes without activity.
- **SLI Formulation**:
  $$\text{SLI}_{\text{stale}} = \frac{\sum \text{Stale executions reconciled within 300s}}{\sum \text{Total stale executions detected}} \ge 99.9\%$$

---

## 3. Error Budget & Burn Rate Alerting Rules

FlowForge implements multi-window, multi-burn-rate alerting based on Google SRE best practices to detect consumption of the 0.1% monthly error budget:

| Alert Severity | Burn Rate | Budget Consumed | Time Window | Notification Channel | Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P1 - Critical** | **14.4x** | 2% in 1 hour | 1 hour | PagerDuty (Immediate Page) | Automated rollback / failover; incident commander convened |
| **P2 - High** | **6.0x** | 5% in 6 hours | 6 hours | PagerDuty (On-call) | Investigate degrading dependency, queue congestion, or circuit breaker trips |
| **P3 - Medium** | **1.0x** | 10% in 3 days | 3 days | Slack / Jira Ticket | Engineering triage during business hours |

---

## 4. Database Query & Schema Optimization

To guarantee performance budgets as dataset sizes grow beyond $10^6$ records, composite indexes are enforced in PostgreSQL schema:

```prisma
// Workflow: Fast tenant filtering by status and update recency
@@index([organizationId, status])
@@index([organizationId, updatedAt])

// WorkflowExecution: High-throughput execution history and status querying
@@index([organizationId, status])
@@index([workflowId, status])
@@index([organizationId, createdAt])

// ExecutionStep: Fast step retrieval for running executions
@@index([executionId, status])
@@index([executionId, startedAt])

// AuditLog & Outbox: Retention management and dispatch querying
@@index([organizationId, createdAt])
@@index([status, createdAt])
```

Migration file: `packages/database/prisma/migrations/20261031120000_performance_and_indexes/migration.sql`.

---

## 5. Caching & Memory Architecture

### 5.1 Validation Caching
- **Implementation**: `BoundedCache<string, ValidationResult>` in `@flowforge/workflow-engine`.
- **Keying**: Deterministic SHA-256 hash of canonicalized workflow graph (`computeWorkflowContentHash`).
- **Capacity**: Bounded at 1,000 entries (TTL: 1 hour).
- **Eviction**: Least-Recently-Used (LRU) with tracking of hits, misses, evictions, and hit rate.
- **Throughput Impact**: Increases validation throughput from ~53,000 ops/s to >100,000 ops/s; eliminates redundant DFS cycle checks.

---

## 6. Worker Concurrency & Multi-Tenant Fair Scheduling

### 6.1 Worker Capacity Bounds
- **Global Concurrency Limit**: 50 simultaneous active executions per worker instance.
- **Tenant Concurrency Limit**: 10 simultaneous active executions per organization.
- **Fair Scheduling Guarantee**: Saturated tenants hitting their 10-execution quota are rejected with `Concurrency limit exceeded: Organization '...' limit reached`, preventing worker resource starvation for adjacent tenants.
- **Graceful Shutdown**: `runner.gracefulShutdown(timeoutMs)` triggers immediate `AbortController.abort()` across all active executions to release socket handles and persist state before worker teardown.

---

## 7. External Dependency Resilience & Circuit Breaker

### 7.1 Circuit Breaker State Machine
- **States**:
  1. `CLOSED`: All outbound HTTP requests pass through. Consecutively failed attempts increment failure count.
  2. `OPEN`: Tripped after 5 consecutive failures to an external host (`hostname`). Requests immediately fast-fail (`CircuitBreakerError`) without opening network sockets or waiting for timeouts.
  3. `HALF_OPEN`: Entered after 30-second cooldown (`resetTimeoutMs`). Permits 1 trial probe request. If successful, resets to `CLOSED`; if failed, reverts to `OPEN`.
- **Exponential Backoff with Full Jitter**:
  $$T_{\text{wait}} = \lfloor 200 \times 2^{\text{attempt}} \times (0.8 + 0.4 \times \text{random}()) \rfloor\text{ ms}$$

---

## 8. Disaster Recovery Objectives (RTO & RPO)

- **Recovery Time Objective (RTO)**: $\le 5\text{ minutes}$.
  - Worker restart and stale execution recovery automatically reconcile unacknowledged executions within 300 seconds.
- **Recovery Point Objective (RPO)**: $0\text{ seconds}$ for committed state.
  - All workflow transitions, step outputs, and domain events persist atomically via Prisma transactions and transactional outbox.

