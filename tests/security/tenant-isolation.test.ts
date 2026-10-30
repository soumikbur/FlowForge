import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { isPrivateOrBlockedDestination } from "@flowforge/integrations";

describe("Security Boundaries & Multi-Tenant Isolation", () => {
  let orgACookie: string;
  let orgBCookie: string;
  let orgAWorkflowId: string;

  it("provisions two separate organizations", async () => {
    // Org A
    const resA = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `alice_${Date.now()}@orga.com`,
        password: "Password123!",
        firstName: "Alice",
        lastName: "Admin",
        organizationName: "Alpha Corp",
      });
    expect(resA.status).toBe(201);
    orgACookie = resA.headers["set-cookie"][0];

    // Org B
    const resB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `bob_${Date.now()}@orgb.com`,
        password: "Password123!",
        firstName: "Bob",
        lastName: "Admin",
        organizationName: "Beta Corp",
      });
    expect(resB.status).toBe(201);
    orgBCookie = resB.headers["set-cookie"][0];
  });

  it("creates workflow in Org A", async () => {
    const res = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", orgACookie)
      .send({
        name: "Confidential Payroll Workflow",
      });

    expect(res.status).toBe(201);
    orgAWorkflowId = res.body.data.id;
  });

  it("prevents Org B from reading Org A workflow (cross-tenant leak)", async () => {
    const res = await request(app)
      .get(`/api/v1/workflows/${orgAWorkflowId}`)
      .set("Cookie", orgBCookie);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("prevents Org B from modifying Org A workflow (cross-tenant mutation)", async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${orgAWorkflowId}`)
      .set("Cookie", orgBCookie)
      .send({
        name: "Hacked Workflow",
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("prevents SSRF attacks to cloud metadata and internal IPs", () => {
    const dangerousUrls = [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/secrets",
      "http://127.0.0.1:5432/",
      "http://10.0.0.5/internal-admin",
      "http://192.168.1.1/router-settings",
      "http://172.16.0.10/",
      "http://[::1]:3000/",
    ];

    for (const url of dangerousUrls) {
      expect(isPrivateOrBlockedDestination(url)).toBe(true);
    }
  });
});
