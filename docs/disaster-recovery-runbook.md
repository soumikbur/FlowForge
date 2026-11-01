# FlowForge Platform — Disaster Recovery & Backup/Restore Runbook

**Classification:** High-Priority Operational Runbook  
**Target RPO:** <= 15 Minutes (Recovery Point Objective)  
**Target RTO:** <= 30 Minutes (Recovery Time Objective)  
**Milestone:** Prompt 19 — Production Deployment & Release Management

---

## 1. Data Classification & Authority

| Data Asset                   | Description                                                                            |              Authority Level               | Backup Mechanism & Frequency                                                      | Retention Policy  |
| :--------------------------- | :------------------------------------------------------------------------------------- | :----------------------------------------: | :-------------------------------------------------------------------------------- | :---------------: |
| **PostgreSQL Database**      | Organizations, Users, Workflows, Versions, Executions, Steps, Integrations, Audit Logs | **Authoritative (Single Source of Truth)** | Continuous WAL streaming + Daily compressed logical dump (`pg_dump -Fc`)          | 30 days retention |
| **Workflow Export Packages** | Canonical SHA-256 verified portable workflow bundles                                   |         **Authoritative Archive**          | S3 / GCS object versioning                                                        |    Indefinite     |
| **Redis Queue & Cache**      | In-flight job states, rate-limit counters, presence locks, validation cache            |        **Regenerable / Transient**         | Redis RDB snapshot hourly (non-critical; reconciles via `recoverStaleExecutions`) |     24 hours      |
| **Audit Logs**               | Immutable compliance logs in `AuditLog` table                                          |          **Compliance Critical**           | Included in PostgreSQL backup + Streamed to external SIEM                         |     365 days      |

---

## 2. Automated Backup Procedures

### 2.1 Logical Database Backup Script (`cron` daily at 02:00 UTC)

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DATE=$(date -u +%Y%m%d_%H%M%SZ)
BACKUP_FILE="/tmp/flowforge_backup_${BACKUP_DATE}.dump"
GCS_BUCKET="gs://flowforge-production-backups"

echo "[Backup] Dumping PostgreSQL database..."
pg_dump -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -Fc -f "${BACKUP_FILE}"

echo "[Backup] Encrypting and uploading to off-site storage..."
# Encrypt with customer-managed KMS key
gzip -c "${BACKUP_FILE}" | gcloud storage cp - "${GCS_BUCKET}/${BACKUP_DATE}.dump.gz"

rm -f "${BACKUP_FILE}"
echo "[Backup] Backup successfully archived."
```

---

## 3. Step-by-Step Disaster Recovery & Database Restoration

In the event of database corruption, ransomware, or regional hardware failure:

### Step 1: Isolate & Provision Clean Target Database

Provision a clean PostgreSQL 16 instance. Ensure no active worker or API replicas are connected.

### Step 2: Fetch and Decrypt Backup Archive

```bash
gcloud storage cp gs://flowforge-production-backups/TARGET_DATE.dump.gz /tmp/restore.dump.gz
gunzip /tmp/restore.dump.gz
```

### Step 3: Execute Restoration (`pg_restore`)

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  -h "${NEW_PGHOST}" -U "${PGUSER}" -d "${NEW_PGDATABASE}" \
  /tmp/restore.dump
```

### Step 4: Validate Data Integrity & Version Immutability

Run validation query asserting that workflow versions and tenant isolation invariants remain intact:

```sql
-- 1. Verify organization count
SELECT COUNT(*) FROM "Organization";

-- 2. Verify published workflow version integrity
SELECT "id", "versionNumber", "contentHash" FROM "WorkflowVersion" LIMIT 10;

-- 3. Verify audit log continuous timestamps
SELECT MAX("createdAt") FROM "AuditLog";
```

### Step 5: Safe Queue Re-hydration & Side-Effect Prevention

When restoring from a past backup, executions that were active during the backup window must NOT execute duplicated external HTTP or email actions:

1. Start worker service with `DRY_RUN_RECOVERY=true` or execute the stale execution cleanup:
   ```ts
   // apps/worker/src/runner.ts
   runner.recoverStaleExecutions(0); // Immediately reconcile stranded in-flight executions to FAILED
   ```
2. Scheduled triggers will synchronize automatically upon startup through `WorkflowSchedulerService`.
3. Bring API and Web services online and verify `/health/ready`.
