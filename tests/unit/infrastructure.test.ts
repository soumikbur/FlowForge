import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { getAppConfig } from "@flowforge/config";

describe("Infrastructure & API Foundation", () => {
  it("validates environment configuration schema and handles defaults", () => {
    const validConfig = getAppConfig({
      PORT: "5000",
      NODE_ENV: "test",
      LOG_LEVEL: "debug",
    });

    expect(validConfig.PORT).toBe(5000);
    expect(validConfig.NODE_ENV).toBe("test");
    expect(validConfig.LOG_LEVEL).toBe("debug");
  });

  it("rejects invalid environment variables", () => {
    expect(() => {
      getAppConfig({
        PORT: "not-a-number",
      });
    }).toThrow("Environment configuration error");
  });

  it("responds with 200 on process liveness check (/health)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("responds with 200 and connected status on readiness check (/ready)", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.dependencies.database).toBe("connected");
  });

  it("propagates and returns X-Correlation-Id header", async () => {
    const customCorrelationId = "client-req-987654";
    const res = await request(app)
      .get("/health")
      .set("X-Correlation-Id", customCorrelationId);

    expect(res.headers["x-correlation-id"]).toBe(customCorrelationId);
  });

  it("generates an X-Correlation-Id header if none was provided", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-correlation-id"]).toBeDefined();
    expect(res.headers["x-correlation-id"]).toMatch(/^corr_/);
  });

  it("maintains consistent error envelope format for unmapped routes (404)", async () => {
    const res = await request(app).get("/api/v1/non-existent-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(res.body.error.message).toContain(
      "Cannot GET /api/v1/non-existent-route",
    );
  });
});
