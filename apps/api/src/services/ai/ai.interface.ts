import {
  WorkflowDefinition,
  AiGeneratedWorkflowResult,
  AiEditedWorkflowResult,
  AiWorkflowExplanation,
  AiFailureAnalysis,
  AiExpressionAssistance,
} from "@flowforge/shared";
import {
  WorkflowExecutionRecord,
  ExecutionStepRecord,
} from "@flowforge/test-utils";

export interface WorkflowGenerationContext {
  organizationId: string;
  workspaceId?: string;
  targetName?: string;
  availableConnectors?: string[];
}

export interface WorkflowEditContext {
  organizationId: string;
  workspaceId?: string;
  baseHash?: string;
}

export interface ExpressionAssistContext {
  organizationId: string;
  sourceSchema?: Record<string, unknown>;
  targetField?: string;
}

export interface AIProvider {
  readonly providerId: string;
  readonly model: string;

  /**
   * Generates a draft workflow from natural-language instructions.
   */
  generateWorkflowDraft(
    prompt: string,
    context?: WorkflowGenerationContext,
  ): Promise<AiGeneratedWorkflowResult>;

  /**
   * Modifies an existing workflow definition conversationally.
   */
  editWorkflowDraft(
    instruction: string,
    currentDefinition: WorkflowDefinition,
    context?: WorkflowEditContext,
  ): Promise<AiEditedWorkflowResult>;

  /**
   * Explains a workflow's topology, triggers, branches, connectors, and risks.
   */
  explainWorkflow(
    definition: WorkflowDefinition,
  ): Promise<AiWorkflowExplanation>;

  /**
   * Analyzes an execution failure in a strictly read-only manner.
   */
  analyzeExecutionFailure(
    execution: WorkflowExecutionRecord,
    stepLogs: ExecutionStepRecord[],
  ): Promise<AiFailureAnalysis>;

  /**
   * Suggests and validates safe workflow expressions without arbitrary code execution.
   */
  assistExpression(
    goal: string,
    context?: ExpressionAssistContext,
  ): Promise<AiExpressionAssistance>;

  /**
   * Tests provider connectivity, returning latency and status.
   */
  testConnectivity(): Promise<{
    success: boolean;
    latencyMs: number;
    message?: string;
  }>;
}
