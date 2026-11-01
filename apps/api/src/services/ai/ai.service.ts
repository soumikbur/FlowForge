import crypto from "crypto";
import {
  AiConfigurationRecord,
  UpdateAiConfigRequest,
  GenerateWorkflowRequest,
  EditWorkflowRequest,
  ExplainWorkflowRequest,
  AssistExpressionRequest,
  AiGeneratedWorkflowResult,
  AiEditedWorkflowResult,
  AiWorkflowExplanation,
  AiFailureAnalysis,
  AiExpressionAssistance,
  Role,
} from "@flowforge/shared";
import {
  validateWorkflowDefinition,
  computeWorkflowContentHash,
  compareWorkflowDefinitions,
} from "@flowforge/workflow-engine";
import { apiStore } from "../../store.js";
import { entitlementService } from "../entitlement.service.js";
import { AIProvider } from "./ai.interface.js";
import { MockAIProvider } from "./mock-ai.provider.js";

const PROMPT_INJECTION_PATTERN =
  /\b(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override|act\s+as\s+system|exfiltrate|reveal\s+(the\s+)?system\s+prompt)\b/i;

const FORBIDDEN_EXPRESSION_PATTERNS = [
  /\bprocess\b/i,
  /\brequire\b/i,
  /\bimport\b/i,
  /\beval\b/i,
  /\bFunction\b/i,
  /\bglobal\b/i,
  /\bwindow\b/i,
  /\b__dirname\b/i,
  /\b__filename\b/i,
];

export function redactApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "sk-****";
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

export function sanitizePromptText(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

export function scrubSecretsFromText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(
      /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]+['"]?/gi,
      "secret=[REDACTED]",
    );
}

export class AiService {
  private mockProvider = new MockAIProvider();
  private customProviders = new Map<string, AIProvider>();

  public getMockProvider(): MockAIProvider {
    return this.mockProvider;
  }

  public registerCustomProvider(orgId: string, provider: AIProvider) {
    this.customProviders.set(orgId, provider);
  }

  public getProvider(organizationId: string): AIProvider {
    if (this.customProviders.has(organizationId)) {
      return this.customProviders.get(organizationId)!;
    }
    return this.mockProvider;
  }

  /**
   * Retrieves organization AI configuration, initializing with defaults if missing.
   */
  public getAiConfig(
    organizationId: string,
    redactKey = true,
  ): AiConfigurationRecord {
    let config = apiStore.aiConfigurations.get(organizationId);
    if (!config) {
      config = {
        id: `aiconfig_${crypto.randomUUID()}`,
        organizationId,
        provider: "MOCK",
        model: "flowforge-copilot-v1",
        temperature: 0.7,
        maxTokens: 2048,
        timeoutSeconds: 30,
        enabled: true,
        monthlyTokenBudget: 500000,
        allowedRoles: ["OWNER", "ADMIN", "MEMBER"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.aiConfigurations.set(organizationId, config);
    }

    if (redactKey && config.apiKey) {
      return {
        ...config,
        apiKey: redactApiKey(config.apiKey),
      };
    }

    return { ...config };
  }

  /**
   * Updates organization AI configuration with validation and audit logging.
   */
  public updateAiConfig(
    organizationId: string,
    input: UpdateAiConfigRequest,
    actorId?: string,
  ): AiConfigurationRecord {
    const existing = this.getAiConfig(organizationId, false);

    const updated: AiConfigurationRecord = {
      ...existing,
      provider: input.provider ?? existing.provider,
      model: input.model ?? existing.model,
      apiKey: input.apiKey !== undefined ? input.apiKey : existing.apiKey,
      endpointUrl:
        input.endpointUrl !== undefined
          ? input.endpointUrl
          : existing.endpointUrl,
      temperature: input.temperature ?? existing.temperature,
      maxTokens: input.maxTokens ?? existing.maxTokens,
      timeoutSeconds: input.timeoutSeconds ?? existing.timeoutSeconds,
      enabled: input.enabled ?? existing.enabled,
      monthlyTokenBudget:
        input.monthlyTokenBudget ?? existing.monthlyTokenBudget,
      allowedRoles: input.allowedRoles ?? existing.allowedRoles,
      updatedAt: new Date(),
    };

    apiStore.aiConfigurations.set(organizationId, updated);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "ai.config.updated",
      resourceType: "AI_CONFIG",
      resourceId: updated.id,
      outcome: "SUCCESS",
      metadata: {
        provider: updated.provider,
        model: updated.model,
        enabled: updated.enabled,
        monthlyTokenBudget: updated.monthlyTokenBudget,
      },
    });

    return {
      ...updated,
      apiKey: redactApiKey(updated.apiKey),
    };
  }

