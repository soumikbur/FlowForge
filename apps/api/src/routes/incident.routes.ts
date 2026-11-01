import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateIncidentSchema,
  UpdateIncidentSchema,
  OperationalIncidentRecord,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { publishDomainEvent } from "@flowforge/integrations";

export const incidentRouter = Router();

incidentRouter.use(requireAuth);

/**
 * 1. List operational incidents for the organization
 */
incidentRouter.get(
  "/",
  requirePermission("org:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const affectedService = req.query.service as string | undefined;

    let incidents = Array.from(apiStore.incidents.values()).filter(
      (inc) => inc.organizationId === orgId,
    );

    if (status) {
      incidents = incidents.filter((inc) => inc.status === status);
    }
    if (severity) {
      incidents = incidents.filter((inc) => inc.severity === severity);
    }
    if (affectedService) {
      incidents = incidents.filter(
        (inc) =>
          inc.affectedService.toLowerCase() === affectedService.toLowerCase(),
      );
    }

    incidents.sort(
      (a, b) => b.lastObservedAt.getTime() - a.lastObservedAt.getTime(),
    );

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const paginated = incidents.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginated,
      meta: {
        total: incidents.length,
        limit,
        offset,
      },
      error: null,
    });
  },
);

/**
 * 2. Get operational incidents summary metrics
 */
incidentRouter.get(
  "/summary",
  requirePermission("org:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const incidents = Array.from(apiStore.incidents.values()).filter(
      (inc) => inc.organizationId === orgId,
    );

    const openCount = incidents.filter((i) => i.status === "OPEN").length;
    const investigatingCount = incidents.filter(
      (i) => i.status === "INVESTIGATING",
    ).length;
    const resolvedCount = incidents.filter(
      (i) => i.status === "RESOLVED",
    ).length;
    const criticalCount = incidents.filter(
      (i) => i.severity === "CRITICAL" && i.status !== "RESOLVED",
    ).length;

    const byService: Record<string, number> = {};
    const bySeverity: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    for (const inc of incidents) {
      byService[inc.affectedService] =
        (byService[inc.affectedService] || 0) + 1;
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        totalCount: incidents.length,
        openCount,
        investigatingCount,
        resolvedCount,
        criticalCount,
        byService,
        bySeverity,
      },
      error: null,
    });
  },
);

/**
 * 3. Get single operational incident by ID
 */
incidentRouter.get(
  "/:id",
  requirePermission("org:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const incident = apiStore.incidents.get(req.params.id);

    if (!incident || incident.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Incident not found.",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: incident,
      error: null,
    });
  },
);

/**
 * 4. Create or deduplicate operational incident
 */
incidentRouter.post(
  "/",
  requirePermission("org:write"),
  (req: Request, res: Response) => {
    const parseResult = CreateIncidentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.issues.map((i) => i.message).join(", "),
        },
      });
      return;
    }

    const orgId = req.organizationId!;
    const body = parseResult.data;
    const now = new Date();

    // Deduplication check: if a fingerprint is provided, check for active incident
    if (body.fingerprint) {
      const existing = Array.from(apiStore.incidents.values()).find(
        (inc) =>
          inc.organizationId === orgId &&
          inc.fingerprint === body.fingerprint &&
          inc.status !== "RESOLVED",
      );

      if (existing) {
        existing.occurrenceCount += 1;
        existing.lastObservedAt = now;
        existing.updatedAt = now;
        if (
          body.correlationId &&
          !existing.correlationIds.includes(body.correlationId)
        ) {
          existing.correlationIds.push(body.correlationId);
        }
        apiStore.incidents.set(existing.id, existing);

        res.status(200).json({
          success: true,
          data: existing,
          meta: { deduplicated: true },
          error: null,
        });
        return;
      }
    }

    const incidentId = `inc_${crypto.randomUUID()}`;
    const newIncident: OperationalIncidentRecord = {
      id: incidentId,
      organizationId: orgId,
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: "OPEN",
      affectedService: body.affectedService,
      workflowId: body.workflowId,
      fingerprint: body.fingerprint,
      occurrenceCount: 1,
      correlationIds: body.correlationId ? [body.correlationId] : [],
      firstObservedAt: now,
      lastObservedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.incidents.set(incidentId, newIncident);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "incident.created",
      resourceType: "incident",
      resourceId: incidentId,
      metadata: {
        title: body.title,
        severity: body.severity,
        affectedService: body.affectedService,
      },
      ipAddress: req.ip,
    });

    publishDomainEvent(apiStore, {
      type: "operational.incident.created",
      organizationId: orgId,
      resourceType: "incident",
      resourceId: incidentId,
      actorId: req.user?.id,
      data: {
        incidentId,
        title: body.title,
        severity: body.severity,
      },
    });

    res.status(201).json({
      success: true,
      data: newIncident,
      error: null,
    });
  },
);

/**
 * 5. Update operational incident (status, resolution, assignee)
 */
incidentRouter.patch(
  "/:id",
  requirePermission("org:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const incident = apiStore.incidents.get(req.params.id);

    if (!incident || incident.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Incident not found.",
        },
      });
      return;
    }

    const parseResult = UpdateIncidentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.issues.map((i) => i.message).join(", "),
        },
      });
      return;
    }

    const body = parseResult.data;
    const now = new Date();

    if (body.status) {
      incident.status = body.status;
      if (body.status === "RESOLVED") {
        incident.resolvedAt = now;
        incident.resolvedById = req.user?.id;
      }
    }
    if (body.severity) {
      incident.severity = body.severity;
    }
    if (body.assignedToId !== undefined) {
      incident.assignedToId = body.assignedToId;
    }
    if (body.resolutionSummary !== undefined) {
      incident.resolutionSummary = body.resolutionSummary;
    }

    incident.updatedAt = now;
    apiStore.incidents.set(incident.id, incident);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action:
        incident.status === "RESOLVED"
          ? "incident.resolved"
          : "incident.updated",
      resourceType: "incident",
      resourceId: incident.id,
      metadata: {
        status: incident.status,
        resolutionSummary: incident.resolutionSummary,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: incident,
      error: null,
    });
  },
);
