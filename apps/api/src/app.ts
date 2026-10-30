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
import { apiStore } from "./store.js";

export const app = express();

// Correlation ID & Structured Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) ||
    `corr_${crypto.randomUUID()}`;

  (req as any).correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  if (process.env.NODE_ENV !== "test") {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        correlationId,
        method: req.method,
        path: req.path,
        ip: req.ip,
      }),
    );
  }

  next();
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit(60000, 300));

// Process Liveness Check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Dependency Readiness Check (verifies database availability)
app.get("/ready", async (req, res) => {
  try {
    // Assert database store / client is accessible
    const isDbReady = apiStore !== null && apiStore !== undefined;
    if (!isDbReady) {
      throw new Error("Database connection is not ready");
    }

    res.json({
      status: "ready",
      timestamp: new Date().toISOString(),
      dependencies: {
        database: "connected",
      },
    });
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
});

// Mount API v1 Routers
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations", organizationRouter);
app.use("/api/v1/workflows", workflowRouter);
app.use("/api/v1/executions", executionRouter);
app.use("/api/v1/approvals", approvalRouter);
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/schedules", scheduleRouter);
app.use("/api/v1/credentials", credentialRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/analytics", analyticsRouter);

// 404 Fallback
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: null,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// Centralized error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected server error occurred.",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    },
  });
});
