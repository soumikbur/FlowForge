import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";

describe("Prompt 29: Enterprise Event Streaming, Real-Time Data Integration, and Event-Driven Orchestration", () => {
  let orgA: any;
  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;

  let orgB: any;
  let ownerUserB: any;
  let ownerTokenB: string;

  let workflowA1: any;
  let workflowA2: any;
  let versionA1: any;
  let versionA2: any;

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  beforeEach(() => {
    resetRateLimits();
    apiStore.clear();

    // 1. Setup Tenant A
    orgA = {
      id: `org_stream_${Date.now()}`,
      name: "Acme Event Streams",
      slug: `acme-streams-${Date.now()}`,
      billingEmail: "events@acme.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Setup Tenant B
    orgB = {
      id: `org_rival_${Date.now()}`,
      name: "Rival Industries",
      slug: `rival-${Date.now()}`,
      billingEmail: "events@rival.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Setup Users
    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@acme.corp",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@rival.corp",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Memberships
    apiStore.memberships.set("mem_a1", {
      id: "mem_a1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_a2", {
      id: "mem_a2",
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_a3", {
      id: "mem_a3",
      organizationId: orgA.id,
      userId: memberUserA.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_a4", {
      id: "mem_a4",
      organizationId: orgA.id,
      userId: viewerUserA.id,
      role: "VIEWER",
    });
    apiStore.memberships.set("mem_b1", {
      id: "mem_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    // 5. Sessions
    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    memberTokenA = `tok_member_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

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

    // 6. Setup Active Workflows with Event Triggers in Org A
    workflowA1 = {
      id: `wf_order_processor_${Date.now()}`,
      organizationId: orgA.id,
      name: "High Value Order Processor",
      slug: "order-processor",
      status: "ACTIVE",
      publishedVersionId: "ver_a1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    versionA1 = {
      id: "ver_a1",
      workflowId: workflowA1.id,
      versionNumber: 1,
      definition: {
        nodes: [
          {
            id: "node_trig_order",
            type: "TRIGGER",
            name: "Order Event Trigger",
            config: {
              triggerType: "EVENT",
              eventType: "order.created",
              source: "shopify",
              eventFilter: "data.amount > 100",
            },
          },
          {
            id: "node_end",
            type: "END",
            name: "End",
            config: {},
          },
        ],
        edges: [{ id: "e1", source: "node_trig_order", target: "node_end" }],
      },
      createdAt: new Date(),
    };

    workflowA2 = {
      id: `wf_audit_logger_${Date.now()}`,
      organizationId: orgA.id,
      name: "Global Order Audit Logger",
      slug: "order-audit-logger",
      status: "ACTIVE",
      publishedVersionId: "ver_a2",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    versionA2 = {
      id: "ver_a2",
      workflowId: workflowA2.id,
      versionNumber: 1,
      definition: {
        nodes: [
          {
            id: "node_trig_wildcard",
            type: "TRIGGER",
            name: "Wildcard Order Trigger",
            config: {
              triggerType: "EVENT",
              eventType: "order.*", // wildcard pattern
            },
          },
        ],
        edges: [],
      },
      createdAt: new Date(),
    };

    apiStore.workflows.set(workflowA1.id, workflowA1);
    apiStore.versions.set(versionA1.id, versionA1);
    apiStore.workflows.set(workflowA2.id, workflowA2);
    apiStore.versions.set(versionA2.id, versionA2);
  });

  describe("1. Canonical Event Model & Schema Validation", () => {
    it("should accept valid canonical event and return 202 with assigned metadata", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.created",
          source: "shopify",
          subject: "order_1001",
          data: { amount: 250, customerEmail: "buyer@example.com" },
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accepted).toBe(true);
      expect(res.body.data.eventId).toBeDefined();
      expect(res.body.data.executionIds.length).toBeGreaterThan(0);

      // Verify persisted in store
      const persisted = apiStore.streamEvents.get(res.body.data.eventId);
      expect(persisted).toBeDefined();
      expect(persisted?.specVersion).toBe("1.0");
      expect(persisted?.dataClassification).toBe("INTERNAL");
      expect(persisted?.organizationId).toBe(orgA.id);
    });

    it("should reject event missing required 'type' or 'source' with 400", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          source: "shopify",
          data: { amount: 250 },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should reject events exceeding maximum payload size limit (1MB)", async () => {
      const largeData = { blob: "x".repeat(1024 * 1024 + 10) };
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.created",
          source: "shopify",
          data: largeData,
        });

      expect([400, 413]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("should prevent client-supplied organizationId from spoofing another tenant", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          organizationId: orgB.id, // malicious spoof attempt
          type: "order.created",
          source: "shopify",
          data: { amount: 150 },
        });

      expect(res.status).toBe(202);
      const persisted = apiStore.streamEvents.get(res.body.data.eventId);
      expect(persisted?.organizationId).toBe(orgA.id); // Grounded in trusted auth context
    });
  });

  describe("2. Deduplication & Idempotency", () => {
    it("should acknowledge duplicate event within deduplication window with 200 OK without re-executing", async () => {
      const dedupKey = `dedup_order_test_${Date.now()}`;

      // First ingestion
      const res1 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          idempotencyKey: dedupKey,
          type: "order.created",
          source: "shopify",
          data: { amount: 500 },
        });

      expect(res1.status).toBe(202);
      expect(res1.body.data.duplicate).toBe(false);
      const originalEventId = res1.body.data.eventId;
      const originalExecutions = res1.body.data.executionIds;

      // Duplicate ingestion with identical idempotency key
      const res2 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          idempotencyKey: dedupKey,
          type: "order.created",
          source: "shopify",
          data: { amount: 500 },
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.duplicate).toBe(true);
      expect(res2.body.data.eventId).toBe(originalEventId);
      expect(res2.body.data.executionIds).toEqual(originalExecutions);
    });

    it("should support batch ingestion and return per-event ingestion summary", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          events: [
            { type: "order.created", source: "shopify", data: { amount: 300 } },
            {
              type: "customer.churned",
              source: "crm",
              data: { customerId: "c1" },
            },
          ],
        });

      expect(res.status).toBe(202);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.accepted).toBe(2);
      expect(res.body.data.results.length).toBe(2);
    });
  });

  describe("3. Event Routing, Triggers & Fan-Out", () => {
    it("should route event to both exact filter-matching workflow and wildcard workflow (fan-out)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.created",
          source: "shopify",
          data: { amount: 350 }, // matches both workflowA1 (> 100) and workflowA2 (order.*)
        });

      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe("ROUTED");
      expect(res.body.data.executionIds.length).toBe(2);

      // Verify created executions
      for (const execId of res.body.data.executionIds) {
        const exec = apiStore.executions.get(execId);
        expect(exec).toBeDefined();
        expect(exec?.triggerType).toBe("EVENT");
        expect(exec?.contextData.event.type).toBe("order.created");
      }
    });

    it("should skip workflow when filter expression evaluates to false", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.created",
          source: "shopify",
          data: { amount: 50 }, // < 100: fails workflowA1 filter, matches only workflowA2 (order.*)
        });

      expect(res.status).toBe(202);
      expect(res.body.data.executionIds.length).toBe(1);
      const exec = apiStore.executions.get(res.body.data.executionIds[0]);
      expect(exec?.workflowId).toBe(workflowA2.id);
    });

    it("should record NO_MATCH when no active workflow triggers on the event type", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "user.login",
          source: "auth0",
          data: { userId: "u1" },
        });

      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe("NO_MATCH");
      expect(res.body.data.executionIds.length).toBe(0);
    });
  });

  describe("4. Ordering & Partitioning", () => {
    it("should track sequential partition state when partitionKey is provided", async () => {
      const partitionKey = `account_${Date.now()}`;

      const res1 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.created",
          source: "shopify",
          partitionKey,
          data: { amount: 200 },
        });

      const res2 = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/ingest`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          type: "order.paid",
          source: "shopify",
          partitionKey,
          data: { amount: 200 },
        });

      expect(res1.status).toBe(202);
      expect(res2.status).toBe(202);

      const evt1 = apiStore.streamEvents.get(res1.body.data.eventId);
      const evt2 = apiStore.streamEvents.get(res2.body.data.eventId);
      expect(evt1?.partitionKey).toBe(partitionKey);
      expect(evt2?.partitionKey).toBe(partitionKey);
    });
  });

  describe("5. Dead-Letter Queue & Authorized Redrive", () => {
    it("should list dead-lettered events and allow authorized redrive", async () => {
      // Seed dead letter event
      const dlEventId = `evt_dl_${Date.now()}`;
      apiStore.streamEvents.set(dlEventId, {
        id: dlEventId,
        type: "order.created",
        specVersion: "1.0",
        organizationId: orgA.id,
        source: "shopify",
        correlationId: "corr_dl_1",
        contentType: "application/json",
        data: { amount: 400 },
        dataClassification: "INTERNAL",
        status: "DEAD_LETTERED",
        attempts: 3,
        maxAttempts: 3,
        errorMessage: "Simulated downstream consumer timeout",
        executionIds: [],
        time: new Date(),
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 1. List dead-letter events
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/events/dead-letter`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(listRes.status).toBe(200);
      expect(
        listRes.body.data.events.some((e: any) => e.id === dlEventId),
      ).toBe(true);

      // 2. Redrive dead-letter event
      const redriveRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/events/dead-letter/${dlEventId}/redrive`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(redriveRes.status).toBe(200);
      expect(redriveRes.body.data.status).toBe("ROUTED");
      expect(redriveRes.body.data.executionIds.length).toBeGreaterThan(0);

      // Verify audit log recorded
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.action === "event.dead_letter_redriven" &&
          a.resourceId === dlEventId,
      );
      expect(audit).toBeDefined();
    });

    it("should reject redrive on event that is not dead-lettered", async () => {
      const activeEventId = `evt_active_${Date.now()}`;
      apiStore.streamEvents.set(activeEventId, {
        id: activeEventId,
        type: "order.created",
        specVersion: "1.0",
        organizationId: orgA.id,
        source: "shopify",
        correlationId: "corr_active",
        contentType: "application/json",
        data: { amount: 150 },
        dataClassification: "INTERNAL",
        status: "ROUTED",
        attempts: 1,
        maxAttempts: 3,
        executionIds: [],
        time: new Date(),
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/events/dead-letter/${activeEventId}/redrive`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });
  });

  describe("6. Event Replay & Recovery", () => {
    it("should preview replay scope before execution", async () => {
      const previewRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/replay/preview`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          types: ["order.created"],
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.success).toBe(true);
      expect(previewRes.body.data.matchingEventCount).toBeDefined();
      expect(previewRes.body.data.targetWorkflows).toBeDefined();
    });

    it("should execute authorized replay creating cloned events with replayedFromId and audit log", async () => {
      // Seed an eligible historical event
      const histEvtId = `evt_hist_${Date.now()}`;
      apiStore.streamEvents.set(histEvtId, {
        id: histEvtId,
        type: "order.created",
        specVersion: "1.0",
        organizationId: orgA.id,
        source: "shopify",
        correlationId: "corr_hist",
        contentType: "application/json",
        data: { amount: 600 },
        dataClassification: "INTERNAL",
        status: "ROUTED",
        attempts: 1,
        maxAttempts: 3,
        executionIds: [],
        time: new Date(),
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const replayRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/replay`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          eventIds: [histEvtId],
        });

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.data.replayedCount).toBe(1);
      expect(replayRes.body.data.originalEventIds).toContain(histEvtId);
      expect(replayRes.body.data.replayedEventIds.length).toBe(1);

      // Verify replayed event in store
      const replayedEvtId = replayRes.body.data.replayedEventIds[0];
      const replayedEvt = apiStore.streamEvents.get(replayedEvtId);
      expect(replayedEvt).toBeDefined();
      expect(replayedEvt?.replayedFromId).toBe(histEvtId);
      expect(replayedEvt?.metadata?.isReplay).toBe(true);

      // Verify audit log
      const audit = apiStore.auditLogs.find(
        (a) => a.action === "event.replay_executed",
      );
      expect(audit).toBeDefined();
    });

    it("should reject replay requests from unauthorized roles (VIEWER / MEMBER)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/replay`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          types: ["order.created"],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("7. Connector Event Subscriptions", () => {
    it("should manage connector subscription lifecycle (create, list, update, delete)", async () => {
      // 1. Create subscription
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/subscriptions`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          connectorId: "conn_shopify_orders",
          name: "Shopify Store Order Events",
          eventTypes: ["order.created", "order.fulfilled"],
          deliveryMode: "PUSH",
        });

      expect(createRes.status).toBe(201);
      const subId = createRes.body.data.id;
      expect(subId).toBeDefined();
      expect(createRes.body.data.status).toBe("ACTIVE");

      // 2. List subscriptions
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/events/subscriptions`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((s: any) => s.id === subId)).toBe(true);

      // 3. Update subscription
      const updateRes = await request(app)
        .patch(`/api/v1/organizations/${orgA.id}/events/subscriptions/${subId}`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          status: "SUSPENDED",
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe("SUSPENDED");

      // 4. Delete subscription
      const delRes = await request(app)
        .delete(
          `/api/v1/organizations/${orgA.id}/events/subscriptions/${subId}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(delRes.status).toBe(200);
      expect(apiStore.connectorSubscriptions.has(subId)).toBe(false);
    });
  });

  describe("8. Sensitive Data Redaction & Explorer", () => {
    it("should mask sensitive keys in event data when redact=true is requested", async () => {
      const secretEvtId = `evt_secret_${Date.now()}`;
      apiStore.streamEvents.set(secretEvtId, {
        id: secretEvtId,
        type: "payment.processed",
        specVersion: "1.0",
        organizationId: orgA.id,
        source: "stripe",
        correlationId: "corr_secret",
        contentType: "application/json",
        data: {
          token: "tok_visa_4242",
          apiKey: "sk_live_secretkey1234",
          amount: 89.99,
          customer: "Alice",
        },
        dataClassification: "CONFIDENTIAL",
        status: "ROUTED",
        attempts: 1,
        maxAttempts: 3,
        executionIds: [],
        time: new Date(),
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/events/${secretEvtId}?redact=true`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.data.token).toBe("••••••••4242");
      expect(res.body.data.data.apiKey).toBe("••••••••1234");
      expect(res.body.data.data.amount).toBe(89.99);
      expect(res.body.data.data.customer).toBe("Alice");
    });
  });

  describe("9. Observability & Metrics", () => {
    it("should return aggregated metrics across event stream", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/events/metrics`)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalIngested).toBeDefined();
      expect(res.body.data.totalRouted).toBeDefined();
      expect(res.body.data.byEventType).toBeDefined();
      expect(res.body.data.bySource).toBeDefined();
      expect(res.body.data.queueLagMs).toBeDefined();
    });
  });

  describe("10. Strict Multi-Tenant Isolation", () => {
    it("should prevent Tenant B from reading or replaying Tenant A events", async () => {
      const evtId = `evt_iso_${Date.now()}`;
      apiStore.streamEvents.set(evtId, {
        id: evtId,
        type: "order.created",
        specVersion: "1.0",
        organizationId: orgA.id,
        source: "shopify",
        correlationId: "corr_iso",
        contentType: "application/json",
        data: { amount: 100 },
        dataClassification: "INTERNAL",
        status: "ROUTED",
        attempts: 1,
        maxAttempts: 3,
        executionIds: [],
        time: new Date(),
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Tenant B tries to read Org A event
      const readRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/events/${evtId}`)
        .set("Authorization", `Bearer ${ownerTokenB}`);

      expect(readRes.status).toBe(403);

      // Tenant B tries to replay Org A event
      const replayRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/events/replay`)
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({
          eventIds: [evtId],
        });

      expect(replayRes.status).toBe(403);
    });
  });
});
