import { NodeType, WorkflowNode } from "@flowforge/shared";
import { EvaluationContext, evaluateCondition } from "./expression.js";

export interface StepExecutionResult {
  status: "COMPLETED" | "WAITING" | "FAILED";
  output?: Record<string, unknown>;
  selectedHandle?: string;
  waitReason?: "APPROVAL" | "DELAY";
  waitPayload?: Record<string, unknown>;
  error?: string;
}

export type NodeHandler = (
  node: WorkflowNode,
  context: EvaluationContext,
) => Promise<StepExecutionResult> | StepExecutionResult;

export class NodeHandlerRegistry {
  private handlers = new Map<NodeType, NodeHandler>();

  constructor() {
    this.registerDefaults();
  }

  public register(type: NodeType, handler: NodeHandler): void {
    this.handlers.set(type, handler);
  }

  public get(type: NodeType): NodeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No execution handler registered for node type: ${type}`);
    }
    return handler;
  }

  private registerDefaults(): void {
    // 1. TRIGGER
    this.register("TRIGGER", (node, context) => {
      return {
        status: "COMPLETED",
        output: context.trigger?.payload || {},
      };
    });

    // 2. CONDITION
    this.register("CONDITION", (node, context) => {
      const expr = (node.config.expression as string) || "";
      const result = evaluateCondition(expr, context);
      return {
        status: "COMPLETED",
        output: { result, evaluatedExpression: expr },
        selectedHandle: result ? "true" : "false",
      };
    });

    // 3. APPROVAL (Human-in-the-loop: pauses execution unless decision already recorded)
    this.register("APPROVAL", (node, context) => {
      const decision = context.approvalDecision as any;
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
    });

    // 4. DELAY (Pauses execution for a configured duration)
    this.register("DELAY", (node) => {
      return {
        status: "WAITING",
        waitReason: "DELAY",
        waitPayload: {
          durationSeconds: node.config.durationSeconds || 60,
        },
      };
    });

    // 5. END
    this.register("END", (node, context) => {
      return {
        status: "COMPLETED",
        output: {
          completedAt: new Date().toISOString(),
          summary: node.config.summaryExpression,
        },
      };
    });
  }
}

export const defaultRegistry = new NodeHandlerRegistry();
