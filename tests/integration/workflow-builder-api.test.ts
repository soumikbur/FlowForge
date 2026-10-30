import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import {
  workflowDefinitionToReactFlow,
  reactFlowToWorkflowDefinition,
} from "../../apps/web/src/lib/graph-serializer.js";
import { Node, Edge } from "reactflow";

describe("Workflow Builder Visual Graph API Integration Tests", () => {
  const userEmail = `builder_${Date.now()}@flowforge.dev`;
  let cookie: string;
  let workflowId: string;
  let publishedVersionId: string;

  it("authenticates user and creates a new workflow draft", async () => {
    const regRes = await request(app).post("/api/v1/auth/register").send({
      email: userEmail,
      password: "Password123!",
      firstName: "Visual",
      lastName: "Architect",
      organizationName: "Automation Studio Inc",
    });

    expect(regRes.status).toBe(201);
    cookie = regRes.headers["set-cookie"][0];

    const createRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", cookie)
      .send({
        name: "Order Fulfill & Review",
        description: "Visual workflow builder test draft",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    workflowId = createRes.body.data.id;
  });

  it("serializes React Flow nodes and edges and persists to draft API", async () => {
    // Construct interactive React Flow graph
    const rfNodes: Node[] = [
      {
        id: "rf_trigger_1",
        type: "customNode",
        position: { x: 200, y: 50 },
        data: {
          id: "rf_trigger_1",
          name: "Inbound Order Webhook",
          type: "TRIGGER",
          config: { triggerType: "WEBHOOK", webhookPath: "/inbound/orders" },
        },
      },
      {
        id: "rf_condition_1",
        type: "customNode",
        position: { x: 200, y: 180 },
        data: {
          id: "rf_condition_1",
          name: "High Value Check",
          type: "CONDITION",
          config: { expression: "trigger.payload.total > 5000" },
        },
      },
      {
        id: "rf_approval_1",
        type: "customNode",
        position: { x: 380, y: 320 },
        data: {
          id: "rf_approval_1",
          name: "VP Approval",
          type: "APPROVAL",
          config: { title: "Approve Enterprise Deal", requiredRole: "ADMIN" },
        },
      },
      {
        id: "rf_email_1",
        type: "customNode",
        position: { x: 50, y: 320 },
        data: {
          id: "rf_email_1",
          name: "Send Confirmation",
          type: "EMAIL",
          config: {
            to: "client@example.com",
            subject: "Order Received",
            template: "Thank you for your order.",
          },
        },
      },
      {
        id: "rf_end_1",
        type: "customNode",
        position: { x: 200, y: 480 },
        data: {
          id: "rf_end_1",
          name: "Completion Step",
          type: "END",
          config: {},
        },
      },
    ];

    const rfEdges: Edge[] = [
      {
        id: "e1",
        source: "rf_trigger_1",
        target: "rf_condition_1",
      },
      {
        id: "e2_true",
        source: "rf_condition_1",
        sourceHandle: "true",
        target: "rf_approval_1",
        label: "True",
      },
      {
        id: "e2_false",
        source: "rf_condition_1",
        sourceHandle: "false",
        target: "rf_email_1",
        label: "False",
      },
      {
        id: "e3",
        source: "rf_approval_1",
        target: "rf_end_1",
      },
      {
        id: "e4",
        source: "rf_email_1",
        target: "rf_end_1",
      },
    ];

    // Convert to canonical AST
    const ast = reactFlowToWorkflowDefinition(rfNodes, rfEdges);

    // Save draft via PATCH
    const saveRes = await request(app)
      .patch(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", cookie)
      .send({
        name: "Order Fulfill & Review (Updated)",
        nodes: ast.nodes,
        edges: ast.edges,
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.draftDefinition.nodes.length).toBe(5);
    expect(saveRes.body.data.draftDefinition.edges.length).toBe(5);
  });

  it("reloads persisted draft and deserializes cleanly back into React Flow canvas", async () => {
    const getRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", cookie);

    expect(getRes.status).toBe(200);
    const draftDef = getRes.body.data.draftDefinition;

    // Convert back to React Flow
    const { nodes, edges } = workflowDefinitionToReactFlow(draftDef);

    expect(nodes.length).toBe(5);
    expect(edges.length).toBe(5);

    // Verify coordinates and handles are intact
    const condNode = nodes.find((n) => n.id === "rf_condition_1");
    expect(condNode?.position).toEqual({ x: 200, y: 180 });
    expect(condNode?.data.config.expression).toBe("trigger.payload.total > 5000");

    const trueEdge = edges.find((e) => e.sourceHandle === "true");
    expect(trueEdge?.target).toBe("rf_approval_1");
    expect(trueEdge?.label).toBe("True");
  });

  it("validates graph on the server and confirms valid schema", async () => {
    const valRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/validate`)
      .set("Cookie", cookie);

    expect(valRes.status).toBe(200);
    expect(valRes.body.data.isValid).toBe(true);
    expect(valRes.body.data.errors).toHaveLength(0);
  });

  it("publishes workflow draft as an immutable version", async () => {
    const pubRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set("Cookie", cookie);

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.data.version.versionNumber).toBe(1);
    expect(pubRes.body.data.workflow.status).toBe("ACTIVE");
    publishedVersionId = pubRes.body.data.version.id;
  });

  it("loads historical published version for read-only canvas inspection", async () => {
    const verRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}/versions/${publishedVersionId}`)
      .set("Cookie", cookie);

    expect(verRes.status).toBe(200);
    expect(verRes.body.data.versionNumber).toBe(1);

    const { nodes } = workflowDefinitionToReactFlow(verRes.body.data.definition);
    expect(nodes.length).toBe(5);
    expect(nodes[0].data.name).toBe("Inbound Order Webhook");
  });

  it("ensures subsequent draft modifications do not alter the published version snapshot", async () => {
    // Mutate draft by updating draft title and modifying nodes
    await request(app)
      .patch(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", cookie)
      .send({
        name: "Order Fulfill (Draft V2 In Progress)",
      });

    // Verify published version snapshot is completely unchanged
    const verRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}/versions/${publishedVersionId}`)
      .set("Cookie", cookie);

    expect(verRes.status).toBe(200);
    expect(verRes.body.data.versionNumber).toBe(1);
    expect(verRes.body.data.definition.nodes.length).toBe(5);
  });
});
