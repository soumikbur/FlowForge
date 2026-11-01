import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resilienceService } from "../../apps/api/src/services/resilience.service.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { WorkflowExecutionRunner } from "../../apps/worker/src/runner.js";
import { WorkflowSchedulerService } from "../../apps/worker/src/scheduler.js";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 31: High Availability, Multi-Region Architecture, and Disaster-Resilient Execution", () => {
  let orgA: any;
  let orgB: any;
  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerUserB: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;
  let ownerTokenB: string;

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  const sampleDefinition: WorkflowDefinition = {
    schemaVersion: "1.0",
    id: "wf_ha_demo",
    name: "HA Disaster Resilience Demo",
    nodes: [
      {
        id: "trigger_1",
        name: "Trigger Node",
        type: "TRIGGER",
        config: {},
      },
      {
        id: "http_1",
        name: "Remote External Payment API",
        type: "HTTP_REQUEST",
        config: {
          url: "https://api.external-service.com/v1/charge",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      },
      {
        id: "end_1",
        name: "End Node",
        type: "END",
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "http_1" },
      { id: "e2", source: "http_1", target: "end_1" },
    ],
  };

  beforeEach(() => {
    resetRateLimits();
    resilienceService.resetShutdown();
    apiStore.clear();

    // 1. Setup Tenant A
    orgA = {
      id: `org_ha_${Date.now()}`,
      name: "Acme Cloud Infrastructure",
      slug: `acme-cloud-${Date.now()}`,
      billingEmail: "infra@acme.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Setup Tenant B (for multi-tenant isolation testing)
    orgB = {
      id: `org_dr_other_${Date.now()}`,
      name: "Competitor Cloud",
      slug: `comp-cloud-${Date.now()}`,
      billingEmail: "infra@comp.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Setup Users
    ownerUserA = {
      id: `usr_owner_${Date.now()}`,
      email: "owner@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_${Date.now()}`,
      email: "admin@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_${Date.now()}`,
      email: "member@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_${Date.now()}`,
      email: "viewer@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_other_${Date.now()}`,
      email: "owner@comp.corp",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Memberships
    apiStore.memberships.set("mem_1", {
      id: "mem_1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_2", {
      id: "mem_2",
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_3", {
      id: "mem_3",
      organizationId: orgA.id,
      userId: memberUserA.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_4", {
      id: "mem_4",
      organizationId: orgA.id,
      userId: viewerUserA.id,
      role: "VIEWER",
    });
    apiStore.memberships.set("mem_5", {
      id: "mem_5",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    // 5. Auth Sessions
    ownerTokenA = `tok_owner_${Date.now()}`;
    adminTokenA = `tok_admin_${Date.now()}`;
    memberTokenA = `tok_member_${Date.now()}`;
    viewerTokenA = `tok_viewer_${Date.now()}`;
    ownerTokenB = `tok_other_${Date.now()}`;

    const exp = new Date(Date.now() + 86400000);
    apiStore.sessions.set(ownerTokenA, {
      id: "s1",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(adminTokenA, {
      id: "s2",
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(memberTokenA, {
      id: "s3",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(viewerTokenA, {
      id: "s4",
      userId: viewerUserA.id,
      token: viewerTokenA,
      expiresAt: exp,
      createdAt: new Date(),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: "s5",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: exp,
      createdAt: new Date(),
    });
  });

  describe("1. Health, Detailed Readiness & Request Draining during Graceful Shutdown", () => {
    it("returns 200 on /health and /health/live probes with service uptime", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.uptime).toBe("number");

      const liveRes = await request(app).get("/health/live");
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.status).toBe("healthy");
    });

    it("returns 200 on /ready and /health/ready with detailed dependency breakdown", async () => {
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.dependencies.database).toBe("connected");
      expect(res.body.dependencies.circuitBreakers).toBe("healthy");
      expect(res.body.dependencies.workers).toBeDefined();
      expect(typeof res.body.dependencies.workers.activeExecutions).toBe(
        "number",
      );
      expect(typeof res.body.system.memoryUsedMb).toBe("number");
    });

    it("sheds traffic with 503 and Retry-After header during graceful shutdown while health remains alive", async () => {
      resilienceService.startGracefulShutdown();
      expect(resilienceService.isShuttingDown()).toBe(true);

      // Readiness probe immediately signals shutting_down with 503
      const readyRes = await request(app).get("/ready");
      expect(readyRes.status).toBe(503);
      expect(readyRes.body.status).toBe("shutting_down");

      // Operational request gets rejected with 503 and Retry-After
      const opRes = await request(app)
        .post("/api/v1/resilience/failover/simulate")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ sourceRegion: "us-east-1", targetRegion: "us-west-2" });

      expect(opRes.status).toBe(503);
      expect(opRes.headers["retry-after"]).toBe("5");
      expect(opRes.body.error.code).toBe("SERVER_SHUTTING_DOWN");

      // Liveness probe continues returning 200 during request draining
      const liveRes = await request(app).get("/health");
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.status).toBe("healthy");

      // Reset shutdown restores normal operation
      resilienceService.resetShutdown();
      const restoredReady = await request(app).get("/ready");
      expect(restoredReady.status).toBe(200);
      expect(restoredReady.body.status).toBe("ready");
    });
  });

  describe("2. Distributed Execution Leases with Fencing Tokens", () => {
    it("enforces mutual exclusion preventing dual-worker execution ownership", () => {
      const runnerA = new WorkflowExecutionRunner(apiStore, {
        workerId: "worker-node-alpha",
      });
      const runnerB = new WorkflowExecutionRunner(apiStore, {
        workerId: "worker-node-beta",
      });

      const execId = `exec_lease_test_${Date.now()}`;

      // Worker Alpha acquires lease
      const leaseA = runnerA.acquireExecutionLease(
        execId,
        "worker-node-alpha",
        5000,
      );
      expect(leaseA).not.toBeNull();
      expect(leaseA?.workerId).toBe("worker-node-alpha");
      expect(leaseA?.leaseToken).toBeDefined();
      expect(leaseA?.renewCount).toBe(0);

      // Worker Beta attempts to acquire lease on same execution -> rejected
      const leaseB = runnerB.acquireExecutionLease(
        execId,
        "worker-node-beta",
        5000,
      );
      expect(leaseB).toBeNull();
    });

    it("supports heartbeat lease renewal and rejects unauthorized or stale fencing tokens", () => {
      const runner = new WorkflowExecutionRunner(apiStore, {
        workerId: "worker-node-primary",
      });
      const execId = `exec_renew_test_${Date.now()}`;

      const lease = runner.acquireExecutionLease(
        execId,
        "worker-node-primary",
        2000,
      )!;
      expect(lease).toBeDefined();

      // Valid renewal by holding worker with correct token
      const renewed = runner.renewExecutionLease(
        execId,
        "worker-node-primary",
        lease.leaseToken,
        3000,
      );
      expect(renewed).toBe(true);

      const updatedLease = apiStore.executionLeases.get(execId);
      expect(updatedLease?.renewCount).toBe(1);

      // Stale / bogus token fails renewal
      const badTokenRenew = runner.renewExecutionLease(
        execId,
        "worker-node-primary",
        "bogus-token-1234",
      );
      expect(badTokenRenew).toBe(false);

      // Different worker ID fails renewal
      const wrongWorkerRenew = runner.renewExecutionLease(
        execId,
        "worker-node-imposter",
        lease.leaseToken,
      );
      expect(wrongWorkerRenew).toBe(false);
    });

    it("allows expired lease stealing with a fresh fencing token and rejects old zombie worker tokens", () => {
      const runnerA = new WorkflowExecutionRunner(apiStore, {
        workerId: "worker-stalled",
      });
      const runnerB = new WorkflowExecutionRunner(apiStore, {
        workerId: "worker-failover",
      });

      const execId = `exec_steal_test_${Date.now()}`;

      // Worker A acquires lease with short TTL
      const leaseA = runnerA.acquireExecutionLease(
        execId,
        "worker-stalled",
        50,
      )!;

      // Simulate lease expiration
      const expiredLease = apiStore.executionLeases.get(execId)!;
      expiredLease.expiresAt = new Date(Date.now() - 100);
      apiStore.executionLeases.set(execId, expiredLease);

      // Worker B acquires the expired lease
      const leaseB = runnerB.acquireExecutionLease(
        execId,
        "worker-failover",
        5000,
      );
      expect(leaseB).not.toBeNull();
      expect(leaseB?.workerId).toBe("worker-failover");
      expect(leaseB?.leaseToken).not.toBe(leaseA.leaseToken);

      // Worker A wakes up and attempts to release or renew with stale token -> rejected
      const releasedByZombie = runnerA.releaseExecutionLease(
        execId,
        "worker-stalled",
        leaseA.leaseToken,
      );
      expect(releasedByZombie).toBe(false);

      // Current active owner Worker B releases cleanly
      const releasedByActive = runnerB.releaseExecutionLease(
        execId,
        "worker-failover",
        leaseB!.leaseToken,
      );
      expect(releasedByActive).toBe(true);
      expect(apiStore.executionLeases.has(execId)).toBe(false);
    });
  });

  describe("3. Multi-Replica Distributed Scheduler Occurrence Deduplication", () => {
    it("ensures concurrent scheduler replicas dispatch exactly 1 execution per occurrence", async () => {
      const scheduler1 = new WorkflowSchedulerService(
        apiStore,
        "scheduler-replica-1",
      );
      const scheduler2 = new WorkflowSchedulerService(
        apiStore,
        "scheduler-replica-2",
      );
      const scheduler3 = new WorkflowSchedulerService(
        apiStore,
        "scheduler-replica-3",
      );

      // Setup workflow
      const wfId = `wf_sched_${Date.now()}`;
      const verId = `ver_sched_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Scheduled Cron Workflow",
        status: "ACTIVE",
        draftDefinition: sampleDefinition,
        publishedVersionId: verId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set(verId, {
        id: verId,
        workflowId: wfId,
        version: 1,
        definition: sampleDefinition,
        createdAt: new Date(),
      });

      // Setup due schedule
      const schedId = `sched_dedup_${Date.now()}`;
      const dueTime = new Date(Date.now() - 5000);
      apiStore.schedules.set(schedId, {
        id: schedId,
        organizationId: orgA.id,
        workflowId: wfId,
        name: "5-Minute Sync Schedule",
        cronExpression: "*/5 * * * *",
        timezone: "UTC",
        enabled: true,
        misfirePolicy: "RUN_ONCE",
        nextRunAt: dueTime,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Concurrent execution dispatch by all 3 replicas
      const results = await Promise.all([
        scheduler1.processDueSchedule(schedId, dueTime),
        scheduler2.processDueSchedule(schedId, dueTime),
        scheduler3.processDueSchedule(schedId, dueTime),
      ]);

      const dispatched = results.filter((r) => r !== null);
      expect(dispatched.length).toBe(1);

      // Confirm exactly 1 execution created in store
      const allExecs = Array.from(apiStore.executions.values()).filter(
        (e) => e.workflowId === wfId,
      );
      expect(allExecs.length).toBe(1);

      // Confirm distributed claim is registered
      const claim = Array.from(apiStore.scheduleClaims.values()).find(
        (c) => c.scheduleId === schedId,
      );
      expect(claim).toBeDefined();
      expect(claim?.executionId).toBe(dispatched[0]!.id);
    });
  });

  describe("4. Uncertain Side-Effect Recovery and Step Reconciliation", () => {
    it("flags non-idempotent interrupted external actions as REQUIRES_RECONCILIATION rather than blind retrying", async () => {
      const runner = new WorkflowExecutionRunner(apiStore);

      const execId = `exec_side_effect_${Date.now()}`;
      const stepId = `step_http_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgA.id,
        workflowId: "wf_demo",
        workflowVersionId: "ver_demo",
        triggerType: "MANUAL",
        status: "RUNNING",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "http_1",
        nodeType: "HTTP_REQUEST",
        nodeName: "Remote External Payment API",
        status: "RUNNING",
        attempt: 1,
        startedAt: new Date(),
        inputPayload: { amount: 1000, currency: "USD" },
      });

      // Worker crash recovery
      const outcome = await runner.recoverInterruptedExecutions({
        autoResume: true,
      });
      expect(outcome.recoveredCount).toBe(1);
      expect(outcome.failedCount).toBe(1); // Not auto-resumed because of uncertain side effect

      const failedStep = apiStore.steps.get(stepId);
      expect(failedStep?.status).toBe("FAILED");
      expect((failedStep as any).requiresReconciliation).toBe(true);

      const rec = apiStore.stepReconciliations.get(`rec_${stepId}`);
      expect(rec).toBeDefined();
      expect(rec?.status).toBe("REQUIRES_RECONCILIATION");
      expect(rec?.nodeType).toBe("HTTP_REQUEST");

      const execution = apiStore.executions.get(execId);
      expect(execution?.status).toBe("FAILED");
      expect((execution?.errorDetails as any)?.requiresReconciliation).toBe(
        true,
      );
    });

    it("allows operators to reconcile with FAIL, recording resolution and audit trail", async () => {
      const execId = `exec_rec_fail_${Date.now()}`;
      const stepId = `step_fail_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgA.id,
        workflowId: "wf_demo",
        workflowVersionId: "ver_demo",
        triggerType: "MANUAL",
        status: "FAILED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "http_1",
        nodeType: "HTTP_REQUEST",
        status: "FAILED",
        errorMessage: "Interrupted external side-effect",
        requiresReconciliation: true,
      } as any);

      apiStore.stepReconciliations.set(`rec_${stepId}`, {
        id: `rec_${stepId}`,
        executionId: execId,
        stepId,
        nodeId: "http_1",
        nodeType: "HTTP_REQUEST",
        status: "REQUIRES_RECONCILIATION",
        reason: "Interrupted during external side-effect",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/resilience/reconcile/${execId}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          stepId,
          action: "FAIL",
          reason: "Payment declined by vendor gateway",
          notes: "Vendor ticket #8942 confirms charge was not captured.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reconciliation.status).toBe("MANUALLY_RESOLVED");
      expect(res.body.data.reconciliation.resolutionAction).toBe("FAIL");

      // Verify audit trail recorded with tamper-evident chain
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "execution.step_reconciled" && a.resourceId === execId,
      );
      expect(audit).toBeDefined();
      expect(audit?.recordHash).toBeDefined();
    });

    it("allows operators to reconcile with SKIP, marking step completed and re-queuing execution", async () => {
      const execId = `exec_rec_skip_${Date.now()}`;
      const stepId = `step_skip_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgA.id,
        workflowId: "wf_demo",
        workflowVersionId: "ver_demo",
        triggerType: "MANUAL",
        status: "FAILED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "http_1",
        nodeType: "HTTP_REQUEST",
        status: "FAILED",
        requiresReconciliation: true,
      } as any);

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/resilience/reconcile/${execId}/steps/${stepId}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          action: "SKIP",
          reason: "Confirmed payment processed in Stripe dashboard manually",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reconciliation.status).toBe("MANUALLY_RESOLVED");
      expect(res.body.data.reconciliation.resolutionAction).toBe("SKIP");

      const step = apiStore.steps.get(stepId);
      expect(step?.status).toBe("COMPLETED");
      expect(step?.outputPayload?.skippedViaReconciliation).toBe(true);
    });

    it("allows operators to reconcile with RESUME, resetting step to pending", async () => {
      const execId = `exec_rec_resume_${Date.now()}`;
      const stepId = `step_resume_${Date.now()}`;

      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgA.id,
        workflowId: "wf_demo",
        workflowVersionId: "ver_demo",
        triggerType: "MANUAL",
        status: "FAILED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(stepId, {
        id: stepId,
        executionId: execId,
        nodeId: "http_1",
        nodeType: "HTTP_REQUEST",
        status: "FAILED",
        requiresReconciliation: true,
      } as any);

      const res = await request(app)
        .post(`/api/v1/resilience/reconcile/${execId}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          stepId,
          action: "RESUME",
          reason: "Safe idempotent retry verified with vendor idempotency key",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reconciliation.status).toBe("RECONCILED");
      expect(res.body.data.reconciliation.resolutionAction).toBe("RESUME");

      const step = apiStore.steps.get(stepId);
      expect(step?.status).toBe("PENDING");
    });
  });

  describe("5. Database Resilience & Transient Error Retry vs Non-Idempotent Fail-Fast", () => {
    it("identifies transient database errors correctly", () => {
      expect(
        resilienceService.isTransientDatabaseError({
          code: "ECONNRESET",
          message: "socket hang up",
        }),
      ).toBe(true);

      expect(
        resilienceService.isTransientDatabaseError({
          code: "40P01",
          message: "deadlock detected",
        }),
      ).toBe(true);

      expect(
        resilienceService.isTransientDatabaseError({
          code: "P2024",
          message: "Timed out fetching connection from pool",
        }),
      ).toBe(true);

      expect(
        resilienceService.isTransientDatabaseError({
          code: "42601",
          message: "syntax error at or near 'SELECT'",
        }),
      ).toBe(false);

      expect(
        resilienceService.isTransientDatabaseError({
          code: "23505",
          message: "duplicate key value violates unique constraint",
        }),
      ).toBe(false);
    });

    it("retries transient database errors on idempotent operations with exponential backoff", async () => {
      let attempts = 0;
      const transientOp = async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("Connection terminated unexpectedly");
          (err as any).code = "ECONNRESET";
          throw err;
        }
        return "SUCCESS_DATA";
      };

      const result = await resilienceService.executeWithRetry(transientOp, {
        maxRetries: 3,
        backoffMs: 10,
        isIdempotent: true,
      });

      expect(result).toBe("SUCCESS_DATA");
      expect(attempts).toBe(3);
    });

    it("fails fast immediately on non-idempotent operations to prevent partial or duplicate mutations", async () => {
      let attempts = 0;
      const nonIdempotentOp = async () => {
        attempts++;
        const err = new Error("Connection reset during transaction commit");
        (err as any).code = "ECONNRESET";
        throw err;
      };

      await expect(
        resilienceService.executeWithRetry(nonIdempotentOp, {
          maxRetries: 3,
          backoffMs: 10,
          isIdempotent: false, // Critical non-idempotent operation
        }),
      ).rejects.toThrow("Connection reset during transaction commit");

      expect(attempts).toBe(1); // Zero retries
    });
  });

  describe("6. Point-in-Time Backup & Cryptographic Snapshot Verification", () => {
    it("cryptographically verifies point-in-time recovery backup snapshots against SHA-256 hash", async () => {
      const snapshotPayload = JSON.stringify({
        snapshotVersion: "2026.1",
        exportedAt: new Date().toISOString(),
        tables: {
          organizations: [{ id: orgA.id, name: orgA.name }],
          workflows: [{ id: "wf_1", name: "Order Processing" }],
        },
      });

      const validHash = crypto
        .createHash("sha256")
        .update(snapshotPayload)
        .digest("hex");

      const res = await request(app)
        .post("/api/v1/resilience/backup/verify")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          snapshotId: "snap_2026_10_31_pitr",
          snapshotContent: snapshotPayload,
          expectedSha256: validHash,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.matchesExpected).toBe(true);
      expect(res.body.data.recordCount).toBe(2);
    });

    it("flags tampered or corrupted snapshots when hash mismatch is detected", async () => {
      const snapshotPayload = JSON.stringify({
        snapshotVersion: "2026.1",
        data: "tampered_data_content",
      });

      const res = await request(app)
        .post("/api/v1/resilience/backup/verify")
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          snapshotId: "snap_tampered",
          snapshotContent: snapshotPayload,
          expectedSha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.matchesExpected).toBe(false);
    });
  });

  describe("7. Simulated Regional Failover Exercise", () => {
    it("executes simulated failover, drains connections, and logs audit trail", async () => {
      const res = await request(app)
        .post("/api/v1/resilience/failover/simulate")
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          sourceRegion: "us-east-1",
          targetRegion: "eu-central-1",
          drainTimeoutMs: 1000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");
      expect(res.body.data.sourceRegion).toBe("us-east-1");
      expect(res.body.data.targetRegion).toBe("eu-central-1");

      const audit = apiStore.auditLogs.find(
        (a) => a.action === "disaster_recovery.failover_simulated",
      );
      expect(audit).toBeDefined();
    });
  });

  describe("8. RBAC and Multi-Tenant Isolation", () => {
    it("denies reconciliation without resilience:admin permission", async () => {
      const res = await request(app)
        .post("/api/v1/resilience/reconcile/exec_1")
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({ action: "FAIL", reason: "Unauthorized attempt" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("prevents cross-tenant reconciliation access", async () => {
      const execId = `exec_tenant_a_${Date.now()}`;
      apiStore.executions.set(execId, {
        id: execId,
        organizationId: orgA.id,
        workflowId: "wf_1",
        workflowVersionId: "ver_1",
        triggerType: "MANUAL",
        status: "FAILED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Tenant B owner attempts to reconcile Tenant A execution
      const res = await request(app)
        .post(`/api/v1/organizations/${orgB.id}/resilience/reconcile/${execId}`)
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({ action: "SKIP", reason: "Cross-tenant intrusion" });

      expect(res.status).toBe(404);
    });

    it("allows listing active leases and reconciliations with resilience:read", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/resilience/leases`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.activeLeases)).toBe(true);
      expect(Array.isArray(res.body.data.activeClaims)).toBe(true);
      expect(Array.isArray(res.body.data.pendingReconciliations)).toBe(true);
    });
  });
});
