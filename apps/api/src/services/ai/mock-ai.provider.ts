import crypto from "crypto";
import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  AiGeneratedWorkflowResult,
  AiEditedWorkflowResult,
  AiWorkflowExplanation,
  AiFailureAnalysis,
  AiExpressionAssistance,
} from "@flowforge/shared";
import {
  validateWorkflowDefinition,
  compareWorkflowDefinitions,
  evaluateCondition,
} from "@flowforge/workflow-engine";
import {
  WorkflowExecutionRecord,
  ExecutionStepRecord,
} from "@flowforge/test-utils";
import {
  AIProvider,
  WorkflowGenerationContext,
  WorkflowEditContext,
  ExpressionAssistContext,
} from "./ai.interface.js";

export class MockAIProvider implements AIProvider {
  public readonly providerId = "MOCK";
  public readonly model = "flowforge-copilot-mock-v1";
  private simulateFailure = false;

  public setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  public async generateWorkflowDraft(
    prompt: string,
    context?: WorkflowGenerationContext,
  ): Promise<AiGeneratedWorkflowResult> {
    if (this.simulateFailure) {
      throw new Error(
        "AI provider is temporarily unavailable (simulated outage)",
      );
    }

    const lowerPrompt = prompt.toLowerCase();
    let definition: WorkflowDefinition;
    let explanation: string;

    if (
      lowerPrompt.includes("invoice") ||
      lowerPrompt.includes("expense") ||
      lowerPrompt.includes("procurement") ||
      lowerPrompt.includes("approval") ||
      lowerPrompt.includes("budget")
    ) {
      definition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Invoice Webhook Trigger",
            config: { triggerType: "WEBHOOK", webhookPath: "/invoices" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_condition",
            type: "CONDITION",
            name: "Check Amount > $1000",
            config: { expression: "trigger.amount > 1000" },
            position: { x: 100, y: 160 },
          },
          {
            id: "node_approval",
            type: "APPROVAL",
            name: "Manager Approval",
            config: {
              title: "High Value Invoice Approval",
              requiredRole: "ADMIN",
              timeoutSeconds: 86400,
            },
            position: { x: 260, y: 280 },
          },
          {
            id: "node_email",
            type: "EMAIL",
            name: "Send Confirmation Email",
            config: {
              to: "finance@example.com",
              subject: "Invoice Approved",
              template:
                "Invoice {{trigger.invoiceId}} for ${{trigger.amount}} has been approved.",
            },
            position: { x: 100, y: 400 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Process Complete",
            config: {},
            position: { x: 100, y: 520 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_condition" },
          {
            id: "e2_true",
            source: "node_condition",
            sourceHandle: "true",
            target: "node_approval",
          },
          {
            id: "e2_false",
            source: "node_condition",
            sourceHandle: "false",
            target: "node_email",
          },
          { id: "e3", source: "node_approval", target: "node_email" },
          { id: "e4", source: "node_email", target: "node_end" },
        ],
      };
      explanation =
        "Generated an invoice processing automation that ingests webhooks, checks if invoice amount exceeds $1000, routes to manager approval for high values, and notifies finance via email before completing.";
    } else if (
      lowerPrompt.includes("support") ||
      lowerPrompt.includes("ticket") ||
      lowerPrompt.includes("customer") ||
      lowerPrompt.includes("zendesk") ||
      lowerPrompt.includes("slack")
    ) {
      definition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "New Ticket Webhook",
            config: { triggerType: "WEBHOOK", webhookPath: "/tickets" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_condition",
            type: "CONDITION",
            name: "Is Urgent Priority",
            config: { expression: "trigger.priority == 'URGENT'" },
            position: { x: 100, y: 160 },
          },
          {
            id: "node_connector",
            type: "CONNECTOR_ACTION",
            name: "Post Urgent Alert to Slack",
            config: {
              connectorId: "slack",
              operationId: "send_message",
              parameters: { channel: "#urgent-support" },
            },
            position: { x: 260, y: 280 },
          },
          {
            id: "node_http",
            type: "HTTP_REQUEST",
            name: "Update CRM Record",
            config: {
              url: "https://api.crm.internal/tickets/sync",
              method: "POST",
              headers: { "Content-Type": "application/json" },
            },
            position: { x: 100, y: 400 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Ticket Triage Complete",
            config: {},
            position: { x: 100, y: 520 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_condition" },
          {
            id: "e2_true",
            source: "node_condition",
            sourceHandle: "true",
            target: "node_connector",
          },
          {
            id: "e2_false",
            source: "node_condition",
            sourceHandle: "false",
            target: "node_http",
          },
          { id: "e3", source: "node_connector", target: "node_http" },
          { id: "e4", source: "node_http", target: "node_end" },
        ],
      };
      explanation =
        "Generated a customer support triage workflow that captures new tickets, alerts Slack on urgent issues, updates CRM records, and concludes.";
    } else if (
      lowerPrompt.includes("alert") ||
      lowerPrompt.includes("incident") ||
      lowerPrompt.includes("ops") ||
      lowerPrompt.includes("monitor")
    ) {
      definition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: "Incident Alert Webhook",
            config: { triggerType: "WEBHOOK", webhookPath: "/alerts" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_http",
            type: "HTTP_REQUEST",
            name: "Dispatch PagerDuty Incident",
            config: {
              url: "https://api.pagerduty.com/v2/enqueue",
              method: "POST",
              headers: { "Content-Type": "application/json" },
            },
            position: { x: 100, y: 180 },
          },
          {
            id: "node_email",
            type: "EMAIL",
            name: "Notify On-Call Engineering",
            config: {
              to: "oncall@company.com",
              subject: "Incident Alert: {{trigger.title}}",
              template:
                "Severity: {{trigger.severity}}\nDetails: {{trigger.message}}",
            },
            position: { x: 100, y: 320 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Incident Dispatched",
            config: {},
            position: { x: 100, y: 460 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_http" },
          { id: "e2", source: "node_http", target: "node_email" },
          { id: "e3", source: "node_email", target: "node_end" },
        ],
      };
      explanation =
        "Generated an incident alerting workflow that ingests monitoring webhooks, enqueues an external pager alert, and emails the on-call team.";
    } else {
      // General default workflow
      definition = {
        nodes: [
          {
            id: "node_trigger",
            type: "TRIGGER",
            name: context?.targetName || "Automated Trigger",
            config: { triggerType: "MANUAL" },
            position: { x: 100, y: 50 },
          },
          {
            id: "node_http",
            type: "HTTP_REQUEST",
            name: "Process Payload Data",
            config: {
              url: "https://api.service.internal/process",
              method: "POST",
              headers: { "Content-Type": "application/json" },
            },
            position: { x: 100, y: 180 },
          },
          {
            id: "node_end",
            type: "END",
            name: "Workflow Completed",
            config: {},
            position: { x: 100, y: 320 },
          },
        ],
        edges: [
          { id: "e1", source: "node_trigger", target: "node_http" },
          { id: "e2", source: "node_http", target: "node_end" },
        ],
      };
      explanation =
        "Generated a clean baseline automation connecting a manual trigger to an HTTP processing step and clean termination.";
    }

    // Validate with canonical engine validator
    const validation = validateWorkflowDefinition(definition);
    const valid = validation.isValid;
    const validationErrors = (validation.errors || []).map((e) => e.message);

    return {
      definition,
      valid,
      validationErrors,
      explanation,
      tokensUsed: Math.min(250, 50 + prompt.length * 2),
      isUntrustedDraft: true,
    };
  }

  public async editWorkflowDraft(
    instruction: string,
    currentDefinition: WorkflowDefinition,
    context?: WorkflowEditContext,
  ): Promise<AiEditedWorkflowResult> {
    if (this.simulateFailure) {
      throw new Error(
        "AI provider is temporarily unavailable (simulated outage)",
      );
    }

    const lower = instruction.toLowerCase();
    const clonedDef: WorkflowDefinition = JSON.parse(
      JSON.stringify(currentDefinition),
    );
    const nodes = clonedDef.nodes || [];
    const edges = clonedDef.edges || [];

    let explanation = `Applied requested modification: "${instruction}"`;

    if (lower.includes("email") || lower.includes("notify")) {
      // Insert an email node before the END node
      const endNode =
        nodes.find((n) => n.type === "END") || nodes[nodes.length - 1];
      const newNodeId = `node_email_${crypto.randomUUID().slice(0, 8)}`;
      const newEmailNode: WorkflowNode = {
        id: newNodeId,
        type: "EMAIL",
        name: "Notification Email Step",
        config: {
          to: "alerts@example.com",
          subject: "Workflow Status Update",
          template:
            "Workflow update notification triggered by AI copilot edit.",
        },
        position: {
          x: endNode?.position?.x ?? 100,
          y: (endNode?.position?.y ?? 300) - 60,
        },
      };

      // Reroute edges that point to endNode to point to newEmailNode instead
      const incomingToEnd = edges.filter((e) => e.target === endNode.id);
      for (const inEdge of incomingToEnd) {
        inEdge.target = newNodeId;
      }
      // Add edge from newEmailNode to endNode
      edges.push({
        id: `e_${crypto.randomUUID().slice(0, 8)}`,
        source: newNodeId,
        target: endNode.id,
      });

      nodes.push(newEmailNode);
      explanation =
        "Added an email notification step prior to workflow completion.";
    } else if (lower.includes("approval")) {
      // Insert an approval node
      const triggerNode = nodes.find((n) => n.type === "TRIGGER") || nodes[0];
      const newNodeId = `node_approval_${crypto.randomUUID().slice(0, 8)}`;
      const newApprovalNode: WorkflowNode = {
        id: newNodeId,
        type: "APPROVAL",
        name: "Manager Approval Gate",
        config: {
          title: "Copilot Added Approval Step",
          requiredRole: "ADMIN",
          timeoutSeconds: 43200,
        },
        position: {
          x: (triggerNode?.position?.x ?? 100) + 120,
          y: (triggerNode?.position?.y ?? 50) + 100,
        },
      };

      // Find an edge from trigger and splice
      const edgeFromTrigger = edges.find((e) => e.source === triggerNode.id);
      if (edgeFromTrigger) {
        const originalTarget = edgeFromTrigger.target;
        edgeFromTrigger.target = newNodeId;
        edges.push({
          id: `e_${crypto.randomUUID().slice(0, 8)}`,
          source: newNodeId,
          target: originalTarget,
        });
      }

      nodes.push(newApprovalNode);
      explanation =
        "Inserted an administrative approval gate into the workflow execution path.";
    } else if (lower.includes("delay") || lower.includes("wait")) {
      // Insert a delay node
      const endNode =
        nodes.find((n) => n.type === "END") || nodes[nodes.length - 1];
      const newNodeId = `node_delay_${crypto.randomUUID().slice(0, 8)}`;
      const newDelayNode: WorkflowNode = {
        id: newNodeId,
        type: "DELAY",
        name: "Wait 15 Minutes",
        config: {
          delaySeconds: 900,
        },
        position: {
          x: endNode?.position?.x ?? 100,
          y: (endNode?.position?.y ?? 300) - 70,
        },
      };

      const inEdges = edges.filter((e) => e.target === endNode.id);
      for (const edge of inEdges) {
        edge.target = newNodeId;
      }
      edges.push({
        id: `e_${crypto.randomUUID().slice(0, 8)}`,
        source: newNodeId,
        target: endNode.id,
      });

      nodes.push(newDelayNode);
      explanation = "Added a 15-minute execution delay before final steps.";
    } else if (lower.includes("rename") || lower.includes("name")) {
      // Rename first non-trigger node or trigger
      const targetNode = nodes.find((n) => n.type !== "TRIGGER") || nodes[0];
      if (targetNode) {
        const oldName = targetNode.name;
        targetNode.name = `${oldName} (Renamed by AI)`;
        explanation = `Renamed node '${oldName}' to '${targetNode.name}'.`;
      }
    } else {
      // General edit: add tag/description in config
      if (nodes.length > 0) {
        nodes[0].config = {
          ...nodes[0].config,
          aiNote: `Updated via copilot: ${instruction}`,
        };
        explanation =
          "Updated workflow configuration with custom prompt metadata.";
      }
    }

    // Canonical validation
    const validation = validateWorkflowDefinition(clonedDef);
    const valid = validation.isValid;
    const validationErrors = (validation.errors || []).map((e) => e.message);

    // Deep comparison diff
    const comparison = compareWorkflowDefinitions(currentDefinition, clonedDef);

    return {
      definition: clonedDef,
      valid,
      validationErrors,
      diff: {
        addedNodes: comparison.addedNodes,
        removedNodes: comparison.removedNodes,
        modifiedNodes: comparison.modifiedNodes,
        addedEdges: comparison.addedEdges,
        removedEdges: comparison.removedEdges,
        summary: comparison.summary,
      },
      explanation,
      tokensUsed: Math.min(300, 80 + instruction.length * 2),
      isUntrustedDraft: true,
    };
  }

  public async explainWorkflow(
    definition: WorkflowDefinition,
  ): Promise<AiWorkflowExplanation> {
    if (this.simulateFailure) {
      throw new Error(
        "AI provider is temporarily unavailable (simulated outage)",
      );
    }

    const nodes = definition.nodes || [];
    const triggerNode = nodes.find((n) => n.type === "TRIGGER");
    const triggerDesc = triggerNode
      ? `Triggered by ${triggerNode.name} (${String(triggerNode.config?.triggerType || "EVENT")})`
      : "No trigger node configured";

    const branches = nodes
      .filter((n) => n.type === "CONDITION")
      .map((n) => ({
        nodeId: n.id,
        condition: String(n.config?.expression || "true"),
        description: `Evaluates conditional logic: ${n.config?.expression || n.name}`,
      }));

    const externalIntegrations = nodes
      .filter((n) => n.type === "HTTP_REQUEST" || n.type === "CONNECTOR_ACTION")
      .map((n) => ({
        nodeId: n.id,
        type: n.type,
        summary:
          n.type === "HTTP_REQUEST"
            ? `Outbound HTTP ${String(n.config?.method || "GET")} to ${String(n.config?.url || "external endpoint")}`
            : `Connector Action: ${String(n.config?.connectorId || "external")} / ${String(n.config?.action || "action")}`,
      }));

    const approvals = nodes
      .filter((n) => n.type === "APPROVAL")
      .map((n) => ({
        nodeId: n.id,
        assignedRole: String(n.config?.requiredRole || "ADMIN"),
        description: `Requires approval: ${n.name}`,
      }));

    const riskAnalysis: Array<{
      level: "LOW" | "MEDIUM" | "HIGH";
      description: string;
    }> = [];

    if (externalIntegrations.length > 0) {
      riskAnalysis.push({
        level: "MEDIUM",
        description: `Workflow performs ${externalIntegrations.length} outbound network calls to external destinations.`,
      });
    }

    if (approvals.length === 0 && externalIntegrations.length > 2) {
      riskAnalysis.push({
        level: "HIGH",
        description:
          "Multiple external mutations execute without human-in-the-loop approval gates.",
      });
    } else {
      riskAnalysis.push({
        level: "LOW",
        description:
          "Standard workflow execution path with structured error boundaries.",
      });
    }

    return {
      summary: `Automated workflow containing ${nodes.length} nodes and ${(definition.edges || []).length} transitions.`,
      triggerDescription: triggerDesc,
      branches,
      externalIntegrations,
      approvals,
      riskAnalysis,
    };
  }

  public async analyzeExecutionFailure(
    execution: WorkflowExecutionRecord,
    stepLogs: ExecutionStepRecord[],
  ): Promise<AiFailureAnalysis> {
    if (this.simulateFailure) {
      throw new Error(
        "AI provider is temporarily unavailable (simulated outage)",
      );
    }

    // Read-only analysis
    const failedStep =
      stepLogs.find((s) => s.status === "FAILED") ||
      stepLogs[stepLogs.length - 1];

    const errMessage = (
      failedStep?.errorMessage ||
      (execution.errorDetails
        ? JSON.stringify(execution.errorDetails)
        : "Execution failed with non-zero exit")
    ).toLowerCase();

    let category: AiFailureAnalysis["failureCategory"] = "UNKNOWN";
    const suggestedFixes: string[] = [];
    const evidence: string[] = [];

    if (errMessage.includes("timeout") || errMessage.includes("etimedout")) {
      category = "TIMEOUT";
      suggestedFixes.push("Increase node timeoutSeconds in step configuration");
      suggestedFixes.push(
        "Check destination host availability and network latency",
      );
    } else if (
      errMessage.includes("401") ||
      errMessage.includes("403") ||
      errMessage.includes("auth") ||
      errMessage.includes("unauthorized")
    ) {
      category = "CONNECTOR_AUTH_ERROR";
      suggestedFixes.push("Refresh or re-authenticate connection credentials");
      suggestedFixes.push(
        "Verify granted OAuth scopes on destination provider",
      );
    } else if (
      errMessage.includes("404") ||
      errMessage.includes("500") ||
      errMessage.includes("502") ||
      errMessage.includes("503") ||
      errMessage.includes("http")
    ) {
      category = "HTTP_ERROR";
      suggestedFixes.push("Verify external endpoint URL and route parameters");
      suggestedFixes.push(
        "Inspect request body schema for compatibility with target API",
      );
    } else if (
      errMessage.includes("syntax") ||
      errMessage.includes("expression") ||
      errMessage.includes("undefined")
    ) {
      category = "EXPRESSION_ERROR";
      suggestedFixes.push(
        "Validate syntax in condition expression or template substitution",
      );
      suggestedFixes.push(
        "Ensure upstream payload contains expected attributes before referencing",
      );
    } else if (
      errMessage.includes("validation") ||
      errMessage.includes("schema") ||
      errMessage.includes("invalid")
    ) {
      category = "VALIDATION_ERROR";
      suggestedFixes.push(
        "Review node input schema rules against runtime payload",
      );
    } else {
      category = "SCRIPT_ERROR";
      suggestedFixes.push(
        "Review node execution logs and retry payload format",
      );
    }

    if (failedStep) {
      evidence.push(
        `Step '${failedStep.nodeName}' (${failedStep.nodeId}) failed at attempt ${failedStep.attempt}`,
      );
      if (failedStep.errorMessage) {
        evidence.push(`Error message: ${failedStep.errorMessage}`);
      }
    }
    evidence.push(`Execution ID: ${execution.id}`);
    evidence.push(`Execution Status: ${execution.status}`);

    const rootCause = `Node '${failedStep?.nodeName || "unknown"}' failed during execution: ${failedStep?.errorMessage || "unhandled error"}`;

    return {
      executionId: execution.id,
      failedNodeId: failedStep?.nodeId,
      failureCategory: category,
      rootCause,
      evidence,
      suggestedFixes,
      tokensUsed: 120,
    };
  }

  public async assistExpression(
    goal: string,
    context?: ExpressionAssistContext,
  ): Promise<AiExpressionAssistance> {
    if (this.simulateFailure) {
      throw new Error(
        "AI provider is temporarily unavailable (simulated outage)",
      );
    }

    const lower = goal.toLowerCase();
    let expression: string;
    let explanation: string;

    if (
      lower.includes("amount") ||
      lower.includes("price") ||
      lower.includes("cost") ||
      lower.includes("value")
    ) {
      expression = "trigger.payload.amount > 1000";
      explanation =
        "Evaluates whether the trigger payload amount exceeds numeric threshold 1000.";
    } else if (lower.includes("status") || lower.includes("state")) {
      expression = "trigger.payload.status == 'APPROVED'";
      explanation =
        "Compares trigger status against expected string literal 'APPROVED'.";
    } else if (lower.includes("email") || lower.includes("domain")) {
      expression = "trigger.payload.email != ''";
      explanation =
        "Checks that an email address exists in the trigger context.";
    } else {
      expression = "trigger.payload.enabled == true";
      explanation =
        "Safely checks boolean flag on the incoming workflow payload.";
    }

    // Validate syntax using evaluateCondition test on sample object
    let isValid = true;
    let syntaxValidationMessage: string | undefined;
    let exampleEvaluation: unknown = true;

    try {
      exampleEvaluation = evaluateCondition(expression, {
        trigger: {
          payload: {
            amount: 1500,
            status: "APPROVED",
            email: "user@example.com",
            enabled: true,
          },
        },
      });
    } catch (err: any) {
      isValid = false;
      syntaxValidationMessage = err?.message || "Invalid expression syntax";
      exampleEvaluation = null;
    }

    return {
      expression,
      explanation,
      isValid,
      syntaxValidationMessage,
      exampleEvaluation,
    };
  }

  public async testConnectivity(): Promise<{
    success: boolean;
    latencyMs: number;
    message?: string;
  }> {
    if (this.simulateFailure) {
      return {
        success: false,
        latencyMs: 120,
        message: "Failed to connect to AI provider (simulated network error)",
      };
    }

    return {
      success: true,
      latencyMs: 14,
      message: "Mock AI provider connected and operational.",
    };
  }
}
