# FlowForge Platform — Operations & Incident Response Runbook

**Audience:** Site Reliability Engineers, DevOps, On-Call Engineers  
**Milestone:** Prompt 19 — Production Deployment & Release Management

---

## 1. Observability, Metrics & Health Diagnostics

FlowForge exposes standard Kubernetes-compliant diagnostic endpoints:

| Endpoint              | Port / Host   | Purpose                                            |      Expected Status       | Sensitive Data? |
| :-------------------- | :------------ | :------------------------------------------------- | :------------------------: | :-------------: |
| `GET /health/live`    | API (4000)    | Process liveness probe                             | `200 {"status":"healthy"}` |       No        |
| `GET /health/ready`   | API (4000)    | Readiness probe (verifies database)                |  `200 {"status":"ready"}`  |       No        |
| `GET /health/metrics` | API (4000)    | Prometheus/system metrics & circuit breaker status |         `200 JSON`         |       No        |
| `GET /health`         | Worker (4001) | Worker liveness & queue runner status              | `200 {"status":"healthy"}` |       No        |

---

## 2. Actionable Prometheus Alert Rules

```yaml
groups:
  - name: flowforge_production_alerts
    rules:
      - alert: FlowForgeHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "FlowForge API 5xx error rate exceeds 1% over 5 minutes"

      - alert: FlowForgeHighLatencyP95
        expr: histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 2000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "FlowForge API P95 latency exceeds 2,000ms"

      - alert: FlowForgeWorkerStalled
        expr: flowforge_worker_active_executions > 45
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Worker execution concurrency near max capacity (50); jobs accumulating"

      - alert: FlowForgeCircuitBreakerOpen
        expr: flowforge_circuit_breaker_state{state="OPEN"} == 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "External connector host circuit breaker has transitioned to OPEN"
```

---

## 3. Incident Triage Procedures

### Incident 1: API Crash Loop / Startup Failure

1. **Symptom:** API container restarts repeatedly with non-zero exit code.
2. **Diagnosis:** Inspect container logs (`docker logs flowforge-prod-api`):
   - Look for `"Environment configuration error:"` — indicates missing or malformed production configuration (e.g. `SESSION_SECRET` too short, invalid `DATABASE_URL`).
   - Look for `"PrismaClientInitializationError"` — database connection failure or unreachable PostgreSQL host.
3. **Remediation:** Verify `.env.production` against `docs/environment-variables.md`. Run `node packages/config/dist/index.js` to inspect validation errors without starting the web server.

### Incident 2: Database Connection Exhaustion

1. **Symptom:** Requests fail with `Can't reach database server` or timeout after 5,000ms.
2. **Diagnosis:**
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
3. **Remediation:**
   - Adjust `DATABASE_POOL_MAX` in `.env.production` (default: 20 per replica).
   - If idle connections are hanging, verify connection pooling proxy (PgBouncer or Cloud SQL Auth Proxy).

### Incident 3: Stranded Worker Executions

1. **Symptom:** Workflows stuck in `RUNNING` status without progressing for > 5 minutes.
2. **Diagnosis:** Worker pod crashed during execution or encountered an unhandled promise rejection.
3. **Remediation:**
   - Worker runner includes automated background recovery (`recoverStaleExecutions(300000)`).
   - Trigger manual recovery via API diagnostic command or restart worker replica.

---

## 4. Production Release Checklist

Before approving any production deployment:

- [ ] **CI Pipeline Green:** All unit, integration, and security test suites passing on `main` or tagged commit.
- [ ] **Static Analysis Zero Warnings:** ESLint and TypeScript compilation pass with zero errors.
- [ ] **Database Migration Plan Reviewed:** All migrations in `packages/database/prisma/migrations` follow the Expand/Contract pattern.
- [ ] **Production Configuration Validated:** `SESSION_SECRET` (>= 32 chars) and `ENCRYPTION_KEY` (64-char hex) configured from secure CSPRNG.
- [ ] **Backup Verified:** Successful PostgreSQL snapshot created within the past 24 hours.
- [ ] **Staging Verified:** Successfully deployed to staging environment with health checks passing.
- [ ] **Approval Gate Signed Off:** Explicit authorization granted by Release Manager.
- [ ] **Post-Deploy Health Check:** Verify `/health/live`, `/health/ready`, and worker port 4001 within 60 seconds of traffic switch.
- [ ] **Rollback Standby:** Prior container image digest readily available for immediate revert.
