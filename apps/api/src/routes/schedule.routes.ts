import { Router } from "express";
import crypto from "crypto";
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
} from "@flowforge/shared";
import {
  calculateNextScheduleRun,
  isValidCron,
  isValidTimeZone,
} from "@flowforge/integrations";
import { apiStore, ScheduleRecord, WorkflowExecutionRecord } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { resolveActiveWorkflowVersionId } from "./workflow.routes.js";

export const scheduleRouter = Router();

scheduleRouter.use(requireAuth);

// List schedules for organization
scheduleRouter.get(
  "/",
  requirePermission("schedule:read"),
  (req, res) => {
    const orgId = req.organizationId!;
    const schedules = Array.from(apiStore.schedules.values())
      .filter((s) => s.organizationId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: schedules,
      error: null,
      meta: { total: schedules.length },
    });
  },
);

// Create new schedule
scheduleRouter.post(
  "/",
  requirePermission("schedule:write"),
  (req, res) => {
    const parseResult = CreateScheduleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid schedule definition",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const {
      workflowId,
      name,
      cronExpression,
      scheduledAt,
      timezone = "UTC",
      misfirePolicy = "RUN_ONCE",
      enabled = true,
    } = parseResult.data;

    // Validate cron expression
    if (cronExpression && !isValidCron(cronExpression)) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_CRON",
          message: `Invalid cron expression format: '${cronExpression}'. Expected 5 fields.`,
        },
      });
      return;
    }

    // Validate IANA timezone
    if (!isValidTimeZone(timezone)) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_TIMEZONE",
          message: `Invalid IANA time zone identifier: '${timezone}'.`,
        },
      });
      return;
    }

    // Check workflow exists, belongs to caller's org, and has published version
    const workflow = apiStore.workflows.get(workflowId);
    if (
      !workflow ||
      workflow.organizationId !== req.organizationId ||
      workflow.deletedAt
    ) {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Target workflow not found in active organization.",
        },
      });
      return;
    }

    if (!workflow.publishedVersionId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "WORKFLOW_NOT_PUBLISHED",
          message: "Workflow must have a published version before creating a schedule.",
        },
      });
      return;
    }

    const scheduleId = `sch_${crypto.randomUUID()}`;
    const now = new Date();
    const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : undefined;

    let nextRunAt: Date | undefined;
    try {
      nextRunAt = calculateNextScheduleRun(
        { cronExpression, scheduledAt: scheduledAtDate, timezone },
        now,
      );
    } catch (calcErr: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "SCHEDULE_CALCULATION_ERROR",
          message: calcErr.message,
        },
      });
      return;
    }

    const record: ScheduleRecord = {
      id: scheduleId,
      organizationId: req.organizationId!,
      workflowId,
      name,
      cronExpression,
      scheduledAt: scheduledAtDate,
      timezone,
      enabled,
      misfirePolicy,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.schedules.set(scheduleId, record);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "schedule.created",
      resourceType: "schedule",
      resourceId: scheduleId,
      metadata: { name, workflowId, nextRunAt },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: record,
      error: null,
    });
  },
);

// Get schedule details
scheduleRouter.get(
  "/:id",
  requirePermission("schedule:read"),
  (req, res) => {
    const schedule = apiStore.schedules.get(req.params.id);
    if (!schedule || schedule.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Schedule not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: schedule,
      error: null,
    });
  },
);

// Update schedule
scheduleRouter.patch(
  "/:id",
  requirePermission("schedule:write"),
  (req, res) => {
    const schedule = apiStore.schedules.get(req.params.id);
    if (!schedule || schedule.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Schedule not found." },
      });
      return;
    }

    const parseResult = UpdateScheduleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid update payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { name, cronExpression, scheduledAt, timezone, enabled, misfirePolicy } =
      parseResult.data;

    if (cronExpression !== undefined) {
      if (cronExpression && !isValidCron(cronExpression)) {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: "INVALID_CRON", message: "Invalid cron expression format." },
        });
        return;
      }
      schedule.cronExpression = cronExpression;
    }

    if (timezone !== undefined) {
      if (!isValidTimeZone(timezone)) {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: "INVALID_TIMEZONE", message: "Invalid IANA time zone identifier." },
        });
        return;
      }
      schedule.timezone = timezone;
    }

    if (name !== undefined) schedule.name = name;
    if (scheduledAt !== undefined)
      schedule.scheduledAt = scheduledAt ? new Date(scheduledAt) : undefined;
    if (enabled !== undefined) schedule.enabled = enabled;
    if (misfirePolicy !== undefined) schedule.misfirePolicy = misfirePolicy;

    // Recalculate next occurrence
    const now = new Date();
    schedule.nextRunAt = calculateNextScheduleRun(schedule, now);
    schedule.updatedAt = now;

    apiStore.schedules.set(schedule.id, schedule);

    res.json({
      success: true,
      data: schedule,
      error: null,
    });
  },
);

// Delete schedule
scheduleRouter.delete(
  "/:id",
  requirePermission("schedule:write"),
  (req, res) => {
    const schedule = apiStore.schedules.get(req.params.id);
    if (!schedule || schedule.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Schedule not found." },
      });
      return;
    }

    apiStore.schedules.delete(schedule.id);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "schedule.deleted",
      resourceType: "schedule",
      resourceId: schedule.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Schedule deleted successfully." },
      error: null,
    });
  },
);

// Manually trigger immediate execution of schedule
scheduleRouter.post(
  "/:id/run-now",
  requirePermission("schedule:write"),
  (req, res) => {
    const schedule = apiStore.schedules.get(req.params.id);
    if (!schedule || schedule.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Schedule not found." },
      });
      return;
    }

    const workflow = apiStore.workflows.get(schedule.workflowId);
    if (!workflow || workflow.deletedAt || !workflow.publishedVersionId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "WORKFLOW_NOT_PUBLISHED",
          message: "Workflow must have a published version before execution.",
        },
      });
      return;
    }

    const executionId = `exec_${crypto.randomUUID()}`;
    const now = new Date();
    const resolvedVersionId = resolveActiveWorkflowVersionId(workflow.id, "production") || workflow.publishedVersionId;

    const execution: WorkflowExecutionRecord = {
      id: executionId,
      organizationId: req.organizationId!,
      workflowId: workflow.id,
      workflowVersionId: resolvedVersionId,
      environment: "production",
      triggerType: "SCHEDULE",
      triggerPayload: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        manualTrigger: true,
      },
      status: "QUEUED",
      contextData: {
        trigger: {
          type: "SCHEDULE",
          payload: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            manualTrigger: true,
          },
        },
      },
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.executions.set(executionId, execution);

    res.status(202).json({
      success: true,
      data: execution,
      error: null,
    });
  },
);

