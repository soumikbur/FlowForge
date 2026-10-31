import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { validateWorkflowGraph } from "@flowforge/workflow-engine";
import { WorkflowDefinition } from "@flowforge/shared";

describe("E2E User Journey: Visual Workflow Builder Complete Lifecycle", () => {
  const userEmail = `builder_qa_${Date.now()}@flowforge.dev`;
  let userCookie: string;
  let organizationId: string;
  let workflowId: string;
  let publishedVersionId: string;

  beforeAll(async () => {
    resetRateLimits();

    // 1. Authenticate & provision organization session
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: userEmail,
        password: "Password123!Secure",
        firstName: "Visual",
        lastName: "BuilderQA",
        organizationName: "Builder QA Enterprise",
      });

    expect(regRes.status).toBe(201);
    userCookie = regRes.headers["set-cookie"][0];
    organizationId = regRes.body.data.organization.id;
  });

  it("Step 1 & 2: User navigates and creates a new workflow draft", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", userCookie)
      .send({
        name: "E2E Order Processing Flow",
        description: "Visual builder end-to-end test",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.draftRevision).toBe(1);
    workflowId = res.body.data.id;
  });

  it("Step 3-7: Adds TRIGGER, HTTP_REQUEST, and END nodes with configured properties", async () => {
    const ast: WorkflowDefinition = {
      nodes: [
        {
          id: "node_trigger",
          type: "TRIGGER",
          name: "Order Webhook Trigger",
          config: { triggerType: "MANUAL" },
        },
        {
          id: "node_http",
          type: "HTTP_REQUEST",
          name: "Post to Logistics Gateway",
          config: {
            url: "https://api.partner.com/orders",
            method: "POST",
            timeoutMs: 5000,
          },
        },
        {
          id: "node_end",
          type: "END",
          name: "Conclude Pipeline",
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "node_trigger", target: "node_http" },
        { id: "e2", source: "node_http", target: "node_end" },
      ],
    };

    // Save draft in editor
    const res = await request(app)
      .patch(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", userCookie)
      .send({
        nodes: ast.nodes,
        edges: ast.edges,
        expectedRevision: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.draftRevision).toBe(2);
    expect(res.body.data.draftDefinition.nodes.length).toBe(3);
    expect(res.body.data.draftDefinition.edges.length).toBe(2);
  });

  it("Step 8 & 9: Reloads page and confirms complete graph AST is faithfully restored", async () => {
    const res = await request(app)
      .get(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", userCookie);

    expect(res.status).toBe(200);
    const def = res.body.data.draftDefinition;
    expect(def.nodes.length).toBe(3);
    expect(def.edges.length).toBe(2);

    const httpNode = def.nodes.find((n: any) => n.id === "node_http");
    expect(httpNode).toBeDefined();
    expect(httpNode.config.url).toBe("https://api.partner.com/orders");
    expect(httpNode.config.method).toBe("POST");
  });

  it("Step 10: Runs server-side graph validation and verifies zero errors", async () => {
    const getRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}`)
      .set("Cookie", userCookie);

    const validation = validateWorkflowGraph(getRes.body.data.draftDefinition);
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it("Step 11: Publishes draft as immutable Version 1 with release notes", async () => {
    const pubRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set("Cookie", userCookie)
      .send({
        releaseNotes: "v1.0.0 Production Release",
      });

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.success).toBe(true);
    expect(pubRes.body.data.version.versionNumber).toBe(1);
    expect(pubRes.body.data.version.contentHash).toBeDefined();
    publishedVersionId = pubRes.body.data.version.id;
  });

  it("Step 12: Confirms published workflow version is locked in read-only mode", async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/workflows/${workflowId}/versions/${publishedVersionId}`)
      .set("Cookie", userCookie)
      .send({ name: "Hostile Change" });

    expect(patchRes.status).toBe(405);
    expect(patchRes.body.error.code).toBe("VERSION_IMMUTABLE");

    const delRes = await request(app)
      .delete(`/api/v1/workflows/${workflowId}/versions/${publishedVersionId}`)
      .set("Cookie", userCookie);

    expect(delRes.status).toBe(405);
    expect(delRes.body.error.code).toBe("VERSION_IMMUTABLE");
  });
});
