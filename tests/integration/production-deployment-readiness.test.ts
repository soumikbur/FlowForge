import { describe, it, expect } from "vitest";
import request from "supertest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { app } from "../../apps/api/src/app.js";
import {
  getAppConfig,
  redactedConfig,
  validateEnvironmentConfig,
} from "../../packages/config/src/index.js";

const VALID_PROD_CONFIG = {
  NODE_ENV: "production",
  PORT: "4000",
  WORKER_PORT: "4001",
  API_URL: "https://api.flowforge.dev",
  WEB_URL: "https://app.flowforge.dev",
  DATABASE_URL:
    "postgresql://flowforge_admin:P@ssw0rdProd!@postgres.internal:5432/flowforge_prod?schema=public",
  REDIS_URL: "redis://redis.internal:6379",
  SESSION_SECRET: "abcdef1234567890abcdef1234567890abcdef1234567890", // 50 chars
  ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".replace(
      "0",
      "f",
    ), // 64 hex non-default
  JWT_SECRET: "jwt-token-secret-production-min-32-chars-long",
};

describe("Prompt 19: Production Deployment, CI/CD Automation & Release Readiness", () => {
  // ---------------------------------------------------------------------------
  // 1. Production Configuration & Invariant Validation
  // ---------------------------------------------------------------------------
  describe("1. Centralized Production Configuration & Security Invariants", () => {
    it("accepts valid production configuration and successfully parses all parameters", () => {
      const cfg = getAppConfig(VALID_PROD_CONFIG);
      expect(cfg.NODE_ENV).toBe("production");
      expect(cfg.PORT).toBe(4000);
      expect(cfg.WORKER_PORT).toBe(4001);
      expect(cfg.API_URL).toBe("https://api.flowforge.dev");
      expect(cfg.WEB_URL).toBe("https://app.flowforge.dev");
    });

    it("rejects SESSION_SECRET shorter than 32 characters in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        SESSION_SECRET: "too-short-secret-under-32-chars",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("SESSION_SECRET"))).toBe(
        true,
      );
    });

    it("rejects default development placeholder SESSION_SECRET in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        SESSION_SECRET:
          "flowforge-super-secret-session-key-change-in-production-min-32-chars",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("SESSION_SECRET"))).toBe(
        true,
      );
    });

    it("rejects non-hexadecimal or non-64-character ENCRYPTION_KEY in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        ENCRYPTION_KEY: "not-a-valid-hex-key-this-is-too-short",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("ENCRYPTION_KEY"))).toBe(
        true,
      );
    });

    it("rejects default development placeholder ENCRYPTION_KEY in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        ENCRYPTION_KEY:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("ENCRYPTION_KEY"))).toBe(
        true,
      );
    });

    it("rejects SQLite / file: DATABASE_URL in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        DATABASE_URL: "file:./dev.db",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("DATABASE_URL"))).toBe(true);
    });

    it("rejects invalid REDIS_URL protocol in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        REDIS_URL: "http://localhost:6379",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("REDIS_URL"))).toBe(true);
    });

    it("rejects conflicting PORT and WORKER_PORT in production", () => {
      const result = validateEnvironmentConfig({
        ...VALID_PROD_CONFIG,
        PORT: "4000",
        WORKER_PORT: "4000",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("WORKER_PORT"))).toBe(true);
    });

    it("masks sensitive secrets when redactedConfig is called for diagnostics", () => {
      const cfg = getAppConfig(VALID_PROD_CONFIG);
      const masked = redactedConfig(cfg);

      expect(masked.SESSION_SECRET).toBe("[REDACTED]");
      expect(masked.ENCRYPTION_KEY).toBe("[REDACTED]");
      expect(masked.JWT_SECRET).toBe("[REDACTED]");
      expect(masked.DATABASE_URL as string).not.toContain("P@ssw0rdProd!");
      expect(masked.DATABASE_URL as string).toContain("********");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Containerization, Least Privilege & Service Topology
  // ---------------------------------------------------------------------------
  describe("2. Container Specifications, Unprivileged Users & Healthchecks", () => {
    it("verifies apps/api/Dockerfile configures non-root user and healthcheck", () => {
      const content = readFileSync(
        resolve(__dirname, "../../apps/api/Dockerfile"),
        "utf-8",
      );
      expect(content).toContain("USER flowforge");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("http://localhost:4000/health/live");
    });

    it("verifies apps/worker/Dockerfile configures non-root user and healthcheck", () => {
      const content = readFileSync(
        resolve(__dirname, "../../apps/worker/Dockerfile"),
        "utf-8",
      );
      expect(content).toContain("USER flowforge");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("http://localhost:4001/health");
    });

    it("verifies apps/web/Dockerfile configures non-root user and healthcheck", () => {
      const content = readFileSync(
        resolve(__dirname, "../../apps/web/Dockerfile"),
        "utf-8",
      );
      expect(content).toContain("USER flowforge");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("http://localhost:3000/");
    });

    it("verifies docker-compose.prod.yml defines isolated internal network without exposed DB ports", () => {
      const content = readFileSync(
        resolve(__dirname, "../../docker-compose.prod.yml"),
        "utf-8",
      );
      expect(content).toContain("flowforge-internal");
      expect(content).toContain("internal: true");
      // Postgres and Redis services must not publish host ports in production compose
      expect(content).not.toMatch(
        /postgres:[\s\S]*?ports:\s*-\s*["']5432:5432["']/,
      );
      expect(content).not.toMatch(
        /redis:[\s\S]*?ports:\s*-\s*["']6379:6379["']/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Database Migration Safety & Deployment Scripting
  // ---------------------------------------------------------------------------
  describe("3. Database Migration Safety & Deployment Scripting", () => {
    it("verifies all database migrations follow timestamped sequential naming convention", () => {
      const migrationsDir = resolve(
        __dirname,
        "../../packages/database/prisma/migrations",
      );
      const entries = readdirSync(migrationsDir).filter((e) =>
        e.startsWith("2026"),
      );

      expect(entries.length).toBeGreaterThanOrEqual(12);
      // Verify migrations are strictly sorted chronologically
      const sorted = [...entries].sort();
      expect(entries).toEqual(sorted);
    });

    it("verifies db-migrate script exists and validates database connection", () => {
      const scriptPath = resolve(__dirname, "../../scripts/db-migrate.js");
      expect(existsSync(scriptPath)).toBe(true);

      const content = readFileSync(scriptPath, "utf-8");
      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("prisma migrate deploy");
      expect(content).toContain("postgresql://");
    });

    it("verifies database seed script enforces production guard", () => {
      const seedPath = resolve(
        __dirname,
        "../../packages/database/src/seed.ts",
      );
      expect(existsSync(seedPath)).toBe(true);

      const content = readFileSync(seedPath, "utf-8");
      expect(content).toContain('process.env.NODE_ENV === "production"');
      expect(content).toContain("forbidden in production");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CI/CD Automation & Quality Gates
  // ---------------------------------------------------------------------------
  describe("4. Continuous Integration & Continuous Delivery Pipelines", () => {
    it("verifies CI pipeline configures quality gates, concurrency controls and tests", () => {
      const ciContent = readFileSync(
        resolve(__dirname, "../../.github/workflows/ci.yml"),
        "utf-8",
      );
      expect(ciContent).toContain("concurrency:");
      expect(ciContent).toContain("cancel-in-progress: true");
      expect(ciContent).toContain("pnpm typecheck");
      expect(ciContent).toContain("pnpm lint");
      expect(ciContent).toContain("pnpm test");
      expect(ciContent).toContain("pnpm build");
    });

    it("verifies CD release workflow configures staging and production approval gates", () => {
      const releaseContent = readFileSync(
        resolve(__dirname, "../../.github/workflows/release.yml"),
        "utf-8",
      );
      expect(releaseContent).toContain("environment:");
      expect(releaseContent).toContain("name: staging");
      expect(releaseContent).toContain("name: production");
      expect(releaseContent).toContain("manifest.json");
      expect(releaseContent).toContain("sha256sum");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Runtime Health, Readiness & Observability Endpoints
  // ---------------------------------------------------------------------------
  describe("5. Runtime Health, Readiness & Observability", () => {
    it("GET /health/live returns 200 with healthy status and no sensitive data", async () => {
      const res = await request(app).get("/health/live");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.password).toBeUndefined();
      expect(res.body.secret).toBeUndefined();
    });

    it("GET /health/ready returns 200 with database readiness", async () => {
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.dependencies.database).toBe("connected");
    });

    it("GET /health/metrics returns bounded metrics without credentials", async () => {
      const res = await request(app).get("/health/metrics");
      expect(res.status).toBe(200);
      expect(res.body.uptime).toBeDefined();
      expect(res.body.memory).toBeDefined();
      expect(res.body.circuitBreakers).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain("password");
      expect(JSON.stringify(res.body)).not.toContain("secret");
    });
  });
});
