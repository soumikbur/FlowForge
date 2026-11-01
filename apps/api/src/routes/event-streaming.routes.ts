import { Router, Request, Response } from "express";
import {
  CanonicalEventSchema,
  EventQuerySchema,
  EventReplayRequestSchema,
  CreateConnectorSubscriptionSchema,
  UpdateConnectorSubscriptionSchema,
  hasPermission,
  Role,
} from "@flowforge/shared";
import { requireAuth } from "../middleware/auth.js";
import { eventStreamingService } from "../services/event-streaming.service.js";
import { apiStore } from "../store.js";

export const eventStreamingRouter = Router({ mergeParams: true });

function getOrgId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    req.params.orgId ||
    req.organizationId ||
    (req.headers["x-organization-id"] as string)
  );
}

function getCaller(
  req: Request,
  orgId: string,
): { userId: string; role: Role } | null {
  if (!req.user) return null;
  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.organizationId === orgId && m.userId === req.user!.id,
  );
  if (membership) {
    return { userId: req.user.id, role: membership.role };
  }
  if (req.isApiKey && req.organizationId === orgId && req.role) {
    return { userId: req.user.id, role: req.role };
  }
  return null;
}

eventStreamingRouter.use(requireAuth);

/**
 * 1. POST /ingest: Ingest single event or batch of events
 */
eventStreamingRouter.post("/ingest", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (
    !caller ||
    (!hasPermission(caller.role, "events:ingest") &&
      !hasPermission(caller.role, "events:write"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires events:ingest or events:write permission.",
      },
    });
  }

  try {
    // Check if batch ingestion
    if (
      Array.isArray(req.body) ||
      (req.body && Array.isArray(req.body.events))
    ) {
      const rawEvents = Array.isArray(req.body) ? req.body : req.body.events;
      const batchResult = await eventStreamingService.ingestBatch(
        orgId,
        rawEvents,
        {
          callerUserId: caller.userId,
        },
      );

      return res.status(202).json({
        success: true,
        data: batchResult,
        error: null,
      });
    }

    // Single event ingestion
    const idempotencyHeader = (req.headers["x-idempotency-key"] ||
      req.headers["x-event-id"]) as string;
    const ingestResult = await eventStreamingService.ingestEvent(
      orgId,
      req.body,
      {
        callerUserId: caller.userId,
        customDedupKey: idempotencyHeader,
      },
    );

    const statusCode = ingestResult.duplicate ? 200 : 202;
    return res.status(statusCode).json({
      success: true,
      data: ingestResult,
      error: null,
    });
  } catch (err: any) {
    const isPayloadLimit = err.message.includes("PAYLOAD_SIZE_EXCEEDED");
    const isMalformed = err.message.includes("MALFORMED_EVENT");
    const statusCode = isPayloadLimit || isMalformed ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code: isPayloadLimit
          ? "PAYLOAD_TOO_LARGE"
          : isMalformed
            ? "VALIDATION_FAILED"
            : "INGESTION_ERROR",
        message: err.message,
      },
    });
  }
});

/**
 * 2. GET /: List and filter stream events
 */
eventStreamingRouter.get("/", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "events:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires events:read permission." },
    });
  }

  const parseResult = EventQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid query parameters.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const results = eventStreamingService.listEvents(orgId, parseResult.data);
  return res.json({ success: true, data: results, error: null });
});

/**
 * 3. GET /metrics: Aggregated event processing metrics
 */
eventStreamingRouter.get("/metrics", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "events:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires events:read permission." },
    });
  }

  const metrics = eventStreamingService.getEventMetrics(orgId);
  return res.json({ success: true, data: metrics, error: null });
});

/**
 * 4. GET /dead-letter: List dead-lettered events
 */
eventStreamingRouter.get("/dead-letter", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "events:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires events:read permission." },
    });
  }

  const results = eventStreamingService.listEvents(orgId, {
    status: "DEAD_LETTERED",
    limit: 50,
    offset: 0,
  });

  return res.json({ success: true, data: results, error: null });
});

/**
 * 5. POST /dead-letter/:id/redrive: Redrive dead-lettered event
 */
eventStreamingRouter.post(
  "/dead-letter/:id/redrive",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "events:write") &&
        !hasPermission(caller.role, "events:admin"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires events:write or events:admin permission.",
        },
      });
    }

    try {
      const outcome = await eventStreamingService.redriveDeadLetter(
        orgId,
        req.params.id,
        caller.userId,
      );

      return res.json({ success: true, data: outcome, error: null });
    } catch (err: any) {
      const isNotFound = err.message.includes("NOT_FOUND");
      const isInvalidState = err.message.includes("INVALID_STATE");
      const statusCode = isNotFound ? 404 : isInvalidState ? 409 : 500;

      return res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: isNotFound
            ? "NOT_FOUND"
            : isInvalidState
              ? "CONFLICT"
              : "REDRIVE_FAILED",
          message: err.message,
        },
      });
    }
  },
);

