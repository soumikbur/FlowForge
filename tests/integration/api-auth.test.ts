import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";

describe("API Authentication & Session Flow", () => {
  const uniqueEmail = `test_${Date.now()}@flowforge.dev`;
  let sessionCookie: string;

  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(app).get("/api/v1/workflows");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("successfully registers new user and organization", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: uniqueEmail,
      password: "Password123!",
      firstName: "Alex",
      lastName: "Architect",
      organizationName: "Alex Corp",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(uniqueEmail);
    expect(res.body.data.organization.name).toBe("Alex Corp");
    expect(res.body.data.token).toBeDefined();

    // Capture session cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    sessionCookie = cookies[0];
  });

  it("authenticates user with valid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: uniqueEmail,
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(uniqueEmail);
  });

  it("rejects invalid password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: uniqueEmail,
      password: "WrongPassword!",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("allows access to protected routes with valid session cookie", async () => {
    const res = await request(app)
      .get("/api/v1/workflows")
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
