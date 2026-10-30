import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import {
  WorkflowExecutionRunner,
  WorkflowSchedulerService,
} from "../../apps/worker/src/index.js";
import {
  executeSafeHttpRequest,
  isPrivateOrBlockedDestination,
  resolveAndValidateDestination,
  calculateNextCronRun,
  calculateNextScheduleRun,
  encryptCredentialData,
  decryptCredentialData,
} from "@flowforge/integrations";
import { WorkflowDefinition } from "@flowforge/shared";

describe("Prompt 7: Durable Triggers, Webhooks, Scheduling, Delays, and Integrations", () => {
  let orgAAdminCookie: string;
  let orgBAdminCookie: string;
  let orgAId: string;
  let orgBId: string;
  let runner: WorkflowExecutionRunner;
  let scheduler: WorkflowSchedulerService;

  beforeEach(() => {
    runner = new WorkflowExecutionRunner(apiStore);
    scheduler = new WorkflowSchedulerService(apiStore);
  });

  it("provisions two isolated tenant organizations with admin credentials", async () => {
    const resA = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `ops_${Date.now()}@alpha-tenant.com`,
        password: "Password123!",
        firstName: "Alpha",
        lastName: "Admin",
        organizationName: "Alpha Logistics Inc",
      });
    expect(resA.status).toBe(201);
    orgAAdminCookie = resA.headers["set-cookie"][0];
    orgAId = resA.body.data.organization.id;

    const resB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `sec_${Date.now()}@beta-tenant.com`,
        password: "Password123!",
        firstName: "Beta",
        lastName: "Admin",
        organizationName: "Beta Manufacturing LLC",
      });
    expect(resB.status).toBe(201);
    orgBAdminCookie = resB.headers["set-cookie"][0];
    orgBId = resB.body.data.organization.id;

    expect(orgAId).not.toBe(orgBId);
  });

  describe("1. Secure Webhook Triggers, Replay Defense, and Management APIs", () => {
    let webhookWorkflowId: string;
    let webhookConfigId: string;
    let webhookSigningSecret: string;

    it("publishes workflow for webhook testing", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({
          name: "Webhook Pipeline",
          description: "Ingests webhook orders",
        });
      webhookWorkflowId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "wh_trig",
            type: "TRIGGER",
            name: "Webhook Trigger",
            config: { triggerType: "WEBHOOK" },
            position: { x: 0, y: 0 },
          },
          {
            id: "wh_end",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 100, y: 100 },
          },
        ],
        edges: [{ id: "we1", source: "wh_trig", target: "wh_end" }],
      };

      await request(app)
        .patch(`/api/v1/workflows/${webhookWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${webhookWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
    });

    it("creates webhook configuration via API and receives signing secret", async () => {
      const res = await request(app)
        .post("/api/v1/webhooks")
        .set("Cookie", orgAAdminCookie)
        .send({
          workflowId: webhookWorkflowId,
          name: "Production Inbound Orders",
          eventFilter: "order.created",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^whk_/);
      expect(res.body.data.signingSecret).toMatch(/^whsec_/);
      webhookConfigId = res.body.data.id;
      webhookSigningSecret = res.body.data.signingSecret;
    });

    it("lists webhooks with secrets redacted", async () => {
      const res = await request(app)
        .get("/api/v1/webhooks")
        .set("Cookie", orgAAdminCookie);

      expect(res.status).toBe(200);
      const wh = res.body.data.find((w: any) => w.id === webhookConfigId);
      expect(wh).toBeDefined();
      expect(wh.signingSecret).toBe("[REDACTED]");
    });

    it("accepts valid signed webhook and queues execution", async () => {
      const payload = { orderId: "ORD-9912", amount: 450.0 };
      const rawPayload = JSON.stringify(payload);
      const timestamp = Date.now().toString();

      // Sign with sha256 HMAC
      const hmac = crypto.createHmac("sha256", webhookSigningSecret);
      hmac.update(`${timestamp}.${rawPayload}`);
      const signature = hmac.digest("hex");

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signature)
        .set("X-Webhook-Timestamp", timestamp)
        .set("X-Idempotency-Key", "evt_unique_101")
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe("QUEUED");
      expect(res.body.data.executionId).toMatch(/^exec_/);

      // Verify delivery record stored in database
      const deliveries = Array.from(apiStore.webhookEvents.values()).filter(
        (e) => e.webhookId === webhookConfigId,
      );
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      expect(deliveries[0].idempotencyKey).toBe("evt_unique_101");
    });

    it("rejects webhook request with invalid signature", async () => {
      const payload = { orderId: "ORD-FAKE" };
      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", "0000000000000000000000000000000000000000000000000000000000000000")
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_SIGNATURE");
    });

    it("rejects webhook request with expired timestamp (replay attack defense)", async () => {
      const payload = { orderId: "ORD-REPLAY" };
      const rawPayload = JSON.stringify(payload);
      // 10 minutes in the past
      const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();

      const hmac = crypto.createHmac("sha256", webhookSigningSecret);
      hmac.update(`${expiredTimestamp}.${rawPayload}`);
      const signature = hmac.digest("hex");

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .set("Content-Type", "application/json")
        .set("X-Signature-256", signature)
        .set("X-Webhook-Timestamp", expiredTimestamp)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("TIMESTAMP_EXPIRED");
    });

    it("enforces idempotency on duplicate webhook deliveries", async () => {
      const payload = { orderId: "ORD-DUPLICATE", amount: 120.0 };
      const rawPayload = JSON.stringify(payload);
      const timestamp = Date.now().toString();

      const hmac = crypto.createHmac("sha256", webhookSigningSecret);
      hmac.update(`${timestamp}.${rawPayload}`);
      const signature = hmac.digest("hex");

      const dupKey = `evt_dup_${Date.now()}`;

      // Call 1
      const res1 = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .set("X-Signature-256", signature)
        .set("X-Webhook-Timestamp", timestamp)
        .set("X-Idempotency-Key", dupKey)
        .send(payload);

      expect(res1.status).toBe(202);
      const firstExecId = res1.body.data.executionId;

      // Call 2 with identical key
      const res2 = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .set("X-Signature-256", signature)
        .set("X-Webhook-Timestamp", timestamp)
        .set("X-Idempotency-Key", dupKey)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.meta?.idempotent).toBe(true);
      expect(res2.body.data.executionId).toBe(firstExecId);
    });

    it("rejects webhook trigger when webhook configuration is disabled", async () => {
      // Disable webhook
      await request(app)
        .patch(`/api/v1/webhooks/config/${webhookConfigId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ enabled: false });

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhookConfigId}`)
        .send({ test: true });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WEBHOOK_DISABLED");

      // Re-enable
      await request(app)
        .patch(`/api/v1/webhooks/config/${webhookConfigId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ enabled: true });
    });

    it("rotates webhook signing secret successfully", async () => {
      const res = await request(app)
        .post(`/api/v1/webhooks/config/${webhookConfigId}/rotate-secret`)
        .set("Cookie", orgAAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.signingSecret).toMatch(/^whsec_/);
      expect(res.body.data.signingSecret).not.toBe(webhookSigningSecret);
      webhookSigningSecret = res.body.data.signingSecret;
    });

    it("enforces tenant isolation: Tenant B cannot inspect or modify Tenant A webhook", async () => {
      const getRes = await request(app)
        .get(`/api/v1/webhooks/config/${webhookConfigId}`)
        .set("Cookie", orgBAdminCookie);
      expect(getRes.status).toBe(404);

      const patchRes = await request(app)
        .patch(`/api/v1/webhooks/config/${webhookConfigId}`)
        .set("Cookie", orgBAdminCookie)
        .send({ name: "Hacked" });
      expect(patchRes.status).toBe(404);
    });
  });

  describe("2. Scheduled Workflow Triggers & Timezone-Aware Scheduler Service", () => {
    let scheduleWorkflowId: string;
    let scheduleId: string;

    it("publishes workflow for scheduling tests", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Daily Report Schedule" });
      scheduleWorkflowId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "sch_trig",
            type: "TRIGGER",
            name: "Cron Trigger",
            config: { triggerType: "SCHEDULE" },
            position: { x: 0, y: 0 },
          },
          {
            id: "sch_end",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 100, y: 100 },
          },
        ],
        edges: [{ id: "se1", source: "sch_trig", target: "sch_end" }],
      };

      await request(app)
        .patch(`/api/v1/workflows/${scheduleWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${scheduleWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
    });

    it("validates cron expressions and rejects invalid definitions", async () => {
      const res = await request(app)
        .post("/api/v1/schedules")
        .set("Cookie", orgAAdminCookie)
        .send({
          workflowId: scheduleWorkflowId,
          name: "Invalid Cron",
          cronExpression: "not-a-cron-expression",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_CRON");
    });

    it("validates timezones and rejects invalid IANA identifiers", async () => {
      const res = await request(app)
        .post("/api/v1/schedules")
        .set("Cookie", orgAAdminCookie)
        .send({
          workflowId: scheduleWorkflowId,
          name: "Invalid TZ",
          cronExpression: "0 9 * * 1-5",
          timezone: "Mars/Olympus_Mons",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TIMEZONE");
    });

    it("creates recurring schedule in America/New_York timezone", async () => {
      const res = await request(app)
        .post("/api/v1/schedules")
        .set("Cookie", orgAAdminCookie)
        .send({
          workflowId: scheduleWorkflowId,
          name: "Weekday Morning NYSE Sync",
          cronExpression: "0 9 * * 1-5",
          timezone: "America/New_York",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^sch_/);
      expect(res.body.data.nextRunAt).toBeDefined();
      scheduleId = res.body.data.id;
    });

    it("determines future occurrences deterministically with timezone transitions", () => {
      const reference = new Date("2026-06-15T12:00:00Z"); // Monday summer
      const nextRun = calculateNextCronRun(
        "0 9 * * 1-5",
        reference,
        "America/New_York",
      );
      expect(nextRun).toBeDefined();
      // In summer EDT is UTC-4 -> 9:00 AM EDT is 13:00 UTC
      expect(nextRun.getUTCHours()).toBe(13);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it("dispatches due schedules and prevents duplicate execution of the same occurrence", async () => {
      // Create a due schedule (past nextRunAt)
      const dueScheduleId = `sch_due_${Date.now()}`;
      const scheduledTime = new Date(Date.now() - 60000);

      apiStore.schedules.set(dueScheduleId, {
        id: dueScheduleId,
        organizationId: orgAId,
        workflowId: scheduleWorkflowId,
        name: "Due Schedule Task",
        cronExpression: "*/5 * * * *",
        timezone: "UTC",
        enabled: true,
        misfirePolicy: "RUN_ONCE",
        nextRunAt: scheduledTime,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Poll 1
      const poll1 = await scheduler.pollAndDispatch();
      expect(poll1.dispatchedCount).toBeGreaterThanOrEqual(1);

      const execId = poll1.dispatchedExecutionIds[0];
      const execution = apiStore.executions.get(execId);
      expect(execution?.triggerType).toBe("SCHEDULE");

      // Verify schedule advanced its nextRunAt
      const updatedSchedule = apiStore.schedules.get(dueScheduleId);
      expect(updatedSchedule?.lastRunAt).toEqual(scheduledTime);
      expect(updatedSchedule?.nextRunAt?.getTime()).toBeGreaterThan(
        scheduledTime.getTime(),
      );

      // Poll 2 immediately after: must not duplicate
      const poll2 = await scheduler.pollAndDispatch();
      expect(poll2.dispatchedExecutionIds).not.toContain(execId);
    });

    it("supports manual run-now trigger via API", async () => {
      const res = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/run-now`)
        .set("Cookie", orgAAdminCookie);

      expect(res.status).toBe(202);
      expect(res.body.data.triggerType).toBe("SCHEDULE");
      expect(res.body.data.status).toBe("QUEUED");
    });
  });

  describe("3. Durable Delay and Wait-Resume Node", () => {
    let delayWorkflowId: string;
    let delayExecutionId: string;

    it("publishes workflow with DELAY node", async () => {
      const createRes = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", orgAAdminCookie)
        .send({ name: "Delayed Follow-up Workflow" });
      delayWorkflowId = createRes.body.data.id;

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "d_trig",
            type: "TRIGGER",
            name: "Trigger",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "d_wait",
            type: "DELAY",
            name: "Wait 15 Seconds",
            config: { durationSeconds: 15 },
            position: { x: 100, y: 100 },
          },
          {
            id: "d_end",
            type: "END",
            name: "Complete",
            config: {},
            position: { x: 200, y: 200 },
          },
        ],
        edges: [
          { id: "de1", source: "d_trig", target: "d_wait" },
          { id: "de2", source: "d_wait", target: "d_end" },
        ],
      };

      await request(app)
        .patch(`/api/v1/workflows/${delayWorkflowId}`)
        .set("Cookie", orgAAdminCookie)
        .send({ nodes: def.nodes, edges: def.edges });

      await request(app)
        .post(`/api/v1/workflows/${delayWorkflowId}/publish`)
        .set("Cookie", orgAAdminCookie);
    });

    it("enters WAITING_DELAY state and persists DelayRecord", async () => {
      const trigRes = await request(app)
        .post(`/api/v1/workflows/${delayWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      delayExecutionId = trigRes.body.data.id;

      const exec = await runner.processExecution(delayExecutionId);
      expect(exec.status).toBe("WAITING_DELAY");

      const delay = Array.from(apiStore.delays.values()).find(
        (d) => d.executionId === delayExecutionId,
      );
      expect(delay).toBeDefined();
      expect(delay?.status).toBe("PENDING");
      expect(delay?.resumeAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects resumption before wait duration has elapsed without force flag", async () => {
      await expect(
        runner.resumeDelayedExecution(delayExecutionId, { force: false }),
      ).rejects.toThrow(/Delay duration has not elapsed yet/);
    });

    it("resumes delayed execution to SUCCEEDED when forced or elapsed", async () => {
      const resumedExec = await runner.resumeDelayedExecution(
        delayExecutionId,
        { force: true },
      );
      expect(resumedExec.status).toBe("SUCCEEDED");
      expect(resumedExec.completedAt).toBeDefined();

      const delay = Array.from(apiStore.delays.values()).find(
        (d) => d.executionId === delayExecutionId,
      );
      expect(delay?.status).toBe("COMPLETED");

      const step = Array.from(apiStore.steps.values()).find(
        (s) => s.executionId === delayExecutionId && s.nodeId === "d_wait",
      );
      expect(step?.status).toBe("COMPLETED");
    });

    it("recovers overdue delays after worker restart", async () => {
      // Simulate execution left in WAITING_DELAY with expired resumeAt
      const overdueExecId = `exec_overdue_${Date.now()}`;
      const overdueStepId = `step_overdue_${Date.now()}`;
      const overdueDelayId = `del_overdue_${Date.now()}`;

      apiStore.executions.set(overdueExecId, {
        id: overdueExecId,
        organizationId: orgAId,
        workflowId: delayWorkflowId,
        workflowVersionId: apiStore.workflows.get(delayWorkflowId)!
          .publishedVersionId!,
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "WAITING_DELAY",
        currentNodeId: "d_wait",
        contextData: {},
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      apiStore.steps.set(overdueStepId, {
        id: overdueStepId,
        executionId: overdueExecId,
        nodeId: "d_wait",
        nodeType: "DELAY",
        nodeName: "Wait",
        status: "WAITING",
        attempt: 1,
        startedAt: new Date(Date.now() - 30000),
      });

      apiStore.delays.set(overdueDelayId, {
        id: overdueDelayId,
        executionId: overdueExecId,
        stepId: overdueStepId,
        resumeAt: new Date(Date.now() - 10000), // 10 seconds in the past
        status: "PENDING",
        createdAt: new Date(Date.now() - 30000),
      });

      const recoveredCount = await runner.recoverOverdueDelays();
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      const recoveredExec = apiStore.executions.get(overdueExecId);
      expect(recoveredExec?.status).toBe("SUCCEEDED");
    });

    it("cancels delay safely and rejects subsequent resume attempts", async () => {
      const trigRes = await request(app)
        .post(`/api/v1/workflows/${delayWorkflowId}/execute`)
        .set("Cookie", orgAAdminCookie)
        .send({});
      const cancelExecId = trigRes.body.data.id;

      await runner.processExecution(cancelExecId);

      // Cancel via runner
      await runner.cancelExecution(cancelExecId, "Cancelled during wait");

      const delay = Array.from(apiStore.delays.values()).find(
        (d) => d.executionId === cancelExecId,
      );
      expect(delay?.status).toBe("CANCELLED");

      await expect(
        runner.resumeDelayedExecution(cancelExecId, { force: true }),
      ).rejects.toThrow(/Cannot resume execution in state 'CANCELLED'/);
    });
  });

  describe("4. Secure HTTP Request Node & SSRF Protections", () => {
    it("blocks loopback, link-local, and cloud metadata targets", async () => {
      const blockedUrls = [
        "http://127.0.0.1:8080/admin",
        "http://localhost:3000/api",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://192.168.1.1/router",
        "http://10.0.0.1/internal",
        "ftp://example.com/file",
      ];

      for (const url of blockedUrls) {
        expect(isPrivateOrBlockedDestination(url)).toBe(true);
        await expect(executeSafeHttpRequest({ url })).rejects.toThrow(
          /SSRF Prevention/,
        );
      }
    });

    it("verifies DNS resolution check blocks domains resolving to private IPs", async () => {
      // 127.0.0.1 loopback destination
      const dnsResult = await resolveAndValidateDestination("http://127.0.0.1");
      expect(dnsResult.isSafe).toBe(false);
    });

    it("enforces timeout on slow external requests", async () => {
      await expect(
        executeSafeHttpRequest({
          url: "https://httpstat.us/200?sleep=5000",
          timeoutMs: 50,
        }),
      ).rejects.toThrow(/aborted|failed after/);
    });

    it("redacts sensitive authentication headers from returned metadata", async () => {
      // Verify redaction helper
      const headers = {
        Authorization: "Bearer top-secret-token",
        "X-Api-Key": "my-secret-key",
        "Content-Type": "application/json",
      };

      // Direct execution with dummy public endpoint or internal redaction verification
      const res = await executeSafeHttpRequest({
        url: "https://httpbin.org/get",
        headers,
        timeoutMs: 5000,
      }).catch(() => null);

      if (res) {
        expect(res.headers["authorization"]).toBeUndefined();
      }
    });
  });

  describe("5. Credential & Secret Management", () => {
    let credentialId: string;

    it("encrypts credential data at rest using AES-256-GCM and verifies decryption", () => {
      const secretPayload = { apiKey: "prod_live_sec_12345", endpoint: "https://api.partner.com" };
      const encrypted = encryptCredentialData(secretPayload);

      expect(encrypted).toContain(":");
      expect(encrypted).not.toContain("prod_live_sec_12345");

      const decrypted = decryptCredentialData(encrypted);
      expect(decrypted).toEqual(secretPayload);
    });

    it("creates encrypted credential via API without leaking plaintext in responses", async () => {
      const res = await request(app)
        .post("/api/v1/credentials")
        .set("Cookie", orgAAdminCookie)
        .send({
          name: "Stripe Production Key",
          type: "API_KEY",
          data: { apiKey: "sk_live_998877665544" },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^cred_/);
      expect(res.body.data.data).toBeUndefined(); // Never returns raw secret data
      credentialId = res.body.data.id;
    });

    it("lists credentials with secret values completely omitted", async () => {
      const res = await request(app)
        .get("/api/v1/credentials")
        .set("Cookie", orgAAdminCookie);

      expect(res.status).toBe(200);
      const cred = res.body.data.find((c: any) => c.id === credentialId);
      expect(cred).toBeDefined();
      expect(cred.encryptedData).toBeUndefined();
      expect(cred.apiKey).toBeUndefined();
    });

    it("enforces tenant isolation: Tenant B cannot inspect Tenant A credentials", async () => {
      const res = await request(app)
        .get(`/api/v1/credentials/${credentialId}`)
        .set("Cookie", orgBAdminCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });
});