/**
 * 6. POST /replay/preview: Preview replay scope
 */
eventStreamingRouter.post(
  "/replay/preview",
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "events:replay") &&
        !hasPermission(caller.role, "events:admin"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires events:replay or events:admin permission.",
        },
      });
    }

    const parseResult = EventReplayRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid replay request specification.",
          details: parseResult.error.flatten(),
        },
      });
    }

    const preview = await eventStreamingService.previewReplay(
      orgId,
      parseResult.data,
    );
    return res.json({ success: true, data: preview, error: null });
  },
);

/**
 * 7. POST /replay: Execute authorized event replay
 */
eventStreamingRouter.post("/replay", async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (
    !caller ||
    (!hasPermission(caller.role, "events:replay") &&
      !hasPermission(caller.role, "events:admin"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires events:replay or events:admin permission.",
      },
    });
  }

  const parseResult = EventReplayRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid replay request specification.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const result = await eventStreamingService.executeReplay(
    orgId,
    parseResult.data,
    caller.userId,
  );

  return res.status(200).json({ success: true, data: result, error: null });
});

/**
 * 8. CONNECTOR SUBSCRIPTIONS
 */
eventStreamingRouter.get("/subscriptions", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (
    !caller ||
    (!hasPermission(caller.role, "connections:read") &&
      !hasPermission(caller.role, "events:read"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires connections:read or events:read permission.",
      },
    });
  }

  const subs = eventStreamingService.listSubscriptions(orgId);
  return res.json({ success: true, data: subs, error: null });
});

eventStreamingRouter.post("/subscriptions", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (
    !caller ||
    (!hasPermission(caller.role, "connections:write") &&
      !hasPermission(caller.role, "events:write"))
  ) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires connections:write or events:write permission.",
      },
    });
  }

  const parseResult = CreateConnectorSubscriptionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid connector subscription data.",
        details: parseResult.error.flatten(),
      },
    });
  }

  const sub = eventStreamingService.createSubscription(
    orgId,
    parseResult.data,
    caller.userId,
  );

  return res.status(201).json({ success: true, data: sub, error: null });
});

eventStreamingRouter.get(
  "/subscriptions/:id",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "connections:read") &&
        !hasPermission(caller.role, "events:read"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires connections:read or events:read permission.",
        },
      });
    }

    const sub = eventStreamingService.getSubscription(orgId, req.params.id);
    if (!sub) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Subscription not found." },
      });
    }

    return res.json({ success: true, data: sub, error: null });
  },
);

eventStreamingRouter.patch(
  "/subscriptions/:id",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "connections:write") &&
        !hasPermission(caller.role, "events:write"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires connections:write or events:write permission.",
        },
      });
    }

    const parseResult = UpdateConnectorSubscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid update data.",
          details: parseResult.error.flatten(),
        },
      });
    }

    const updated = eventStreamingService.updateSubscription(
      orgId,
      req.params.id,
      parseResult.data,
      caller.userId,
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Subscription not found." },
      });
    }

    return res.json({ success: true, data: updated, error: null });
  },
);

eventStreamingRouter.delete(
  "/subscriptions/:id",
  (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Organization ID is required." },
      });
    }

    const caller = getCaller(req, orgId);
    if (
      !caller ||
      (!hasPermission(caller.role, "connections:write") &&
        !hasPermission(caller.role, "events:write"))
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires connections:write or events:write permission.",
        },
      });
    }

    const deleted = eventStreamingService.deleteSubscription(
      orgId,
      req.params.id,
      caller.userId,
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Subscription not found." },
      });
    }

    return res.json({
      success: true,
      data: { message: "Connector subscription deleted successfully." },
      error: null,
    });
  },
);

/**
 * 9. GET /:id: Inspect single event with sensitive data redaction
 */
eventStreamingRouter.get("/:id", (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Organization ID is required." },
    });
  }

  const caller = getCaller(req, orgId);
  if (!caller || !hasPermission(caller.role, "events:read")) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Requires events:read permission." },
    });
  }

  const shouldRedact =
    req.query.redact === "true" || !hasPermission(caller.role, "events:admin");

  const event = eventStreamingService.getEventById(orgId, req.params.id, {
    redactSensitive: shouldRedact,
  });

  if (!event) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Stream event not found." },
    });
  }

  return res.json({ success: true, data: event, error: null });
});
