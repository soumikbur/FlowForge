import crypto from "crypto";
import {
  InMemoryDatabase,
  ScheduleRecord,
  WorkflowExecutionRecord,
} from "@flowforge/test-utils";
import { calculateNextScheduleRun } from "@flowforge/integrations";

export class WorkflowSchedulerService {
  private processedOccurrences = new Set<string>();

  constructor(private db: InMemoryDatabase) {}

  /**
   * Finds all schedules that are enabled and due to run at or before the given timestamp.
   */
  public findDueSchedules(now: Date = new Date()): ScheduleRecord[] {
    const due: ScheduleRecord[] = [];
    for (const schedule of this.db.schedules.values()) {
      if (
        schedule.enabled &&
        schedule.nextRunAt &&
        schedule.nextRunAt.getTime() <= now.getTime()
      ) {
        due.push(schedule);
      }
    }
    due.sort(
      (a, b) =>
        (a.nextRunAt?.getTime() || 0) - (b.nextRunAt?.getTime() || 0),
    );
    return due;
  }

  /**
   * Processes a single due schedule, advancing its occurrence and dispatching a workflow execution.
   */
  public async processDueSchedule(
    scheduleId: string,
    now: Date = new Date(),
  ): Promise<WorkflowExecutionRecord | null> {
    const schedule = this.db.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled || !schedule.nextRunAt) {
      return null;
    }

    const targetRunTime = schedule.nextRunAt;
    const occurrenceKey = `occ_${schedule.id}_${targetRunTime.toISOString()}`;

    if (this.processedOccurrences.has(occurrenceKey)) {
      return null;
    }

    const workflow = this.db.workflows.get(schedule.workflowId);
    if (
      !workflow ||
      workflow.status !== "ACTIVE" ||
      !workflow.publishedVersionId ||
      workflow.deletedAt
    ) {
      // Inactive, archived, or draft workflow
      schedule.lastRunAt = targetRunTime;
      schedule.nextRunAt = calculateNextScheduleRun(schedule, now);
      schedule.updatedAt = now;
      this.db.schedules.set(schedule.id, schedule);
      return null;
    }

    // Mark occurrence processed
    this.processedOccurrences.add(occurrenceKey);

    // Advance schedule timestamps
    schedule.lastRunAt = targetRunTime;
    schedule.nextRunAt = calculateNextScheduleRun(schedule, now);
    if (schedule.scheduledAt && !schedule.cronExpression) {
      // One-time schedule completes and disables itself
      schedule.enabled = false;
    }
    schedule.updatedAt = now;
    this.db.schedules.set(schedule.id, schedule);

    // Create durable execution record
    const executionId = `exec_${crypto.randomUUID()}`;
    const execution: WorkflowExecutionRecord = {
      id: executionId,
      organizationId: schedule.organizationId,
      workflowId: workflow.id,
      workflowVersionId: workflow.publishedVersionId,
      triggerType: "SCHEDULE",
      triggerPayload: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        occurrenceKey,
        scheduledFor: targetRunTime.toISOString(),
      },
      status: "QUEUED",
      contextData: {
        trigger: {
          type: "SCHEDULE",
          payload: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            scheduledFor: targetRunTime.toISOString(),
          },
        },
      },
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.db.executions.set(executionId, execution);
    return execution;
  }

  /**
   * Polls all due schedules and dispatches them safely.
   */
  public async pollAndDispatch(now: Date = new Date()): Promise<{
    dispatchedCount: number;
    dispatchedExecutionIds: string[];
  }> {
    const due = this.findDueSchedules(now);
    const dispatchedExecutionIds: string[] = [];

    for (const schedule of due) {
      const exec = await this.processDueSchedule(schedule.id, now);
      if (exec) {
        dispatchedExecutionIds.push(exec.id);
      }
    }

    return {
      dispatchedCount: dispatchedExecutionIds.length,
      dispatchedExecutionIds,
    };
  }
}
