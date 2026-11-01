import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { rateLimit } from "./middleware/rate-limit.js";
import { authRouter } from "./routes/auth.routes.js";
import { organizationRouter } from "./routes/organization.routes.js";
import { workflowRouter } from "./routes/workflow.routes.js";
import { executionRouter } from "./routes/execution.routes.js";
import { approvalRouter } from "./routes/approval.routes.js";
import { webhookRouter } from "./routes/webhook.routes.js";
import { scheduleRouter } from "./routes/schedule.routes.js";
import { credentialRouter } from "./routes/credential.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { connectorRouter } from "./routes/connection.routes.js";
import { templateRouter } from "./routes/template.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { webhookSubscriptionRouter } from "./routes/webhook-subscription.routes.js";
import { portabilityRouter } from "./routes/portability.routes.js";
import { incidentRouter } from "./routes/incident.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { workspaceRouter } from "./routes/workspace.routes.js";
import { brandingRouter } from "./routes/branding.routes.js";
import { customDomainRouter } from "./routes/custom-domain.routes.js";
import { licensingRouter } from "./routes/licensing.routes.js";
import { scimRouter } from "./routes/scim.routes.js";
import { ssoAdminRouter } from "./routes/sso-admin.routes.js";
import { sessionGovernanceRouter } from "./routes/session-governance.routes.js";
import {
  oauthTokenRouter,
  oauthClientAdminRouter,
} from "./routes/oauth.routes.js";
import { docsRouter } from "./routes/docs.routes.js";
import { complianceRouter } from "./routes/compliance.routes.js";
import { aiRouter } from "./routes/ai.routes.js";
import { processIntelligenceRouter } from "./routes/process-intelligence.routes.js";
import { eventStreamingRouter } from "./routes/event-streaming.routes.js";
import { extensionRouter } from "./routes/extension.routes.js";
import { resilienceRouter } from "./routes/resilience.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { policyRouter } from "./routes/policy.routes.js";
import { resourceGovernanceRouter } from "./routes/resource-governance.routes.js";
import {
  testingGlobalRouter,
  workflowSimulationRouter,
} from "./routes/simulation.routes.js";
import { requestDrainingMiddleware } from "./middleware/request-draining.js";
import { resilienceService } from "./services/resilience.service.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import {
  apiLifecycleService,
  versionNegotiationMiddleware,
} from "./services/api-lifecycle.service.js";
import { apiReliabilityService } from "./services/api-reliability.service.js";
import { apiStore } from "./store.js";
import { getValidationCacheStats } from "@flowforge/workflow-engine";
import { defaultCircuitBreakerRegistry } from "@flowforge/integrations";

export const app = express();

// Correlation ID & Structured Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) ||
    (req.headers["x-request-id"] as string) ||
    `corr_${crypto.randomUUID()}`;

  const requestId = (req.headers["x-request-id"] as string) || correlationId;

  (req as any).correlationId = correlationId;
  (req as any).requestId = requestId;
  res.setHeader("X-Correlation-Id", correlationId);
  res.setHeader("X-Request-Id", requestId);

  // Reliability Telemetry: category categorization
  const category =
    req.path.includes("/auth") || req.path.includes("/oauth")
      ? "auth"
      : req.path.includes("/execute") || req.path.includes("/trigger")
        ? "execute"
        : req.path.includes("/search")
          ? "search"
          : "default";
  apiReliabilityService.recordRequest(category);

  // Standardize error responses automatically across all route handlers
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (
      body &&
      typeof body === "object" &&
      body.success === false &&
      body.error &&
      typeof body.error === "object"
    ) {
      if (body.error.requestId === undefined) {
        body.error.requestId = requestId;
      }
      if (body.error.retryable === undefined) {
        body.error.retryable =
          res.statusCode === 429 ||
          res.statusCode === 503 ||
          body.error.code === "IDEMPOTENCY_IN_FLIGHT";
      }
      if (body.error.docUrl === undefined && body.error.code) {
        body.error.docUrl = `https://docs.flowforge.dev/errors#${body.error.code}`;
      }
    }
    return originalJson(body);
  };

  if (process.env.NODE_ENV !== "test") {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        correlationId,
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
      }),
    );
  }

  next();
});

app.use(helmet() as any);
app.use(
  cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(idempotencyMiddleware);
app.use(rateLimit(60000, 300));
app.use(requestDrainingMiddleware);
app.use(versionNegotiationMiddleware);

// Process Liveness Check
const livenessHandler = (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};
app.get("/health", livenessHandler);
app.get("/health/live", livenessHandler);

// Dependency Readiness Check (verifies database availability & draining)
const readinessHandler = async (req: Request, res: Response) => {
  try {
    const details = await resilienceService.getDetailedReadiness();
    const isHealthy =
      details.status === "ready" || details.status === "degraded";
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(details);
  } catch (err: any) {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      dependencies: {
        database: "disconnected",
      },
      error: err.message,
    });
  }
};
app.get("/ready", readinessHandler);
app.get("/health/ready", readinessHandler);

