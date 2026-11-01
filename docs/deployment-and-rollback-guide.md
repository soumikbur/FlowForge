# FlowForge Platform — Deployment Strategy, Zero-Downtime Rollout & Rollback Guide

**Audience:** SRE, Platform Engineers, DevOps, Release Managers  
**Milestone:** Prompt 19 — Production Deployment & Release Management

---

## 1. Supported Deployment Strategies

FlowForge supports two production deployment topologies:

### 1.1 Rolling Update (Default Strategy)

Used for routine feature releases, bug fixes, and backward-compatible schema changes:

1. Database migrations applied via `pnpm db:migrate:prod` prior to application traffic switch.
2. New worker containers deployed first; background queue processing drains old jobs while picking up new jobs.
3. New API containers rolled out one replica at a time (e.g. 25% max surge, 0% max unavailable).
4. Container health probes (`/health/ready`) gate traffic ingress before old containers are terminated.

### 1.2 Blue-Green Deployment

Used for major infrastructural shifts or database migrations requiring strict cutovers:

- **Blue Cluster:** Live production handling 100% of external traffic.
- **Green Cluster:** Standby environment with latest release deployed and verified.
- **Cutover:** Reverse proxy or load balancer switches target upstream to Green once health probes pass.
- **Rollback:** Instantaneous DNS or load balancer revert to Blue if anomalies arise.

---

## 2. Multi-Phase Expand / Contract Database Migration Protocol

To guarantee zero downtime and eliminate application crashes during database schema changes, destructive column renames or drops are strictly executed across multiple release cycles:

```
Release N (Current)   ───► Release N+1 (Expand)       ───► Release N+2 (Contract)
───────────────────        ───────────────────────         ─────────────────────────
column: 'full_name'        ADD column: 'first_name'        DROP column: 'full_name'
                           ADD column: 'last_name'         MAKE 'first_name' NOT NULL
                           (App writes to both)
```

1. **Phase 1 (Expand):** Add new columns as nullable, add new tables, or create non-blocking composite indexes (`CREATE INDEX CONCURRENTLY`).
2. **Phase 2 (Migrate & Backfill):** Deploy application version N+1 that writes to both new and legacy columns, reading from the new column if populated. Run asynchronous backfill script.
3. **Phase 3 (Contract):** Once all rows conform to new schema, deploy Release N+2 dropping legacy columns and applying strict NOT NULL constraints.

---

## 3. Automated Rollback Decision Matrix & Triggers

A rollback must be initiated immediately if any of the following automated health thresholds are breached during or post-deployment:

| Metric / Symptom         | Threshold / Condition                               |  Evaluation Window   | Action                                            |
| :----------------------- | :-------------------------------------------------- | :------------------: | :------------------------------------------------ |
| **API Error Rate (5xx)** | > 1.0% of total HTTP requests                       |      3 minutes       | Automated Rollback to previous image tag          |
| **P95 Request Latency**  | > 2,000ms (2x baseline budget)                      |      5 minutes       | Automated Rollback to previous image tag          |
| **Worker Health Check**  | Port 4001 `/health` fails                           | 3 consecutive checks | Terminate faulty worker, restart previous version |
| **API Readiness Probe**  | `/ready` returns non-200 or DB disconnected         | 3 consecutive checks | Remove replica from load balancer target pool     |
| **Circuit Breakers**     | Core internal circuit breaker transitions to `OPEN` |      2 minutes       | Halt rollout and alert SRE on-call                |

---

## 4. Step-by-Step Application Rollback Procedure

When a rollback is triggered:

1. **Halt Deployment Pipeline:** Stop any active CI/CD deployment or promotion workflow.
2. **Revert Container Images:**
   ```bash
   # Update container image to the prior known-stable semantic tag or digest
   docker compose -f docker-compose.prod.yml pull api worker web
   docker compose -f docker-compose.prod.yml up -d --no-deps api worker web
   ```
3. **Verify Restored Container Health:**
   ```bash
   curl -f http://127.0.0.1:4000/health/live || exit 1
   curl -f http://127.0.0.1:4000/health/ready || exit 1
   curl -f http://127.0.0.1:4001/health || exit 1
   ```
4. **Database Rollback Guidance:**
   - **DO NOT** execute `prisma migrate reset` in production!
   - Because schema migrations follow the **Expand/Contract** pattern, the previous application version is fully backward-compatible with the expanded schema.
   - If a migration added a faulty constraint or table, apply a forward-fix migration (`prisma migrate deploy`) rather than attempting destructive down-migrations that risk data loss.
