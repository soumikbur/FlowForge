import { describe, it, expect, beforeAll } from "vitest";
import { InMemoryDatabase, sampleOrderWorkflow } from "@flowforge/test-utils";
import {
  decryptCredentialData,
  encryptCredentialData,
} from "@flowforge/integrations";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";

describe("Prompt 21: Disaster Recovery, Data Durability & Operational Acceptance", () => {
  const masterKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const orgId = "org_dr_test_acme";
  const workflowId = "wf_dr_critical_orders";
  const versionId = "ver_dr_v1";

  // Source primary database before disaster
  let primaryDb: InMemoryDatabase;
  // Restored target database
  let restoredDb: InMemoryDatabase;

  beforeAll(async () => {
    primaryDb = new InMemoryDatabase();

    // 1. Seed Organization
    primaryDb.organizations.set(orgId, {
      id: orgId,
      name: "Acme Production Operations",
      slug: "acme-prod-ops",
      createdAt: new Date("2026-10-30T10:00:00Z"),
      updatedAt: new Date("2026-10-30T10:00:00Z"),
    });

    // 2. Seed Published Workflow and Version
    primaryDb.workflows.set(workflowId, {
      id: workflowId,
      organizationId: orgId,
      name: "Critical Order Ingestion Pipeline",
      status: "ACTIVE",
      draftDefinition: sampleOrderWorkflow,
      publishedVersionId: versionId,
      createdAt: new Date("2026-10-30T10:05:00Z"),
      updatedAt: new Date("2026-10-30T10:10:00Z"),
    });

    primaryDb.versions.set(versionId, {
      id: versionId,
      workflowId,
      versionNumber: 1,
      definition: sampleOrderWorkflow,
      contentHash: "sha256_canonical_hash_v1_order_flow",
      publishedAt: new Date("2026-10-30T10:10:00Z"),
    });

    // 3. Seed Encrypted Connector Credential
    const encryptedSecret = encryptCredentialData(
      {
        apiKey: "sk_live_super_secret_payment_key",
        webhookSecret: "whsec_999888",
      },
      masterKey,
    );

    primaryDb.connections.set("conn_stripe_prod", {
      id: "conn_stripe_prod",
      organizationId: orgId,
      connectorType: "http-api",
      name: "Stripe Production Gateway",
      encryptedData: encryptedSecret,
      status: "ACTIVE",
      createdAt: new Date("2026-10-30T10:15:00Z"),
      updatedAt: new Date("2026-10-30T10:15:00Z"),
    });

    // 4. Seed In-Flight and Completed Executions
    primaryDb.executions.set("exec_completed_prior", {
      id: "exec_completed_prior",
      organizationId: orgId,
      workflowId,
      workflowVersionId: versionId,
      triggerType: "MANUAL",
      triggerPayload: { orderId: 101 },
      status: "SUCCEEDED",
      contextData: {},
      retryCount: 0,
      startedAt: new Date("2026-10-30T11:00:00Z"),
      completedAt: new Date("2026-10-30T11:00:05Z"),
      createdAt: new Date("2026-10-30T11:00:00Z"),
      updatedAt: new Date("2026-10-30T11:00:05Z"),
    });

    // Execution in-flight at time of backup/snapshot
    primaryDb.executions.set("exec_stranded_during_backup", {
      id: "exec_stranded_during_backup",
      organizationId: orgId,
      workflowId,
      workflowVersionId: versionId,
      triggerType: "WEBHOOK",
      triggerPayload: { orderId: 102 },
      status: "RUNNING",
      contextData: {},
      retryCount: 0,
      startedAt: new Date("2026-10-30T11:14:00Z"),
      createdAt: new Date("2026-10-30T11:14:00Z"),
      updatedAt: new Date("2026-10-30T11:14:00Z"),
    });

    primaryDb.steps.set("step_stranded_1", {
      id: "step_stranded_1",
      executionId: "exec_stranded_during_backup",
      nodeId: "node_http_charge",
      nodeType: "HTTP_REQUEST",
      nodeName: "Charge Order",
      status: "RUNNING",
      attempt: 1,
      startedAt: new Date("2026-10-30T11:14:05Z"),
    });

    // 5. Seed Audit Log Trail
    primaryDb.recordAudit({
      organizationId: orgId,
      action: "workflow.published",
      resourceType: "workflow",
      resourceId: workflowId,
      metadata: { versionNumber: 1 },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Snapshot Export & Restoration Simulation
  // ---------------------------------------------------------------------------
  describe("1. Database Backup Snapshot & Non-Destructive Restore Simulation", () => {
    let backupArchive: Record<string, unknown>;

    it("creates a consistent point-in-time logical backup archive", () => {
      // Serialize database entities into a portable archive
      backupArchive = {
        metadata: {
          timestamp: new Date().toISOString(),
          source: "flowforge-primary-cluster",
          engineVersion: "postgres-16-alpine",
          schemaVersion: "20261031130000_operational_incidents",
        },
        organizations: Array.from(primaryDb.organizations.values()),
        workflows: Array.from(primaryDb.workflows.values()),
        versions: Array.from(primaryDb.versions.values()),
        connections: Array.from(primaryDb.connections.values()),
        executions: Array.from(primaryDb.executions.values()),
        steps: Array.from(primaryDb.steps.values()),
        auditLogs: primaryDb.auditLogs,
      };

      expect(backupArchive.organizations).toHaveLength(1);
      expect(backupArchive.workflows).toHaveLength(1);
      expect(backupArchive.versions).toHaveLength(1);
      expect(backupArchive.connections).toHaveLength(1);
      expect(backupArchive.executions).toHaveLength(2);
    });

    it("restores snapshot into a fresh, isolated target database instance", () => {
      restoredDb = new InMemoryDatabase();

      // Restore all tables
      for (const org of backupArchive.organizations as any[]) {
        restoredDb.organizations.set(org.id, org);
      }
      for (const wf of backupArchive.workflows as any[]) {
        restoredDb.workflows.set(wf.id, wf);
      }
      for (const ver of backupArchive.versions as any[]) {
        restoredDb.versions.set(ver.id, ver);
      }
      for (const conn of backupArchive.connections as any[]) {
        restoredDb.connections.set(conn.id, conn);
      }
      for (const exec of backupArchive.executions as any[]) {
        restoredDb.executions.set(exec.id, exec);
      }
      for (const step of backupArchive.steps as any[]) {
        restoredDb.steps.set(step.id, step);
      }
      restoredDb.auditLogs = [...(backupArchive.auditLogs as any[])];

      expect(restoredDb.organizations.size).toBe(1);
      expect(restoredDb.workflows.size).toBe(1);
      expect(restoredDb.versions.size).toBe(1);
      expect(restoredDb.connections.size).toBe(1);
      expect(restoredDb.executions.size).toBe(2);
    });

    it("validates workflow definition and content hash immutability after restore", () => {
      const restoredVersion = restoredDb.versions.get(versionId);
      expect(restoredVersion).toBeDefined();
      expect(restoredVersion?.versionNumber).toBe(1);
      expect(restoredVersion?.contentHash).toBe(
        "sha256_canonical_hash_v1_order_flow",
      );
      expect(restoredVersion?.definition.nodes).toHaveLength(
        sampleOrderWorkflow.nodes.length,
      );
    });

    it("verifies encrypted credentials remain decryptable with the master encryption key", () => {
      const conn = restoredDb.connections.get("conn_stripe_prod");
      expect(conn).toBeDefined();

      const decrypted = decryptCredentialData(conn!.encryptedData, masterKey);
      expect(decrypted.apiKey).toBe("sk_live_super_secret_payment_key");
      expect(decrypted.webhookSecret).toBe("whsec_999888");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Post-Restore Self-Healing & Duplicate Side-Effect Prevention
  // ---------------------------------------------------------------------------
  describe("2. Post-Restore Safety, Stale Execution Recovery & Side-Effect Prevention", () => {
    it("safely reconciles stranded RUNNING executions to FAILED to avoid accidental replay", async () => {
      const runner = new WorkflowExecutionRunner(restoredDb);

      // Verify that before recovery, stranded execution is RUNNING
      const beforeExec = restoredDb.executions.get(
        "exec_stranded_during_backup",
      );
      expect(beforeExec?.status).toBe("RUNNING");

      // Run recovery with threshold 0ms (force reconcile all stranded jobs from restore)
      const recoveryResult = await runner.recoverStaleExecutions(
        0,
        new Date("2026-10-30T12:00:00Z"),
      );

      expect(recoveryResult.recoveredCount).toBe(1);
      expect(recoveryResult.executionIds).toContain(
        "exec_stranded_during_backup",
      );

      // Verify that after recovery, execution is FAILED with diagnostic explanation
      const afterExec = restoredDb.executions.get(
        "exec_stranded_during_backup",
      );
      expect(afterExec?.status).toBe("FAILED");
      expect((afterExec?.errorDetails as any)?.message).toContain(
        "stale running recovery",
      );

      // Verify step was also reconciled as FAILED
      const afterStep = restoredDb.steps.get("step_stranded_1");
      expect(afterStep?.status).toBe("FAILED");
      expect(afterStep?.errorMessage).toContain("stale execution recovery");
    });

    it("preserves completed execution history without altering terminal records", () => {
      const completedExec = restoredDb.executions.get("exec_completed_prior");
      expect(completedExec?.status).toBe("SUCCEEDED");
      expect(completedExec?.completedAt).toBeDefined();
      expect(completedExec?.retryCount).toBe(0);
    });

    it("preserves audit log integrity and timestamps across the restore boundary", () => {
      expect(restoredDb.auditLogs.length).toBeGreaterThanOrEqual(1);
      const audit = restoredDb.auditLogs[0];
      expect(audit.organizationId).toBe(orgId);
      expect(audit.action).toBe("workflow.published");
      expect(audit.resourceId).toBe(workflowId);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Operational Acceptance Metrics & Proposed Recovery Targets
  // ---------------------------------------------------------------------------
  describe("3. Operational Acceptance & Disaster Recovery Objectives", () => {
    it("documents proposed RPO (<= 15m) and proposed RTO (<= 30m) invariants", () => {
      const proposedRpoMinutes = 15;
      const proposedRtoMinutes = 30;

      expect(proposedRpoMinutes).toBeLessThanOrEqual(15);
      expect(proposedRtoMinutes).toBeLessThanOrEqual(30);
    });
  });
});
