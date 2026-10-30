import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";

describe("Workflow Pagination, Search, Versioning & Archival Integration Tests", () => {
  const userEmail = `wf_engineer_${Date.now()}@flowforge.dev`;
  let cookie: string;
  let orgId: string;
  const createdWorkflowIds: string[] = [];

  const workflowNames = [
    "Order Processing Alpha",
    "Invoice Reminder Beta",
    "Customer Onboarding Gamma",
    "Incident Escalation Delta",
    "Daily Cleanup Epsilon",
  ];

  it("registers user and captures authenticated session", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: userEmail,
      password: "Password123!",
      firstName: "Wf",
      lastName: "Tester",
      organizationName: "Workflow Systems Ltd",
    });

    expect(res.status).toBe(201);
    orgId = res.body.data.organization.id;
    const cookies = res.headers["set-cookie"];
    cookie = cookies[0];
  });

  it("creates 5 workflows for pagination and search testing", async () => {
    for (const name of workflowNames) {
      const res = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", cookie)
        .send({
          name,
          description: `Description for ${name}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      createdWorkflowIds.push(res.body.data.id);
    }

    expect(createdWorkflowIds.length).toBe(5);
  });

  it("paginates workflows correctly (page=1, pageSize=2)", async () => {
    const res = await request(app)
      .get("/api/v1/workflows?page=1&pageSize=2")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(5);
    expect(res.body.meta.pageSize).toBe(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.totalPages).toBe(3);
  });

  it("paginates to the final page (page=3, pageSize=2)", async () => {
    const res = await request(app)
      .get("/api/v1/workflows?page=3&pageSize=2")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.meta.page).toBe(3);
  });

  it("filters workflows by search keyword (case-insensitive)", async () => {
    const res = await request(app)
      .get("/api/v1/workflows?search=alpha")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe("Order Processing Alpha");
  });

  it("filters workflows by partial description keyword", async () => {
    const res = await request(app)
      .get("/api/v1/workflows?search=Gamma")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe("Customer Onboarding Gamma");
  });

  it("validates workflow graph and reports disconnect errors", async () => {
    const targetWfId = createdWorkflowIds[0];

    // Put workflow into an invalid state (broken edge referencing missing target)
    await request(app)
      .patch(`/api/v1/workflows/${targetWfId}`)
      .set("Cookie", cookie)
      .send({
        edges: [
          {
            id: "edge_broken",
            source: "trigger_1",
            target: "non_existent_node",
          },
        ],
      });

    const res = await request(app)
      .post(`/api/v1/workflows/${targetWfId}/validate`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isValid).toBe(false);
  });

  it("rejects publishing an invalid workflow graph", async () => {
    const targetWfId = createdWorkflowIds[0];
    const res = await request(app)
      .post(`/api/v1/workflows/${targetWfId}/publish`)
      .set("Cookie", cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("GRAPH_VALIDATION_FAILED");
  });

  let publishedVersion1Id: string;
  let publishedVersion2Id: string;

  it("publishes version 1 when workflow draft is updated with a valid graph", async () => {
    const targetWfId = createdWorkflowIds[0];

    // Update draft to valid graph
    const updateRes = await request(app)
      .patch(`/api/v1/workflows/${targetWfId}`)
      .set("Cookie", cookie)
      .send({
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Order Webhook",
            config: { triggerType: "WEBHOOK", webhookPath: "/orders" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Finished",
            config: {},
            position: { x: 100, y: 200 },
          },
        ],
        edges: [
          {
            id: "edge_1",
            source: "node_trigger",
            target: "node_end",
          },
        ],
      });

    expect(updateRes.status).toBe(200);

    // Publish
    const pubRes = await request(app)
      .post(`/api/v1/workflows/${targetWfId}/publish`)
      .set("Cookie", cookie);

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.data.version.versionNumber).toBe(1);
    expect(pubRes.body.data.workflow.status).toBe("ACTIVE");
    publishedVersion1Id = pubRes.body.data.version.id;
  });

  it("publishes version 2 with updated node configuration and verifies version sequencing", async () => {
    const targetWfId = createdWorkflowIds[0];

    // Update draft with additional node
    await request(app)
      .patch(`/api/v1/workflows/${targetWfId}`)
      .set("Cookie", cookie)
      .send({
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Order Webhook V2",
            config: { triggerType: "WEBHOOK", webhookPath: "/orders-v2" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Finished V2",
            config: {},
            position: { x: 100, y: 200 },
          },
        ],
        edges: [
          {
            id: "edge_1",
            source: "node_trigger",
            target: "node_end",
          },
        ],
      });

    const pubRes = await request(app)
      .post(`/api/v1/workflows/${targetWfId}/publish`)
      .set("Cookie", cookie);

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.data.version.versionNumber).toBe(2);
    publishedVersion2Id = pubRes.body.data.version.id;
  });

  it("lists all published versions in descending order", async () => {
    const targetWfId = createdWorkflowIds[0];
    const res = await request(app)
      .get(`/api/v1/workflows/${targetWfId}/versions`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].versionNumber).toBe(2);
    expect(res.body.data[1].versionNumber).toBe(1);
  });

  it("retrieves immutable version snapshots and ensures earlier snapshot was not overwritten", async () => {
    const targetWfId = createdWorkflowIds[0];

    const v1Res = await request(app)
      .get(`/api/v1/workflows/${targetWfId}/versions/${publishedVersion1Id}`)
      .set("Cookie", cookie);

    expect(v1Res.status).toBe(200);
    expect(v1Res.body.data.versionNumber).toBe(1);
    expect(v1Res.body.data.definition.nodes[0].name).toBe("Order Webhook");

    const v2Res = await request(app)
      .get(`/api/v1/workflows/${targetWfId}/versions/${publishedVersion2Id}`)
      .set("Cookie", cookie);

    expect(v2Res.status).toBe(200);
    expect(v2Res.body.data.versionNumber).toBe(2);
    expect(v2Res.body.data.definition.nodes[0].name).toBe("Order Webhook V2");
  });

  it("soft-deletes a workflow and verifies exclusion from active list", async () => {
    const deleteWfId = createdWorkflowIds[4]; // "Daily Cleanup Epsilon"

    const delRes = await request(app)
      .delete(`/api/v1/workflows/${deleteWfId}`)
      .set("Cookie", cookie);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Active listing should now exclude it
    const listRes = await request(app)
      .get("/api/v1/workflows")
      .set("Cookie", cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.meta.total).toBe(4);
    const activeIds = listRes.body.data.map((w: any) => w.id);
    expect(activeIds).not.toContain(deleteWfId);

    // Direct get should return 404
    const getRes = await request(app)
      .get(`/api/v1/workflows/${deleteWfId}`)
      .set("Cookie", cookie);

    expect(getRes.status).toBe(404);

    // Filter by ARCHIVED status includes it
    const archivedRes = await request(app)
      .get("/api/v1/workflows?status=ARCHIVED")
      .set("Cookie", cookie);

    expect(archivedRes.status).toBe(200);
    const archivedIds = archivedRes.body.data.map((w: any) => w.id);
    expect(archivedIds).toContain(deleteWfId);
  });

  it("verifies audit logs contain workflow lifecycle events", async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/audit-logs`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    const actions = res.body.data.map((l: any) => l.action);
    expect(actions).toContain("workflow.created");
    expect(actions).toContain("workflow.updated");
    expect(actions).toContain("workflow.published");
    expect(actions).toContain("workflow.deleted");
  });
});