  /**
   * Tests connectivity to the configured AI provider.
   */
  public async testConnectivity(
    organizationId: string,
  ): Promise<{ success: boolean; latencyMs: number; message?: string }> {
    const provider = this.getProvider(organizationId);
    return provider.testConnectivity();
  }

  /**
   * Validates monthly token budget before performing generation.
   */
  private checkTokenBudget(
    organizationId: string,
    budget: number,
    estimatedTokens: number,
  ) {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const monthlyTokensUsed = Array.from(apiStore.usageRecords.values())
      .filter(
        (u) =>
          u.organizationId === organizationId &&
          u.metric === "AI_TOKEN" &&
          u.recordedAt >= periodStart,
      )
      .reduce((sum, u) => sum + u.quantity, 0);

    if (monthlyTokensUsed + estimatedTokens > budget) {
      const err = new Error(
        `Monthly AI token budget of ${budget} exceeded. Current monthly usage: ${monthlyTokensUsed} tokens.`,
      );
      (err as any).statusCode = 429;
      (err as any).code = "AI_BUDGET_EXCEEDED";
      throw err;
    }
  }

  /**
   * Enforces prompt security rules and defense against prompt injection.
   */
  private validatePromptSafety(prompt: string) {
    const sanitized = sanitizePromptText(prompt);

    if (sanitized.length > 2000) {
      const err = new Error(
        "Prompt exceeds maximum length of 2000 characters.",
      );
      (err as any).statusCode = 400;
      (err as any).code = "PROMPT_TOO_LARGE";
      throw err;
    }

    if (PROMPT_INJECTION_PATTERN.test(sanitized)) {
      const err = new Error(
        "Prompt rejected: potential prompt injection pattern detected.",
      );
      (err as any).statusCode = 400;
      (err as any).code = "PROMPT_INJECTION_DETECTED";
      throw err;
    }

    return scrubSecretsFromText(sanitized);
  }

