import { NodeType, WorkflowNode } from "@flowforge/shared";
import { EvaluationContext, evaluateCondition } from "./expression.js";
import { ExecutionContext } from "./types.js";

export interface StepExecutionResult {
  status: "COMPLETED" | "WAITING" | "FAILED";
  output?: Record<string, unknown>;
  selectedHandle?: string;
  waitReason?: "APPROVAL" | "DELAY";
  waitPayload?: Record<string, unknown>;
  error?: string;
  retryable?: boolean;
}

export type NodeHandler = (
  node: WorkflowNode,
  context: ExecutionContext,
) => Promise<StepExecutionResult> | StepExecutionResult;

export interface NodeMetadata {
  type: NodeType;
  label: string;
  isTrigger: boolean;
  isTerminal: boolean;
  isBranching: boolean;
  isExecutable: boolean;
  inputs: number;
  outputs: number | "branching";
}

export class NodeHandlerRegistry {
  private handlers = new Map<NodeType, NodeHandler>();
  private metadata = new Map<NodeType, NodeMetadata>();

  constructor() {
    this.registerDefaults();
  }

  public register(
    type: NodeType,
    handler: NodeHandler,
    meta?: Partial<NodeMetadata>,
  ): void {
    this.handlers.set(type, handler);
    if (meta) {
      const fullMeta: NodeMetadata = {
        type,
        label: meta.label || type,
        isTrigger: meta.isTrigger ?? (type === "TRIGGER"),
        isTerminal: meta.isTerminal ?? (type === "END"),
        isBranching: meta.isBranching ?? (type === "CONDITION"),
        isExecutable: meta.isExecutable ?? true,
        inputs: meta.inputs ?? (type === "TRIGGER" ? 0 : 1),
        outputs:
          meta.outputs ??
          (type === "END" ? 0 : type === "CONDITION" ? "branching" : 1),
      };
      this.metadata.set(type, fullMeta);
    }
  }

  public get(type: NodeType): NodeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No execution handler registered for node type: ${type}`);
    }
    return handler;
  }

  public getMetadata(type: NodeType): NodeMetadata | undefined {
    return this.metadata.get(type);
  }

  public listSupportedTypes(): NodeType[] {
    return Array.from(this.handlers.keys());
  }

  private registerDefaults(): void {
    // 1. TRIGGER
    this.register(
      "TRIGGER",
      (node, context) => {
        return {
          status: "COMPLETED",
          output: context.trigger?.payload || {},
        };
      },
      { label: "Trigger Event", isTrigger: true, inputs: 0, outputs: 1 },
    );

    // 2. CONDITION
    this.register(
      "CONDITION",
      (node, context) => {
        const expr = (node.config.expression as string) || "";
        const result = evaluateCondition(expr, context as EvaluationContext);
        return {
          status: "COMPLETED",
          output: { result, evaluatedExpression: expr },
          selectedHandle: result ? "true" : "false",
        };
      },
      {
        label: "Condition Rule",
        isBranching: true,
        inputs: 1,
        outputs: "branching",
      },
    );

    // 3. HTTP_REQUEST
    this.register(
      "HTTP_REQUEST",
      (node) => {
        return {
          status: "COMPLETED",
          output: {
            dispatched: true,
            method: node.config.method || "GET",
            url: node.config.url,
          },
        };
      },
      { label: "HTTP Request", inputs: 1, outputs: 1 },
    );

    // 4. EMAIL
    this.register(
      "EMAIL",
      (node) => {
        return {
          status: "COMPLETED",
          output: {
            queued: true,
            to: node.config.to,
            subject: node.config.subject,
          },
        };
      },
      { label: "Email Notification", inputs: 1, outputs: 1 },
    );

    // 5. APPROVAL
    this.register(
      "APPROVAL",
      (node, context) => {
        const decision = context.approvalDecision;
        if (decision && decision.approved !== undefined) {
          if (decision.approved) {
            return {
              status: "COMPLETED",
              output: {
                approved: true,
                comment: decision.comment,
                decidedBy: decision.decidedBy,
              },
            };
          } else {
            return {
              status: "FAILED",
              error: decision.comment || "Approval rejected",
            };
          }
        }

        return {
          status: "WAITING",
          waitReason: "APPROVAL",
          waitPayload: {
            title: node.config.title || node.name,
            description: node.config.description,
            requiredRole: node.config.requiredRole || "ADMIN",
            timeoutSeconds: node.config.timeoutSeconds || 86400,
          },
        };
      },
      { label: "Human Approval", inputs: 1, outputs: 1 },
    );

    // 6. DELAY
    this.register(
      "DELAY",
      (node) => {
        return {
          status: "WAITING",
          waitReason: "DELAY",
          waitPayload: {
            durationSeconds: node.config.durationSeconds || 60,
          },
        };
      },
      { label: "Delay Timer", inputs: 1, outputs: 1 },
    );

    // 7. END
    this.register(
      "END",
      (node) => {
        return {
          status: "COMPLETED",
          output: {
            completedAt: new Date().toISOString(),
            summary: node.config.summaryExpression,
          },
        };
      },
      { label: "End Terminal", isTerminal: true, inputs: 1, outputs: 0 },
    );
  }
}

export const defaultRegistry = new NodeHandlerRegistry();
