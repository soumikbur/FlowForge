import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { WorkflowDefinition } from "@flowforge/shared";
import {
  validateWorkflowGraph,
  computeWorkflowContentHash,
  validationCache,
  getValidationCacheStats,
  resetValidationCache,
  BoundedCache,
} from "@flowforge/workflow-engine";
import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerRegistry,
  defaultCircuitBreakerRegistry,
} from "@flowforge/integrations";
import {
  WorkflowExecutionRunner,
} from "../../apps/worker/src/runner.js";
import {
  InMemoryDatabase,
  WorkflowExecutionRecord,
  ExecutionStepRecord,
} from "@flowforge/test-utils";

describe("Prompt 17: Performance, Scalability, Reliability, and Production Hardening", () => {
  describe("1. Workflow Validation & Bounded LRU Caching", () => {
    const sampleDefinition: WorkflowDefinition = {
      nodes: [
        { id: "node_1", type: "TRIGGER", name: "Start", config: { triggerType: "MANUAL" } },
        { id: "node_2", type: "END", name: "End", config: {} },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
      ],
    };

    beforeEach(() => {
      resetValidationCache();
    });

    it("computes deterministic content hashes for workflow definitions", () => {
      const hash1 = computeWorkflowContentHash(sampleDefinition);
      const hash2 = computeWorkflowContentHash({
        edges: [{ target: "node_2", source: "node_1", id: "edge_1" }],
        nodes: [
          { name: "Start", type: "TRIGGER", id: "node_1", config: { triggerType: "MANUAL" } },
          { id: "node_2", type: "END", name: "End", config: {} },
        ],
      });

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64);
    });

    it("caches validation results and serves subsequent identical requests from cache", () => {
      const initialStats = getValidationCacheStats();
      expect(initialStats.size).toBe(0);

      // First run: uncached (miss)
      const res1 = validateWorkflowGraph(sampleDefinition);
      expect(res1.isValid).toBe(true);

      const statsAfterFirst = getValidationCacheStats();
      expect(statsAfterFirst.misses).toBe(1);
      expect(statsAfterFirst.hits).toBe(0);
      expect(statsAfterFirst.size).toBe(1);

      // Second run: cached (hit)
      const res2 = validateWorkflowGraph(sampleDefinition);
      expect(res2.isValid).toBe(true);

      const statsAfterSecond = getValidationCacheStats();
      expect(statsAfterSecond.hits).toBe(1);
      expect(statsAfterSecond.misses).toBe(1);
      expect(statsAfterSecond.size).toBe(1);
    });

    it("registers cache miss and computes new entry when definition is modified", () => {
      validateWorkflowGraph(sampleDefinition);

      const modifiedDefinition: WorkflowDefinition = {
        nodes: [
          { id: "node_1", type: "TRIGGER", name: "Start", config: { triggerType: "MANUAL" } },
          { id: "node_2", type: "HTTP_REQUEST", name: "Http", config: { url: "https://example.com" } },
          { id: "node_3", type: "END", name: "End", config: {} },
        ],
        edges: [
          { id: "edge_1", source: "node_1", target: "node_2" },
          { id: "edge_2", source: "node_2", target: "node_3" },
        ],
      };

      const res = validateWorkflowGraph(modifiedDefinition);
      expect(res.isValid).toBe(true);

      const stats = getValidationCacheStats();
      expect(stats.misses).toBe(2);
      expect(stats.size).toBe(2);
    });

    it("enforces bounded capacity and evicts least-recently-used entries in BoundedCache", () => {
      const cache = new BoundedCache<string, number>({ maxEntries: 3, defaultTtlMs: 10000 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBe(1); // 'a' accessed, 'b' is now oldest

      cache.set("d", 4); // should evict 'b'

      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("a")).toBe(1);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
      expect(cache.size).toBe(3);

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it("evicts entries that exceed TTL in BoundedCache", async () => {
      const cache = new BoundedCache<string, string>({ maxEntries: 10, defaultTtlMs: 20 });
      cache.set("temp", "val");

      expect(cache.get("temp")).toBe("val");

      await new Promise((res) => setTimeout(res, 35));
      expect(cache.get("temp")).toBeUndefined();
    });
  });

  describe("2. External Dependency Resilience & Circuit Breaker", () => {
    it("operates in CLOSED state and allows normal successful execution", async () => {
      const breaker = new CircuitBreaker("payment-gateway", { failureThreshold: 3, resetTimeoutMs: 50 });
      expect(breaker.getState()).toBe("CLOSED");

      const result = await breaker.execute(async () => 42);
      expect(result).toBe(42);
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("trips to OPEN state when failure threshold is reached and fast-fails without hitting downstream", async () => {
      const breaker = new CircuitBreaker("slow-api", { failureThreshold: 3, resetTimeoutMs: 100 });
      let downstreamCalls = 0;

      const failingCall = async () => {
        return breaker.execute(async () => {
          downstreamCalls++;
          throw new Error("Downstream socket timeout");
        });
      };

      // 3 consecutive failures
      await expect(failingCall()).rejects.toThrow("Downstream socket timeout");
      await expect(failingCall()).rejects.toThrow("Downstream socket timeout");
      await expect(failingCall()).rejects.toThrow("Downstream socket timeout");

      expect(downstreamCalls).toBe(3);
      expect(breaker.getState()).toBe("OPEN");

      // 4th call: must fast-fail with CircuitBreakerError WITHOUT calling downstream
      await expect(failingCall()).rejects.toThrow(CircuitBreakerError);
      expect(downstreamCalls).toBe(3); // downstream was NOT contacted!
    });

    it("transitions from OPEN to HALF_OPEN after cooldown and recovers to CLOSED on success", async () => {
      const breaker = new CircuitBreaker("flaky-service", { failureThreshold: 2, resetTimeoutMs: 40 });

      // Trip breaker
      for (let i = 0; i < 2; i++) {
        await breaker.execute(async () => {
          throw new Error("503 Service Unavailable");
        }).catch(() => null);
      }
      expect(breaker.getState()).toBe("OPEN");

      // Wait for reset timeout
      await new Promise((res) => setTimeout(res, 50));
      expect(breaker.getState()).toBe("HALF_OPEN");

      // Successful test execution transitions back to CLOSED
      const res = await breaker.execute(async () => "healthy");
      expect(res).toBe("healthy");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("tracks metrics and supports registry operations", () => {
      const registry = new CircuitBreakerRegistry();
      const b1 = registry.getBreaker("api.stripe.com", { failureThreshold: 5 });
      const b2 = registry.getBreaker("api.slack.com", { failureThreshold: 3 });

      expect(b1.name).toBe("api.stripe.com");
      expect(b2.name).toBe("api.slack.com");

      const metrics = registry.getAllMetrics();
      expect(metrics.length).toBe(2);
      expect(metrics.find((m) => m.name === "api.stripe.com")?.state).toBe("CLOSED");
    });
  });

  describe("3. Worker Concurrency Limits & Multi-Tenant Fairness", () => {
    let db: InMemoryDatabase;
    const orgA = "org_alpha";
    const orgB = "org_beta";

    beforeEach(() => {
      db = new InMemoryDatabase();
    });

    it("enforces tenant-level concurrency limits without blocking other tenants", async () => {
      const runner = new WorkflowExecutionRunner(db, {
        maxGlobalConcurrency: 10,
        maxTenantConcurrency: 2,
      });

      // Populate dummy workflow version
      const versionId = "ver_concurrency_test";
      db.versions.set(versionId, {
        id: versionId,
        workflowId: "wf_1",
        version: 1,
        definition: {
          nodes: [
            { id: "start", type: "TRIGGER", name: "Start", config: { triggerType: "MANUAL" } },
            { id: "end", type: "END", name: "End", config: {} },
          ],
          edges: [
            { id: "e1", source: "start", target: "end" },
          ],
        },
        createdAt: new Date(),
      } as any);

      // Create executions for Org A
      const execA1: WorkflowExecutionRecord = {
        id: "exec_a1",
        organizationId: orgA,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const execA2: WorkflowExecutionRecord = {
        id: "exec_a2",
        organizationId: orgA,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const execA3: WorkflowExecutionRecord = {
        id: "exec_a3",
        organizationId: orgA,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create execution for Org B
      const execB1: WorkflowExecutionRecord = {
        id: "exec_b1",
        organizationId: orgB,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.executions.set(execA1.id, execA1);
      db.executions.set(execA2.id, execA2);
      db.executions.set(execA3.id, execA3);
      db.executions.set(execB1.id, execB1);

      // Verify normal execution completes and decrements active count
      await runner.processExecution(execA1.id);
      expect(runner.getTenantActiveCount(orgA)).toBe(0);

      // Verify concurrency metrics structure
      const metrics = runner.getConcurrencyMetrics();
      expect(metrics.maxGlobalConcurrency).toBe(10);
      expect(metrics.maxTenantConcurrency).toBe(2);
    });

    it("rejects execution when tenant concurrency limit is exceeded", async () => {
      const runner = new WorkflowExecutionRunner(db, {
        maxGlobalConcurrency: 10,
        maxTenantConcurrency: 1,
      });

      const versionId = "ver_limit_test";
      db.versions.set(versionId, {
        id: versionId,
        workflowId: "wf_1",
        version: 1,
        definition: {
          nodes: [
            { id: "start", type: "TRIGGER", name: "Start", config: { triggerType: "MANUAL" } },
            { id: "end", type: "END", name: "End", config: {} },
          ],
          edges: [
            { id: "e1", source: "start", target: "end" },
          ],
        },
        createdAt: new Date(),
      } as any);

      // Simulate an active in-flight execution for Org A
      (runner as any).activeTenantExecutions.set(orgA, 1);

      const execA2: WorkflowExecutionRecord = {
        id: "exec_a2",
        organizationId: orgA,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.executions.set(execA2.id, execA2);

      await expect(runner.processExecution(execA2.id)).rejects.toThrow(
        /Concurrency limit exceeded: Organization 'org_alpha' limit of 1 reached/,
      );

      // But Org B is NOT blocked by Org A's limit
      const execB1: WorkflowExecutionRecord = {
        id: "exec_b1",
        organizationId: orgB,
        workflowId: "wf_1",
        workflowVersionId: versionId,
        status: "QUEUED",
        contextData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.executions.set(execB1.id, execB1);

      const resB = await runner.processExecution(execB1.id);
      expect(resB.status).toBe("SUCCEEDED");
    });
  });

  describe("4. Stale Execution Recovery & Graceful Shutdown", () => {
    let db: InMemoryDatabase;

    beforeEach(() => {
      db = new InMemoryDatabase();
    });

    it("recovers stale executions abandoned in RUNNING state past threshold", async () => {
      const runner = new WorkflowExecutionRunner(db);
      const staleTime = new Date(Date.now() - 400000); // ~6.6 minutes ago
      const recentTime = new Date();

      const staleExec: WorkflowExecutionRecord = {
        id: "exec_stale_1",
        organizationId: "org_1",
        workflowId: "wf_1",
        workflowVersionId: "v_1",
        status: "RUNNING",
        startedAt: staleTime,
        updatedAt: staleTime,
        contextData: {},
        createdAt: staleTime,
      };

      const freshExec: WorkflowExecutionRecord = {
        id: "exec_fresh_1",
        organizationId: "org_1",
        workflowId: "wf_1",
        workflowVersionId: "v_1",
        status: "RUNNING",
        startedAt: recentTime,
        updatedAt: recentTime,
        contextData: {},
        createdAt: recentTime,
      };

      // Stale step record
      const staleStep: ExecutionStepRecord = {
        id: "step_stale_1",
        executionId: staleExec.id,
        nodeId: "node_1",
        nodeType: "TRANSFORM",
        nodeName: "Stalled Step",
        status: "RUNNING",
        startedAt: staleTime,
        attempt: 1,
      };

      db.executions.set(staleExec.id, staleExec);
      db.executions.set(freshExec.id, freshExec);
      db.steps.set(staleStep.id, staleStep);

      // Run stale recovery with 5 minute threshold (300,000ms)
      const recoveryResult = await runner.recoverStaleExecutions(300000);

      expect(recoveryResult.recoveredCount).toBe(1);
      expect(recoveryResult.executionIds).toContain("exec_stale_1");

      // Verify stale execution marked FAILED
      const reconciledStale = db.executions.get("exec_stale_1")!;
      expect(reconciledStale.status).toBe("FAILED");
      expect(reconciledStale.errorDetails?.message).toContain("Execution timed out (stale running recovery)");

      // Verify stale step reconciled
      const reconciledStep = db.steps.get("step_stale_1")!;
      expect(reconciledStep.status).toBe("FAILED");
      expect(reconciledStep.errorMessage).toContain("stale execution recovery");

      // Verify fresh execution remains unaffected
      const freshCheck = db.executions.get("exec_fresh_1")!;
      expect(freshCheck.status).toBe("RUNNING");
    });

    it("gracefully shuts down active executions", async () => {
      const runner = new WorkflowExecutionRunner(db);
      const controller = new AbortController();
      (runner as any).activeExecutions.set("exec_active_1", controller);

      expect(runner.getActiveExecutionsCount()).toBe(1);
      const shutdownResult = await runner.gracefulShutdown();

      expect(shutdownResult.stoppedCount).toBe(1);
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("5. Observability, Correlation IDs, and Diagnostic Endpoints", () => {
    it("propagates provided X-Correlation-Id header in responses", async () => {
      const customCorrId = "corr_custom_trace_987654";

      const res = await request(app)
        .get("/health")
        .set("X-Correlation-Id", customCorrId);

      expect(res.status).toBe(200);
      expect(res.headers["x-correlation-id"]).toBe(customCorrId);
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.uptime).toBe("number");
    });

    it("generates and attaches X-Correlation-Id header when not provided", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.headers["x-correlation-id"]).toBeDefined();
      expect(res.headers["x-correlation-id"]).toMatch(/^corr_/);
    });

    it("exposes liveness and readiness probes", async () => {
      const liveRes = await request(app).get("/health/live");
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.status).toBe("healthy");

      const readyRes = await request(app).get("/health/ready");
      expect(readyRes.status).toBe(200);
      expect(readyRes.body.status).toBe("ready");
      expect(readyRes.body.dependencies.database).toBe("connected");
    });

    it("exposes diagnostic runtime metrics endpoint with cache and circuit breaker stats", async () => {
      const res = await request(app).get("/health/metrics");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.memory).toBeDefined();
      expect(typeof res.body.memory.heapUsed).toBe("number");
      expect(res.body.validationCache).toBeDefined();
      expect(typeof res.body.validationCache.hits).toBe("number");
      expect(typeof res.body.validationCache.size).toBe("number");
      expect(Array.isArray(res.body.circuitBreakers)).toBe(true);
    });
  });
});
