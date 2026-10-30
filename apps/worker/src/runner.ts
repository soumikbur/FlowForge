import crypto from "crypto";
import {
  defaultRegistry,
  NodeHandlerRegistry,
  resolveNextNodes,
  getTriggerNode,
  assertTransition,
  canTransition,
  isTerminalState,
  buildExecutionPlan,
  ExecutionContext,
} from "@flowforge/workflow-engine";
import {
  executeSafeHttpRequest,
  defaultEmailService,
  decryptCredentialData,
  defaultConnectorRegistry,
  redactDeep,
  redactErrorMessage,
  publishDomainEvent,
} from "@flowforge/integrations";
import {
  InMemoryDatabase,
  WorkflowExecutionRecord,
  ExecutionStepRecord,
  ApprovalRecord,
  DelayRecord,
} from "@flowforge/test-utils";

export class WorkflowExecutionRunner {
  private activeExecutions = new Map<string, AbortController>();

  constructor(
    private db: InMemoryDatabase,
    private registry: NodeHandlerRegistry = defaultRegistry,
  ) {
    if (registry === defaultRegistry) {
      this.registerIntegrationHandlers();
    }
  }

  private registerIntegrationHandlers(): void {
    // Register HTTP_REQUEST handler
    this.registry.register("HTTP_REQUEST", async (node, context) => {
      const url = node.config.url as string;
      const method = (node.config.method as string) || "GET";
      const timeoutMs = (node.config.timeoutMs as number) || 10000;
      const connectionId =
        (node.config.connectionId as string) ||
        (node.config.credentialId as string | undefined);
      const maxRetries = (node.config.maxRetries as number) ?? 2;
      const idempotentRetry = (node.config.idempotentRetry as boolean) ?? false;
      const headers = { ...((node.config.headers as Record<string, string>) || {}) };

      // Resolve connection or legacy credential if configured
      if (connectionId) {
        const conn = this.db.connections.get(connectionId);
        if (conn) {
          if (conn.organizationId !== context.organizationId) {
            const err = new Error(
              `Integration connection '${connectionId}' not found or unauthorized for organization.`,
            );
            (err as any).isNonRetryable = true;
            throw err;
          }
          if (conn.status !== "ACTIVE") {
            const err = new Error(
              `Integration connection '${connectionId}' is ${conn.status}. Cannot execute request.`,
            );
            (err as any).isNonRetryable = true;
            throw err;
          }
          try {
            const decrypted = decryptCredentialData(
              conn.encryptedData,
            ) as Record<string, unknown>;
            if (decrypted.apiKey) {
              const headerName = (decrypted.authHeaderName as string) || "Authorization";
              const prefix = (decrypted.authPrefix as string) ?? "Bearer";
              headers[headerName] = prefix ? `${prefix} ${decrypted.apiKey}` : String(decrypted.apiKey);
            } else if (decrypted.token) {
              headers["Authorization"] = `Bearer ${decrypted.token}`;
            } else if (decrypted.username) {
              const basic = Buffer.from(
                `${decrypted.username}:${decrypted.password || ""}`,
              ).toString("base64");
              headers["Authorization"] = `Basic ${basic}`;
            }
          } catch (decErr: any) {
            const err = new Error(`Failed to decrypt connection credentials: ${decErr.message}`);
            (err as any).isNonRetryable = true;
            throw err;
          }
        } else {
          // Fallback to legacy credential record
          const cred = this.db.credentials.get(connectionId);
          if (!cred || cred.organizationId !== context.organizationId) {
            const err = new Error(
              `Integration credential '${connectionId}' not found or unauthorized for organization.`,
            );
            (err as any).isNonRetryable = true;
            throw err;
          }

          try {
            const decrypted = decryptCredentialData(
              cred.encryptedData,
            ) as Record<string, unknown>;
            if (cred.type === "BEARER_TOKEN" && decrypted.token) {
              headers["Authorization"] = `Bearer ${decrypted.token}`;
            } else if (cred.type === "API_KEY" && decrypted.apiKey) {
              const headerName = (decrypted.headerName as string) || "X-API-Key";
              headers[headerName] = decrypted.apiKey as string;
            } else if (cred.type === "BASIC_AUTH" && decrypted.username) {
              const basic = Buffer.from(
                `${decrypted.username}:${decrypted.password || ""}`,
              ).toString("base64");
              headers["Authorization"] = `Basic ${basic}`;
            }
          } catch (decErr: any) {
            const err = new Error(`Failed to decrypt credential: ${decErr.message}`);
            (err as any).isNonRetryable = true;
            throw err;
          }
        }
      }

      const res = await executeSafeHttpRequest({
        url,
        method,
        headers,
        timeoutMs,
        maxRetries,
        idempotentRetry,
      });

      return {
        status: "COMPLETED",
        output: {
          statusCode: res.status,
          headers: res.headers,
          data: res.data,
          durationMs: res.durationMs,
        },
      };
    });

    // Register EMAIL handler
    this.registry.register("EMAIL", async (node, context) => {
      const to = (node.config.to as string) || "";
      const subject = (node.config.subject as string) || "";
      const template = (node.config.template as string) || "";
      const connectionId = node.config.connectionId as string | undefined;

      if (connectionId) {
        const conn = this.db.connections.get(connectionId);
        if (!conn || conn.organizationId !== context.organizationId) {
          const err = new Error(
            `Email connection '${connectionId}' not found or unauthorized for organization.`,
          );
          (err as any).isNonRetryable = true;
          throw err;
        }
        if (conn.status !== "ACTIVE") {
          const err = new Error(
            `Email connection '${connectionId}' is ${conn.status}. Cannot send email.`,
          );
          (err as any).isNonRetryable = true;
          throw err;
        }
      }

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

    // Register CONNECTOR_ACTION handler
    this.registry.register("CONNECTOR_ACTION", async (node, context) => {
      const connectorId = node.config.connectorId as string;
      const operationId = node.config.operationId as string;
      const connectionId = node.config.connectionId as string;
      const parameters = (node.config.parameters as Record<string, unknown>) || {};
      const timeoutMs = (node.config.timeoutMs as number) || 10000;
      const idempotentRetry = (node.config.idempotentRetry as boolean) ?? false;

      if (!defaultConnectorRegistry.has(connectorId)) {
        const err = new Error(`Connector '${connectorId}' is not registered in connector catalog.`);
        (err as any).isNonRetryable = true;
        throw err;
      }

      const conn = this.db.connections.get(connectionId);
      if (!conn || conn.organizationId !== context.organizationId) {
        const err = new Error(
          `Integration connection '${connectionId}' not found or unauthorized for organization.`,
        );
        (err as any).isNonRetryable = true;
        throw err;
      }

      if (conn.status !== "ACTIVE") {
        const err = new Error(
          `Integration connection '${connectionId}' is ${conn.status}. Cannot execute operation.`,
        );
        (err as any).isNonRetryable = true;
        throw err;
      }

      let credentials: Record<string, unknown> = {};
      try {
        credentials = decryptCredentialData(conn.encryptedData) as Record<string, unknown>;
      } catch (decErr: any) {
        const err = new Error(
          `Failed to decrypt credentials for connection '${connectionId}': ${decErr.message}`,
        );
        (err as any).isNonRetryable = true;
        throw err;
      }

      const handler = defaultConnectorRegistry.getHandler(connectorId);
      try {
        const result = await handler(operationId, parameters, {
          organizationId: context.organizationId,
          connectionId,
          credentials,
          timeoutMs,
          idempotentRetry,
        });

        return {
          status: "COMPLETED",
          output: redactDeep(result.data) as Record<string, unknown>,
        };
      } catch (execErr: any) {
        const sanitized = redactErrorMessage(execErr.message);
        const err = new Error(sanitized);
        (err as any).isNonRetryable = execErr.isNonRetryable ?? (!idempotentRetry);
        (err as any).category = execErr.category || "CONNECTOR_EXECUTION_ERROR";
        throw err;
      }
    });
  }

  /**
   * Cancels an active or waiting workflow execution.
   */
  public async cancelExecution(
    executionId: string,
    reason?: string,
  ): Promise<WorkflowExecutionRecord> {
    const execution = this.db.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    if (isTerminalState(execution.status)) {
      throw new Error(
        `Cannot cancel execution in terminal state '${execution.status}'.`,
      );
    }

    assertTransition(execution.status, "CANCELLED");

    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
    }

    const now = new Date();
    execution.status = "CANCELLED";
    execution.completedAt = now;
    execution.updatedAt = now;
    execution.errorDetails = {
      cancellationReason: reason || "Execution cancelled by user",
      message: reason || "Execution cancelled by user",
    };
    this.db.executions.set(execution.id, execution);

    for (const step of this.db.steps.values()) {
      if (
        step.executionId === execution.id &&
        (step.status === "RUNNING" || step.status === "WAITING")
      ) {
        step.status = "SKIPPED";
        step.errorMessage = "Execution was cancelled";
        step.completedAt = now;
        this.db.steps.set(step.id, step);
      }
    }

    // Cancel pending delays
    for (const delay of this.db.delays.values()) {
      if (delay.executionId === execution.id && delay.status === "PENDING") {
        delay.status = "CANCELLED";
        this.db.delays.set(delay.id, delay);
      }
    }

    // Invalidate and reject pending approvals
    for (const approval of this.db.approvals.values()) {
      if (
        approval.executionId === execution.id &&
        approval.status === "PENDING"
      ) {
        approval.status = "REJECTED";
        approval.decisionComment = "Execution was cancelled";
        approval.decidedAt = now;
        this.db.approvals.set(approval.id, approval);
      }
    }

    return execution;
  }

  /**
   * Resumes a delayed execution once its wait duration has elapsed or upon forced administrative resume.
   */
  public async resumeDelayedExecution(
    executionId: string,
    options?: { force?: boolean },
  ): Promise<WorkflowExecutionRecord> {
    const execution = this.db.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    if (execution.status !== "WAITING_DELAY") {
      throw new Error(
        `Cannot resume execution in state '${execution.status}'. Expected 'WAITING_DELAY'.`,
      );
    }

    const pendingDelay = Array.from(this.db.delays.values()).find(
      (d) => d.executionId === executionId && d.status === "PENDING",
    );

    if (!pendingDelay) {
      throw new Error(
        `No pending delay record found for execution ${executionId}.`,
      );
    }

    const now = new Date();
    if (!options?.force && pendingDelay.resumeAt.getTime() > now.getTime()) {
      throw new Error(
        `Delay duration has not elapsed yet. Scheduled resume: ${pendingDelay.resumeAt.toISOString()}`,
      );
    }

    pendingDelay.status = "COMPLETED";
    this.db.delays.set(pendingDelay.id, pendingDelay);

    const step = this.db.steps.get(pendingDelay.stepId);
    if (step && step.status === "WAITING") {
      step.status = "COMPLETED";
      step.completedAt = now;
      this.db.steps.set(step.id, step);
    }

    const version = this.db.versions.get(execution.workflowVersionId);
    if (!version) {
      throw new Error("Workflow version snapshot not found.");
    }

    const currentNodeId = execution.currentNodeId!;
    const plan = resolveNextNodes(version.definition, currentNodeId, {
      status: "COMPLETED",
      output: { resumedAt: now.toISOString() },
    });

    if (plan.isComplete || plan.nextNodes.length === 0) {
      execution.status = "SUCCEEDED";
      execution.completedAt = now;
      execution.updatedAt = now;
      this.db.executions.set(execution.id, execution);
      return execution;
    }

    execution.currentNodeId = plan.nextNodes[0].id;
    execution.status = "QUEUED";
    execution.updatedAt = now;
    this.db.executions.set(execution.id, execution);

    return this.processExecution(executionId);
  }

  /**
   * Resumes or concludes an execution waiting on human approval.
   */
  public async resumeExecutionAfterApproval(
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    comment?: string,
    decidedById?: string,
  ): Promise<{ approval: ApprovalRecord; execution: WorkflowExecutionRecord }> {
    const approval = this.db.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found.`);
    }

    if (approval.status !== "PENDING") {
      throw new Error(
        `Approval already decided with status: ${approval.status}`,
      );
    }

    const execution = this.db.executions.get(approval.executionId);
    if (!execution) {
      throw new Error(`Execution ${approval.executionId} not found.`);
    }

    const now = new Date();

    // If execution was cancelled while awaiting approval, record rejection and do not resume
    if (execution.status === "CANCELLED") {
      approval.status = "REJECTED";
      approval.decisionComment = "Execution was cancelled";
      approval.decidedAt = now;
      this.db.approvals.set(approval.id, approval);
      return { approval, execution };
    }

    approval.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    approval.decisionComment = comment;
    approval.decidedById = decidedById;
    approval.decidedAt = now;
    this.db.approvals.set(approval.id, approval);

    const step = this.db.steps.get(approval.stepId);
    if (step) {
      if (decision === "APPROVE") {
        step.status = "COMPLETED";
        step.outputPayload = {
          approved: true,
          comment,
          decidedById,
          decidedAt: now.toISOString(),
        };
        step.completedAt = now;
      } else {
        step.status = "FAILED";
        step.errorMessage = comment || "Approval was rejected";
        step.completedAt = now;
      }
      this.db.steps.set(step.id, step);
    }

    if (decision === "APPROVE") {
      const version = this.db.versions.get(execution.workflowVersionId);
      if (!version) {
        throw new Error("Workflow version snapshot not found.");
      }

      const currentNodeId = execution.currentNodeId!;
      execution.contextData = {
        ...execution.contextData,
        steps: {
          ...((execution.contextData.steps as any) || {}),
          [currentNodeId]: {
            output: {
              approved: true,
              comment,
              decidedById,
              decidedAt: now.toISOString(),
            },
            status: "COMPLETED",
          },
        },
      };

      const plan = resolveNextNodes(version.definition, currentNodeId, {
        status: "COMPLETED",
        output: { approved: true, comment, decidedById },
      });

      if (plan.isComplete || plan.nextNodes.length === 0) {
        execution.status = "SUCCEEDED";
        execution.completedAt = now;
        execution.updatedAt = now;
        this.db.executions.set(execution.id, execution);
        return { approval, execution };
      }

      execution.currentNodeId = plan.nextNodes[0].id;
      execution.status = "QUEUED";
      execution.updatedAt = now;
      this.db.executions.set(execution.id, execution);

      const processed = await this.processExecution(execution.id);
      return { approval, execution: processed };
    } else {
      execution.status = "FAILED";
      execution.completedAt = now;
      execution.updatedAt = now;
      execution.errorDetails = {
        failedNodeId: execution.currentNodeId,
        message: comment || "Approval was rejected",
        decidedById,
      };
      this.db.executions.set(execution.id, execution);
      return { approval, execution };
    }
  }

  /**
   * Recovers overdue approvals whose timeout duration has expired.
   */
  public async recoverOverdueApprovals(
    now: Date = new Date(),
  ): Promise<number> {
    let timedOutCount = 0;
    for (const approval of this.db.approvals.values()) {
      if (
        approval.status === "PENDING" &&
        approval.expiresAt &&
        approval.expiresAt.getTime() <= now.getTime()
      ) {
        timedOutCount++;
        approval.status = "TIMEOUT";
        approval.decisionComment = "Approval timed out";
        approval.decidedAt = now;
        this.db.approvals.set(approval.id, approval);

        const execution = this.db.executions.get(approval.executionId);
        if (execution && execution.status === "WAITING_APPROVAL") {
          const step = this.db.steps.get(approval.stepId);
          if (step && step.status === "WAITING") {
            step.status = "FAILED";
            step.errorMessage = "Approval timed out";
            step.completedAt = now;
            this.db.steps.set(step.id, step);
          }

          execution.status = "FAILED";
          execution.completedAt = now;
          execution.updatedAt = now;
          execution.errorDetails = {
            failedNodeId: execution.currentNodeId,
            message: "Approval timed out",
            timeoutPolicy: approval.timeoutPolicy || "REJECT",
          };
          this.db.executions.set(execution.id, execution);
        }
      }
    }
    return timedOutCount;
  }

  /**
   * Retries a failed execution safely from the failed step or a designated step.
   */
  public async retryFailedExecution(
    executionId: string,
    options?: { stepId?: string; reason?: string },
  ): Promise<WorkflowExecutionRecord> {
    const execution = this.db.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    if (execution.status !== "FAILED") {
      throw new Error(
        `Cannot retry execution in state '${execution.status}'. Only FAILED executions can be retried.`,
      );
    }

    const now = new Date();
    let targetNodeId = execution.currentNodeId;

    if (options?.stepId) {
      const step = this.db.steps.get(options.stepId);
      if (!step || step.executionId !== execution.id) {
        throw new Error(
          `Step ${options.stepId} not found for execution ${executionId}.`,
        );
      }
      targetNodeId = step.nodeId;
      step.status = "PENDING";
      step.errorMessage = undefined;
      step.attempt = (step.attempt || 1) + 1;
      this.db.steps.set(step.id, step);
    } else {
      const failedStep = Array.from(this.db.steps.values()).find(
        (s) => s.executionId === execution.id && s.status === "FAILED",
      );
      if (failedStep) {
        targetNodeId = failedStep.nodeId;
        failedStep.status = "PENDING";
        failedStep.errorMessage = undefined;
        failedStep.attempt = (failedStep.attempt || 1) + 1;
        this.db.steps.set(failedStep.id, failedStep);
      }
    }

    execution.currentNodeId = targetNodeId;
    execution.status = "QUEUED";
    execution.completedAt = undefined;
    execution.errorDetails = undefined;
    execution.retryCount = (execution.retryCount || 0) + 1;
    execution.updatedAt = now;
    this.db.executions.set(execution.id, execution);

    return this.processExecution(execution.id);
  }

  /**
   * Recovers and resumes all overdue delayed executions (e.g. after worker restart).
   */
  public async recoverOverdueDelays(now: Date = new Date()): Promise<number> {
    let resumedCount = 0;
    for (const delay of this.db.delays.values()) {
      if (
        delay.status === "PENDING" &&
        delay.resumeAt.getTime() <= now.getTime()
      ) {
        const execution = this.db.executions.get(delay.executionId);
        if (execution && execution.status === "WAITING_DELAY") {
          try {
            await this.resumeDelayedExecution(delay.executionId, { force: true });
            resumedCount++;
          } catch {
            // Continue on individual recovery error
          }
        }
      }
    }
    return resumedCount;
  }

  /**
   * Recovers executions left in RUNNING or RETRYING states upon worker start/restart.
   */
  public async recoverInterruptedExecutions(options?: {
    autoResume?: boolean;
  }): Promise<{
    recoveredCount: number;
    resumedCount: number;
    failedCount: number;
  }> {
    const autoResume = options?.autoResume ?? true;
    let recoveredCount = 0;
    let resumedCount = 0;
    let failedCount = 0;

    for (const execution of this.db.executions.values()) {
      if (execution.status === "RUNNING" || execution.status === "RETRYING") {
        recoveredCount++;

        // Reconcile any in-flight running steps
        const runningSteps = Array.from(this.db.steps.values()).filter(
          (s) => s.executionId === execution.id && s.status === "RUNNING",
        );

        for (const step of runningSteps) {
          step.status = "FAILED";
          step.errorMessage =
            "Worker process interrupted during step execution";
          step.completedAt = new Date();
          this.db.steps.set(step.id, step);
        }

        if (autoResume) {
          try {
            execution.status = "QUEUED";
            this.db.executions.set(execution.id, execution);
            await this.processExecution(execution.id);
            resumedCount++;
          } catch (err: any) {
            execution.status = "FAILED";
            execution.completedAt = new Date();
            execution.errorDetails = {
              message: `Recovery failed: ${err.message}`,
            };
            this.db.executions.set(execution.id, execution);
            failedCount++;
          }
        } else {
          execution.status = "FAILED";
          execution.completedAt = new Date();
          execution.errorDetails = {
            message: "Execution interrupted by worker shutdown/restart",
          };
          this.db.executions.set(execution.id, execution);
          failedCount++;
        }
      }
    }

    return { recoveredCount, resumedCount, failedCount };
  }

  /**
   * Executes a workflow execution until completion or suspension (approval/delay).
   */
  public async processExecution(
    executionId: string,
    signal?: AbortSignal,
  ): Promise<WorkflowExecutionRecord> {
    const execution = this.db.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    if (execution.status === "CANCELLED") {
      return execution;
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

    // Verify execution plan can be built
    try {
      buildExecutionPlan(definition);
    } catch (planErr: any) {
      execution.status = "FAILED";
      execution.completedAt = new Date();
      execution.errorDetails = {
        message: `Invalid workflow plan: ${planErr.message}`,
      };
      this.db.executions.set(execution.id, execution);
      return execution;
    }

    // Transition execution to RUNNING
    assertTransition(execution.status, "RUNNING");
    execution.status = "RUNNING";
    if (!execution.startedAt) {
      execution.startedAt = new Date();
    }
    execution.updatedAt = new Date();
    this.db.executions.set(execution.id, execution);

    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

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
      this.activeExecutions.delete(executionId);
      return execution;
    }

    const maxSteps = 100;
    let stepCount = 0;

    try {
      while (currentNode && stepCount < maxSteps) {
        // Check cancellation
        const fresh = this.db.executions.get(executionId);
        if (
          !fresh ||
          fresh.status === "CANCELLED" ||
          abortController.signal.aborted ||
          signal?.aborted
        ) {
          const finalExec = fresh || execution;
          finalExec.status = "CANCELLED";
          finalExec.completedAt = new Date();
          this.db.executions.set(executionId, finalExec);
          return finalExec;
        }

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

        const maxRetries =
          typeof currentNode.config?.maxRetries === "number"
            ? currentNode.config.maxRetries
            : 2;
        const retryBackoffMs =
          typeof currentNode.config?.retryBackoffMs === "number"
            ? currentNode.config.retryBackoffMs
            : 100;

        let stepSuccess = false;
        let stepResult: any = null;

        while (!stepSuccess) {
          // Check cancellation before each attempt
          const currentFresh = this.db.executions.get(executionId);
          if (
            !currentFresh ||
            currentFresh.status === "CANCELLED" ||
            abortController.signal.aborted ||
            signal?.aborted
          ) {
            stepRecord.status = "SKIPPED";
            stepRecord.errorMessage = "Execution was cancelled";
            stepRecord.completedAt = new Date();
            this.db.steps.set(stepId, stepRecord);
            return currentFresh || execution;
          }

          try {
            const handler = this.registry.get(currentNode.type);
            const context: ExecutionContext = {
              executionId: execution.id,
              organizationId: execution.organizationId,
              workflowId: execution.workflowId,
              workflowVersionId: execution.workflowVersionId,
              trigger: {
                type: execution.triggerType,
                payload: execution.triggerPayload || {},
              },
              steps: (execution.contextData.steps as any) || {},
              env: {},
              ...execution.contextData,
            };

            const result = await handler(currentNode, context);

            if (result.status === "FAILED") {
              const isNonRetryable = result.retryable === false;
              throw Object.assign(new Error(result.error || "Step failed"), {
                isNonRetryable,
              });
            }

            stepResult = result;
            stepSuccess = true;
          } catch (err: any) {
            const isNonRetryable =
              err.isNonRetryable === true ||
              err.code === "NON_RETRYABLE" ||
              err.name === "ValidationError";

            if (!isNonRetryable && stepRecord.attempt <= maxRetries) {
              stepRecord.attempt++;
              execution.retryCount = (execution.retryCount || 0) + 1;
              execution.status = "RETRYING";
              execution.updatedAt = new Date();
              this.db.executions.set(execution.id, execution);
              this.db.steps.set(stepId, stepRecord);

              const backoff = Math.min(
                retryBackoffMs * Math.pow(2, stepRecord.attempt - 2),
                2000,
              );
              await new Promise((res) => setTimeout(res, backoff));

              execution.status = "RUNNING";
              execution.updatedAt = new Date();
              this.db.executions.set(execution.id, execution);
              continue;
            }

            // Retries exhausted or non-retryable error
            stepRecord.status = "FAILED";
            stepRecord.errorMessage = err.message;
            stepRecord.completedAt = new Date();
            this.db.steps.set(stepId, stepRecord);

            execution.status = "FAILED";
            execution.completedAt = new Date();
            execution.errorDetails = {
              failedNodeId: currentNode.id,
              message: err.message,
              attempts: stepRecord.attempt,
            };
            execution.updatedAt = new Date();
            this.db.executions.set(execution.id, execution);
            this.activeExecutions.delete(executionId);

            publishDomainEvent(this.db, {
              type: "workflow.execution.failed",
              organizationId: execution.organizationId,
              resourceType: "execution",
              resourceId: execution.id,
              actorId: (execution.contextData?.userId as string) || undefined,
              data: {
                workflowId: execution.workflowId,
                executionId: execution.id,
                error: err.message,
              },
            });

            return execution;
          }
        }

        // Handle Waiting State (Approval or Delay)
        if (stepResult.status === "WAITING") {
          if (stepResult.waitReason === "APPROVAL") {
            stepRecord.status = "WAITING";
            this.db.steps.set(stepId, stepRecord);

            // Create Approval record
            const timeoutSeconds =
              (stepResult.waitPayload?.timeoutSeconds as number) ?? 86400;
            const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
            const approvalId = `appr_${crypto.randomUUID()}`;
            const approval: ApprovalRecord = {
              id: approvalId,
              organizationId: execution.organizationId,
              executionId: execution.id,
              stepId: stepRecord.id,
              title:
                (stepResult.waitPayload?.title as string) || currentNode.name,
              description: stepResult.waitPayload?.description as string,
              requiredRole:
                (stepResult.waitPayload?.requiredRole as any) || "ADMIN",
              status: "PENDING",
              assignedUserId: stepResult.waitPayload?.assignedUserId as string,
              expiresAt,
              timeoutPolicy:
                (stepResult.waitPayload?.timeoutPolicy as any) || "REJECT",
              createdAt: new Date(),
            };
            this.db.approvals.set(approvalId, approval);

            execution.status = "WAITING_APPROVAL";
            execution.updatedAt = new Date();
            this.db.executions.set(execution.id, execution);
            this.activeExecutions.delete(executionId);

            publishDomainEvent(this.db, {
              type: "approval.requested",
              organizationId: execution.organizationId,
              resourceType: "approval",
              resourceId: approvalId,
              actorId: (execution.contextData?.userId as string) || undefined,
              data: {
                approvalId,
                executionId: execution.id,
                title: approval.title,
                assignedUserId: approval.assignedUserId,
              },
            });

            return execution;
          }

          if (stepResult.waitReason === "DELAY") {
            const durationSeconds =
              (stepResult.waitPayload?.durationSeconds as number) ?? 60;
            const resumeAt = new Date(Date.now() + durationSeconds * 1000);

            stepRecord.status = "WAITING";
            stepRecord.outputPayload = {
              durationSeconds,
              resumeAt: resumeAt.toISOString(),
            };
            this.db.steps.set(stepId, stepRecord);

            const delayId = `del_${crypto.randomUUID()}`;
            const delayRecord: DelayRecord = {
              id: delayId,
              executionId: execution.id,
              stepId: stepRecord.id,
              resumeAt,
              status: "PENDING",
              createdAt: new Date(),
            };
            this.db.delays.set(delayId, delayRecord);

            execution.status = "WAITING_DELAY";
            execution.contextData = {
              ...execution.contextData,
              delayInfo: {
                delayId,
                stepId: stepRecord.id,
                durationSeconds,
                resumeAt: resumeAt.toISOString(),
              },
            };
            execution.updatedAt = new Date();
            this.db.executions.set(execution.id, execution);
            this.activeExecutions.delete(executionId);
            return execution;
          }
        }

        // Step completed successfully
        stepRecord.status = "COMPLETED";
        stepRecord.outputPayload = stepResult.output;
        stepRecord.completedAt = new Date();
        this.db.steps.set(stepId, stepRecord);

        // Update context data
        execution.contextData = {
          ...execution.contextData,
          steps: {
            ...((execution.contextData.steps as any) || {}),
            [currentNode.id]: {
              output: stepResult.output,
              status: "COMPLETED",
            },
          },
        };

        // Resolve next step in graph
        const plan = resolveNextNodes(definition, currentNode.id, stepResult);

        if (
          plan.isComplete ||
          currentNode.type === "END" ||
          plan.nextNodes.length === 0
        ) {
          execution.status = "SUCCEEDED";
          execution.completedAt = new Date();
          execution.updatedAt = new Date();
          this.db.executions.set(execution.id, execution);
          this.activeExecutions.delete(executionId);

          publishDomainEvent(this.db, {
            type: "workflow.execution.completed",
            organizationId: execution.organizationId,
            resourceType: "execution",
            resourceId: execution.id,
            actorId: (execution.contextData?.userId as string) || undefined,
            data: {
              workflowId: execution.workflowId,
              executionId: execution.id,
            },
          });

          return execution;
        }

        // Move to next node
        currentNode = plan.nextNodes[0];
      }

      if (stepCount >= maxSteps) {
        execution.status = "FAILED";
        execution.completedAt = new Date();
        execution.errorDetails = {
          message: "Max workflow execution step limit reached (100).",
        };
        this.db.executions.set(execution.id, execution);

        publishDomainEvent(this.db, {
          type: "workflow.execution.failed",
          organizationId: execution.organizationId,
          resourceType: "execution",
          resourceId: execution.id,
          actorId: (execution.contextData?.userId as string) || undefined,
          data: {
            workflowId: execution.workflowId,
            executionId: execution.id,
            error: "Max workflow execution step limit reached (100).",
          },
        });
      }
    } finally {
      this.activeExecutions.delete(executionId);
    }

    return execution;
  }
}