  /**
   * Generates a new workflow draft via the AI Copilot.
   */
  public async generateWorkflow(
    organizationId: string,
    request: GenerateWorkflowRequest,
    caller: { userId: string; role: Role },
  ): Promise<AiGeneratedWorkflowResult> {
    const config = this.getAiConfig(organizationId, false);
    if (!config.enabled) {
      const err = new Error("AI copilot is disabled for this organization.");
      (err as any).statusCode = 403;
      (err as any).code = "AI_DISABLED";
      throw err;
    }

    if (!config.allowedRoles.includes(caller.role)) {
      const err = new Error(
        `Role ${caller.role} is not permitted to use AI generation.`,
      );
      (err as any).statusCode = 403;
      (err as any).code = "FORBIDDEN";
      throw err;
    }

    const cleanPrompt = this.validatePromptSafety(request.prompt);
    this.checkTokenBudget(organizationId, config.monthlyTokenBudget, 200);

    const provider = this.getProvider(organizationId);
    const result = await provider.generateWorkflowDraft(cleanPrompt, {
      organizationId,
      workspaceId: request.workspaceId,
      targetName: request.targetName,
    });

    // Enforce canonical validation
    const canonicalValidation = validateWorkflowDefinition(result.definition);
    result.valid = canonicalValidation.isValid;
    result.validationErrors = (canonicalValidation.errors || []).map(
      (e) => e.message,
    );
    result.isUntrustedDraft = true;

    // Record usage
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_REQUEST",
      quantity: 1,
      metadata: { operation: "generate_workflow", model: provider.model },
    });
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_TOKEN",
      quantity: result.tokensUsed,
      metadata: { operation: "generate_workflow", model: provider.model },
    });

    // Record audit event
    apiStore.recordAudit({
      organizationId,
      userId: caller.userId,
      workspaceId: request.workspaceId,
      action: "ai.workflow.generated",
      resourceType: "WORKFLOW_DRAFT",
      resourceId: result.definition.nodes[0]?.id || "draft",
      outcome: result.valid ? "SUCCESS" : "VALIDATION_FAILED",
      metadata: {
        promptLength: request.prompt.length,
        tokensUsed: result.tokensUsed,
        nodeCount: result.definition.nodes.length,
        valid: result.valid,
      },
    });

    return result;
  }

  /**
   * Modifies an existing workflow draft conversationally with diff calculation and conflict checks.
   */
  public async editWorkflow(
    organizationId: string,
    request: EditWorkflowRequest,
    caller: { userId: string; role: Role },
  ): Promise<AiEditedWorkflowResult> {
    const config = this.getAiConfig(organizationId, false);
    if (!config.enabled) {
      const err = new Error("AI copilot is disabled for this organization.");
      (err as any).statusCode = 403;
      (err as any).code = "AI_DISABLED";
      throw err;
    }

    if (!config.allowedRoles.includes(caller.role)) {
      const err = new Error(
        `Role ${caller.role} is not permitted to edit workflows via AI.`,
      );
      (err as any).statusCode = 403;
      (err as any).code = "FORBIDDEN";
      throw err;
    }

    const cleanInstruction = this.validatePromptSafety(request.instruction);

    // Stale draft conflict detection
    if (request.baseHash) {
      const currentHash = computeWorkflowContentHash(request.currentDefinition);
      if (request.baseHash !== currentHash) {
        const err = new Error(
          "Stale draft detected. The workflow was modified by another session since your base version was loaded.",
        );
        (err as any).statusCode = 409;
        (err as any).code = "STALE_DRAFT_CONFLICT";
        throw err;
      }
    }

    this.checkTokenBudget(organizationId, config.monthlyTokenBudget, 200);

    const provider = this.getProvider(organizationId);
    const result = await provider.editWorkflowDraft(
      cleanInstruction,
      request.currentDefinition,
      {
        organizationId,
        baseHash: request.baseHash,
      },
    );

    // Canonical validation
    const canonicalValidation = validateWorkflowDefinition(result.definition);
    result.valid = canonicalValidation.isValid;
    result.validationErrors = (canonicalValidation.errors || []).map(
      (e) => e.message,
    );
    result.isUntrustedDraft = true;

    // Compute diff using engine comparator
    const diffComparison = compareWorkflowDefinitions(
      request.currentDefinition,
      result.definition,
    );
    result.diff = {
      addedNodes: diffComparison.addedNodes,
      removedNodes: diffComparison.removedNodes,
      modifiedNodes: diffComparison.modifiedNodes,
      addedEdges: diffComparison.addedEdges,
      removedEdges: diffComparison.removedEdges,
      summary: diffComparison.summary,
    };

    // Record usage
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_REQUEST",
      quantity: 1,
      metadata: { operation: "edit_workflow", model: provider.model },
    });
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_TOKEN",
      quantity: result.tokensUsed,
      metadata: { operation: "edit_workflow", model: provider.model },
    });

    // Record audit event
    apiStore.recordAudit({
      organizationId,
      userId: caller.userId,
      action: "ai.workflow.edited",
      resourceType: "WORKFLOW_DRAFT",
      resourceId: request.workflowId || "draft",
      outcome: result.valid ? "SUCCESS" : "VALIDATION_FAILED",
      metadata: {
        instructionLength: request.instruction.length,
        tokensUsed: result.tokensUsed,
        addedNodesCount: result.diff.addedNodes.length,
        valid: result.valid,
      },
    });

    return result;
  }

  /**
   * Explains a workflow's topology, triggers, branches, and risks.
   */
  public async explainWorkflow(
    organizationId: string,
    request: ExplainWorkflowRequest,
    caller: { userId: string; role: Role },
  ): Promise<AiWorkflowExplanation> {
    const config = this.getAiConfig(organizationId, false);
    if (!config.enabled) {
      const err = new Error("AI copilot is disabled for this organization.");
      (err as any).statusCode = 403;
      (err as any).code = "AI_DISABLED";
      throw err;
    }

    let definition = request.definition;
    if (!definition && request.workflowId) {
      const wf = apiStore.workflows.get(request.workflowId);
      if (!wf || wf.organizationId !== organizationId) {
        const err = new Error("Workflow not found.");
        (err as any).statusCode = 404;
        (err as any).code = "NOT_FOUND";
        throw err;
      }
      definition = wf.draftDefinition;
    }

    if (!definition) {
      const err = new Error("No workflow definition available to explain.");
      (err as any).statusCode = 400;
      (err as any).code = "INVALID_REQUEST";
      throw err;
    }

    const provider = this.getProvider(organizationId);
    const explanation = await provider.explainWorkflow(definition);

    // Record usage
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_REQUEST",
      quantity: 1,
      metadata: { operation: "explain_workflow", model: provider.model },
    });
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_TOKEN",
      quantity: 80,
      metadata: { operation: "explain_workflow", model: provider.model },
    });

    // Record audit event
    apiStore.recordAudit({
      organizationId,
      userId: caller.userId,
      action: "ai.workflow.explained",
      resourceType: "WORKFLOW",
      resourceId: request.workflowId || "definition",
      outcome: "SUCCESS",
      metadata: {
        branchCount: explanation.branches.length,
        integrationCount: explanation.externalIntegrations.length,
      },
    });

    return explanation;
  }

  /**
   * Analyzes an execution failure in a strictly read-only manner.
   */
  public async analyzeExecutionFailure(
    organizationId: string,
    executionId: string,
    caller: { userId: string; role: Role },
  ): Promise<AiFailureAnalysis> {
    const config = this.getAiConfig(organizationId, false);
    if (!config.enabled) {
      const err = new Error("AI copilot is disabled for this organization.");
      (err as any).statusCode = 403;
      (err as any).code = "AI_DISABLED";
      throw err;
    }

    // Read-only execution lookup
    const execution = apiStore.executions.get(executionId);
    if (!execution || execution.organizationId !== organizationId) {
      const err = new Error("Execution not found.");
      (err as any).statusCode = 404;
      (err as any).code = "NOT_FOUND";
      throw err;
    }

    // Read-only step log lookup
    const stepLogs = Array.from(apiStore.steps.values()).filter(
      (s) => s.executionId === executionId,
    );

    const provider = this.getProvider(organizationId);
    const analysis = await provider.analyzeExecutionFailure(
      execution,
      stepLogs,
    );

    // Record usage
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_REQUEST",
      quantity: 1,
      metadata: { operation: "analyze_failure", model: provider.model },
    });
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_TOKEN",
      quantity: analysis.tokensUsed,
      metadata: { operation: "analyze_failure", model: provider.model },
    });

    // Record audit event
    apiStore.recordAudit({
      organizationId,
      userId: caller.userId,
      action: "ai.failure.analyzed",
      resourceType: "EXECUTION",
      resourceId: executionId,
      outcome: "SUCCESS",
      metadata: {
        failureCategory: analysis.failureCategory,
        failedNodeId: analysis.failedNodeId,
      },
    });

    return analysis;
  }

  /**
   * Suggests and validates expressions safely without arbitrary code execution.
   */
  public async assistExpression(
    organizationId: string,
    request: AssistExpressionRequest,
    caller: { userId: string; role: Role },
  ): Promise<AiExpressionAssistance> {
    const config = this.getAiConfig(organizationId, false);
    if (!config.enabled) {
      const err = new Error("AI copilot is disabled for this organization.");
      (err as any).statusCode = 403;
      (err as any).code = "AI_DISABLED";
      throw err;
    }

    // Defense against code injection in expression goals
    for (const pattern of FORBIDDEN_EXPRESSION_PATTERNS) {
      if (pattern.test(request.goal)) {
        const err = new Error(
          "Unsafe expression goal detected: arbitrary code execution primitives are forbidden.",
        );
        (err as any).statusCode = 400;
        (err as any).code = "UNSAFE_EXPRESSION_INPUT";
        throw err;
      }
    }

    const provider = this.getProvider(organizationId);
    const assistance = await provider.assistExpression(request.goal, {
      organizationId,
      sourceSchema: request.sourceSchema,
      targetField: request.targetField,
    });

    // Record usage
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_REQUEST",
      quantity: 1,
      metadata: { operation: "assist_expression", model: provider.model },
    });
    entitlementService.recordUsage({
      organizationId,
      metric: "AI_TOKEN",
      quantity: 50,
      metadata: { operation: "assist_expression", model: provider.model },
    });

    // Record audit event
    apiStore.recordAudit({
      organizationId,
      userId: caller.userId,
      action: "ai.expression.assisted",
      resourceType: "EXPRESSION",
      resourceId: request.targetField || "expression",
      outcome: "SUCCESS",
      metadata: {
        isValid: assistance.isValid,
      },
    });

    return assistance;
  }
}

export const aiService = new AiService();