// Diagnostic Metrics Endpoint
const metricsHandler = (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    validationCache: getValidationCacheStats(),
    circuitBreakers: defaultCircuitBreakerRegistry.getAllMetrics(),
  });
};
app.get("/health/metrics", metricsHandler);
app.get("/api/v1/metrics", metricsHandler);

// Mount API v1 Routers
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations/:organizationId", complianceRouter);
app.use("/api/v1/organizations", organizationRouter);
app.use("/api/v1/workflows", portabilityRouter);
app.use("/api/v1/workflows", workflowRouter);
app.use("/api/v1/executions", executionRouter);
app.use("/api/v1/approvals", approvalRouter);
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/webhooks", webhookSubscriptionRouter);
app.use("/api/v1/schedules", scheduleRouter);
app.use("/api/v1/credentials", credentialRouter);
app.use("/api/v1/connectors", connectorRouter);
app.use("/api/v1/templates", templateRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/incidents", incidentRouter);
app.use("/api/v1/billing", billingRouter);
app.use("/api/v1/workspaces", workspaceRouter);
app.use("/api/v1/branding", brandingRouter);
app.use("/api/v1/custom-domains", customDomainRouter);
app.use("/api/v1/licensing", licensingRouter);
app.use("/api/v1/scim/v2", scimRouter);
app.use("/api/v1/organizations/:organizationId/sso", ssoAdminRouter);
app.use(
  "/api/v1/organizations/:organizationId/sessions",
  sessionGovernanceRouter,
);
app.use(
  "/api/v1/organizations/:organizationId/oauth/clients",
  oauthClientAdminRouter,
);
app.use("/api/v1/organizations/:organizationId/ai", aiRouter);
app.use("/api/v1/ai", aiRouter);
app.use(
  "/api/v1/organizations/:organizationId/intelligence",
  processIntelligenceRouter,
);
app.use("/api/v1/intelligence", processIntelligenceRouter);
app.use("/api/v1/organizations/:organizationId/events", eventStreamingRouter);
app.use("/api/v1/events", eventStreamingRouter);
app.use("/api/v1/organizations/:organizationId/extensions", extensionRouter);
app.use("/api/v1/extensions", extensionRouter);
app.use("/api/v1/organizations/:organizationId/resilience", resilienceRouter);
app.use("/api/v1/resilience", resilienceRouter);
app.use("/api/v1/organizations/:organizationId/search", searchRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/organizations/:organizationId/policies", policyRouter);
app.use("/api/v1/policies", policyRouter);
app.use(
  "/api/v1/organizations/:organizationId/governance/quotas",
  resourceGovernanceRouter,
);
app.use("/api/v1/governance/quotas", resourceGovernanceRouter);
app.use("/api/v1/quotas", resourceGovernanceRouter);
app.use("/api/v1/testing", testingGlobalRouter);
app.use("/api/v1/oauth", oauthTokenRouter);
app.use("/oauth", oauthTokenRouter);
app.use("/api/v1/docs", docsRouter);

// API Versioning and Deprecation endpoints
app.get("/api/v1/version", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: apiLifecycleService.getVersionInfo(),
    error: null,
  });
});

app.get("/api/v1/deprecations", (req: Request, res: Response) => {
  const deprecations = apiLifecycleService.getDeprecations();
  res.json({
    success: true,
    data: deprecations,
    meta: { total: deprecations.length },
    error: null,
  });
});

// Reliability Telemetry Endpoint
app.get("/api/v1/metrics/reliability", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: apiReliabilityService.getMetrics(),
    error: null,
  });
});

// 404 Fallback
app.use((req: Request, res: Response) => {
  const requestId =
    (req as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    `req_${crypto.randomUUID()}`;
  apiReliabilityService.recordError(404);

  res.status(404).json({
    success: false,
    data: null,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
      details: { path: req.path, method: req.method },
      requestId,
      retryable: false,
      docUrl: "https://docs.flowforge.dev/errors#ROUTE_NOT_FOUND",
    },
  });
});

// Centralized error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const requestId =
    (req as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    `req_${crypto.randomUUID()}`;

  let statusCode = err.status || err.statusCode || 500;
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "An unexpected server error occurred.";

  if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request payload exceeds size limit.";
  } else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    code = "MALFORMED_JSON";
    message = "Malformed JSON payload.";
  }

  apiReliabilityService.recordError(statusCode);

  const retryable =
    statusCode === 429 ||
    statusCode === 503 ||
    code === "IDEMPOTENCY_IN_FLIGHT";

  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details: err.details || {},
      requestId,
      retryable,
      docUrl: `https://docs.flowforge.dev/errors#${code}`,
    },
  });
});
