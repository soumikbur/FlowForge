import crypto from "crypto";
import {
  defaultRegistry,
  resolveNextNodes,
  getTriggerNode,
  assertTransition,
} from "@flowforge/workflow-engine";
import {
  executeSafeHttpRequest,
  defaultEmailService,
} from "@flowforge/integrations";
import {
  InMemoryDatabase,
  WorkflowExecutionRecord,
  ExecutionStepRecord,
  ApprovalRecord,
} from "@flowforge/test-utils";

export class WorkflowExecutionRunner {
  constructor(private db: InMemoryDatabase) {
    this.registerIntegrationHandlers();
  }

  private registerIntegrationHandlers(): void {
    // Register HTTP_REQUEST handler
    defaultRegistry.register("HTTP_REQUEST", async (node, context) => {
      const url = node.config.url as string;
      const method = (node.config.method as string) || "GET";
      const timeoutMs = (node.config.timeoutMs as number) || 10000;

      const res = await executeSafeHttpRequest({
        url,
        method,
        timeoutMs,
      });

      return {
        status: "COMPLETED",
        output: {
          statusCode: res.status,
          data: res.data,
          durationMs: res.durationMs,
        },
      };
    });

    // Register EMAIL handler
    defaultRegistry.register("EMAIL", async (node, context) => {
      const to = (node.config.to as string) || "";
      const subject = (node.config.subject as string) || "";
      const template = (node.config.template as string) || "";

      const delivery = await defaultEmailService.sendEmail({
        idempotencyKey: `${context.trigger?.type}_${Date.now()}`,
        to,
        subject,
        text: template,
      });

      return {
        status: "COMPLETED",
        output: {
          delivered: delivery.delivered,
          messageId: delivery.messageId,
          timestamp: delivery.timestamp,
        },
      };
    });
  }

  /**
   * Executes a workflow execution until completion or suspension (approval/delay)
   */
  public async processExecution(
    executionId: string,
  ): Promise<WorkflowExecutionRecord> {
    const execution = this.db.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    const version = this.db.versions.get(execution.workflowVersionId);
    if (!version) {
      execution.status = "FAILED";
      execution.completedAt = new Date();
      execution.errorDetails = {
        message: "Workflow version snapshot not found.",
      };
      this.db.executions.set(execution.id, execution);
      return execution;
    }

    const definition = version.definition;

    // Transition execution to RUNNING
    assertTransition(execution.status, "RUNNING");
    execution.status = "RUNNING";
    if (!execution.startedAt) {
      execution.startedAt = new Date();
    }
    execution.updatedAt = new Date();
    this.db.executions.set(execution.id, execution);

    // Determine entry node
    let currentNode = execution.currentNodeId
      ? definition.nodes.find((n) => n.id === execution.currentNodeId)
      : getTriggerNode(definition);

    if (!currentNode) {
      execution.status = "FAILED";
      execution.completedAt = new Date();
      execution.errorDetails = {
        message: "No valid entry node in workflow definition.",
      };
      this.db.executions.set(execution.id, execution);
      return execution;
    }

    const maxSteps = 100;
    let stepCount = 0;

    while (currentNode && stepCount < maxSteps) {
      stepCount++;
      execution.currentNodeId = currentNode.id;

      // Create step execution record
      const stepId = `step_${crypto.randomUUID()}`;
      const stepRecord: ExecutionStepRecord = {
        id: stepId,
        executionId: execution.id,
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        nodeName: currentNode.name,
        status: "RUNNING",
        inputPayload: execution.contextData,
        startedAt: new Date(),
        attempt: 1,
      };
      this.db.steps.set(stepId, stepRecord);

      try {
        const handler = defaultRegistry.get(currentNode.type);
        const result = await handler(currentNode, execution.contextData);

        if (result.status === "WAITING") {
          if (result.waitReason === "APPROVAL") {
            stepRecord.status = "WAITING";
            this.db.steps.set(stepId, stepRecord);

            // Create Approval record
            const approvalId = `appr_${crypto.randomUUID()}`;
            const approval: ApprovalRecord = {
              id: approvalId,
              organizationId: execution.organizationId,
              executionId: execution.id,
              stepId: stepRecord.id,
              title: (result.waitPayload?.title as string) || currentNode.name,
              description: result.waitPayload?.description as string,
              requiredRole:
                (result.waitPayload?.requiredRole as any) || "ADMIN",
              status: "PENDING",
              createdAt: new Date(),
            };
            this.db.approvals.set(approvalId, approval);

            execution.status = "WAITING_APPROVAL";
            execution.updatedAt = new Date();
            this.db.executions.set(execution.id, execution);
            return execution;
          }

          if (result.waitReason === "DELAY") {
            stepRecord.status = "WAITING";
            this.db.steps.set(stepId, stepRecord);

            execution.status = "WAITING_DELAY";
            execution.updatedAt = new Date();
            this.db.executions.set(execution.id, execution);
            return execution;
          }
        }

        // Step completed successfully
        stepRecord.status = "COMPLETED";
        stepRecord.outputPayload = result.output;
        stepRecord.completedAt = new Date();
        this.db.steps.set(stepId, stepRecord);

        // Update context data
        execution.contextData = {
          ...execution.contextData,
          steps: {
            ...((execution.contextData.steps as any) || {}),
            [currentNode.id]: {
              output: result.output,
              status: "COMPLETED",
            },
          },
        };

        // Resolve next step in graph
        const plan = resolveNextNodes(definition, currentNode.id, result);

        if (plan.isComplete || currentNode.type === "END") {
          execution.status = "SUCCEEDED";
          execution.completedAt = new Date();
          execution.updatedAt = new Date();
          this.db.executions.set(execution.id, execution);
          return execution;
        }

        // Move to next node
        currentNode = plan.nextNodes[0];
      } catch (err: any) {
        stepRecord.status = "FAILED";
        stepRecord.errorMessage = err.message;
        stepRecord.completedAt = new Date();
        this.db.steps.set(stepId, stepRecord);

        // Check retry policy
        if (execution.retryCount < 2) {
          execution.retryCount++;
          execution.status = "RETRYING";
          execution.updatedAt = new Date();
          this.db.executions.set(execution.id, execution);
          // Wait small backoff then retry
          await new Promise((res) =>
            setTimeout(res, 200 * execution.retryCount),
          );
          continue;
        }

        execution.status = "FAILED";
        execution.completedAt = new Date();
        execution.errorDetails = {
          failedNodeId: currentNode.id,
          message: err.message,
        };
        execution.updatedAt = new Date();
        this.db.executions.set(execution.id, execution);
        return execution;
      }
    }

    if (stepCount >= maxSteps) {
      execution.status = "FAILED";
      execution.completedAt = new Date();
      execution.errorDetails = {
        message: "Max workflow execution step limit reached (100).",
      };
      this.db.executions.set(execution.id, execution);
    }

    return execution;
  }
}
