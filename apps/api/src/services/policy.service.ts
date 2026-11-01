import crypto from "crypto";
import { apiStore } from "../store.js";
import {
  PolicyRecord,
  PolicyVersionRecord,
  PolicyRule,
  PolicyRuleCondition,
  PolicyEvaluationContext,
  PolicyEvaluationDecision,
  PolicyExceptionRecord,
  PolicyViolationRecord,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  CreatePolicyExceptionRequest,
  SimulatePolicyRequest,
  Role,
} from "@flowforge/shared";
import { InMemoryDatabase } from "@flowforge/test-utils";

/**
 * Safe condition evaluation without dynamic code execution or arbitrary scripts.
 */
function evaluateCondition(
  condition: PolicyRuleCondition,
  contextAttributes: Record<string, unknown>,
): boolean {
  const { field, operator, value } = condition;
  const actualValue = contextAttributes[field];

  switch (operator) {
    case "IS_EMPTY":
      if (actualValue === undefined || actualValue === null) return true;
      if (typeof actualValue === "string") return actualValue.trim() === "";
      if (Array.isArray(actualValue)) return actualValue.length === 0;
      if (typeof actualValue === "object")
        return Object.keys(actualValue).length === 0;
      return false;

    case "IS_NOT_EMPTY":
      if (actualValue === undefined || actualValue === null) return false;
      if (typeof actualValue === "string") return actualValue.trim() !== "";
      if (Array.isArray(actualValue)) return actualValue.length > 0;
      if (typeof actualValue === "object")
        return Object.keys(actualValue).length > 0;
      return true;

    case "EQUALS":
      return actualValue === value;

    case "NOT_EQUALS":
      return actualValue !== value;

    case "CONTAINS":
      if (Array.isArray(actualValue)) {
        return actualValue.includes(value as any);
      }
      if (typeof actualValue === "string" && typeof value === "string") {
        return actualValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;

    case "NOT_CONTAINS":
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(value as any);
      }
      if (typeof actualValue === "string" && typeof value === "string") {
        return !actualValue.toLowerCase().includes(value.toLowerCase());
      }
      return true;

    case "IN":
      if (Array.isArray(value)) {
        return (value as any[]).includes(actualValue);
      }
      return false;

    case "NOT_IN":
      if (Array.isArray(value)) {
        return !(value as any[]).includes(actualValue);
      }
      return true;

    case "GREATER_THAN":
      if (typeof actualValue === "number" && typeof value === "number") {
        return actualValue > value;
      }
      return false;

    case "LESS_THAN":
      if (typeof actualValue === "number" && typeof value === "number") {
        return actualValue < value;
      }
      return false;

    case "MATCHES_REGEX":
      if (typeof actualValue !== "string" || typeof value !== "string") {
        return false;
      }
      // ReDoS and security protection: bound regex length to 100 chars
      if (value.length > 100) return false;
      try {
        const regex = new RegExp(value);
        return regex.test(actualValue);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

function evaluateRule(
  rule: PolicyRule,
  contextAttributes: Record<string, unknown>,
): boolean {
  if (!rule.conditions || rule.conditions.length === 0) {
    return false;
  }

  const logicalOp = rule.logicalOperator || "AND";
  if (logicalOp === "OR") {
    return rule.conditions.some((cond) =>
      evaluateCondition(cond, contextAttributes),
    );
  }
  return rule.conditions.every((cond) =>
    evaluateCondition(cond, contextAttributes),
  );
}

export class PolicyService {
  private static cache = new Map<
    string,
    { decision: PolicyEvaluationDecision; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private db: InMemoryDatabase = apiStore) {}

  public clearCache(): void {
    PolicyService.cache.clear();
  }

  // ==========================================================================
  // 1. POLICY LIFECYCLE MANAGEMENT
  // ==========================================================================

  public createPolicy(
    organizationId: string,
    req: CreatePolicyRequest,
    authorUserId: string,
  ): PolicyRecord {
    const policyId = `pol_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date();

    const policy: PolicyRecord = {
      id: policyId,
      organizationId,
      workspaceId: req.workspaceId || null,
      name: req.name,
      description: req.description || null,
      category: req.category,
      version: 1,
      status: "DRAFT",
      applicableResourceTypes: req.applicableResourceTypes,
      applicableOperations: req.applicableOperations,
      priority: req.priority,
      effectiveStartDate: req.effectiveStartDate
        ? new Date(req.effectiveStartDate)
        : null,
      effectiveEndDate: req.effectiveEndDate
        ? new Date(req.effectiveEndDate)
        : null,
      rules: req.rules,
      complianceControls: req.complianceControls || [],
      createdById: authorUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId: authorUserId,
      action: "policy.created",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { name: policy.name, version: 1, status: "DRAFT" },
    });

    return policy;
  }

  public updatePolicy(
    organizationId: string,
    policyId: string,
    req: UpdatePolicyRequest,
    userId: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    if (policy.status === "ACTIVE") {
      throw new Error("CANNOT_EDIT_ACTIVE_POLICY");
    }

    if (req.name !== undefined) policy.name = req.name;
    if (req.description !== undefined) policy.description = req.description;
    if (req.workspaceId !== undefined)
      policy.workspaceId = req.workspaceId || null;
    if (req.category !== undefined) policy.category = req.category;
    if (req.applicableResourceTypes !== undefined)
      policy.applicableResourceTypes = req.applicableResourceTypes;
    if (req.applicableOperations !== undefined)
      policy.applicableOperations = req.applicableOperations;
    if (req.priority !== undefined) policy.priority = req.priority;
    if (req.effectiveStartDate !== undefined) {
      policy.effectiveStartDate = req.effectiveStartDate
        ? new Date(req.effectiveStartDate)
        : null;
    }
    if (req.effectiveEndDate !== undefined) {
      policy.effectiveEndDate = req.effectiveEndDate
        ? new Date(req.effectiveEndDate)
        : null;
    }
    if (req.rules !== undefined) policy.rules = req.rules;
    if (req.complianceControls !== undefined)
      policy.complianceControls = req.complianceControls;
    if (req.changeSummary !== undefined)
      policy.changeSummary = req.changeSummary;

    policy.lastModifiedById = userId;
    policy.updatedAt = new Date();

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.updated",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { changeSummary: req.changeSummary, version: policy.version },
    });

    return policy;
  }

  public submitForReview(
    organizationId: string,
    policyId: string,
    userId: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    if (policy.status !== "DRAFT") {
      throw new Error("POLICY_NOT_IN_DRAFT_STATE");
    }

    policy.status = "IN_REVIEW";
    policy.lastModifiedById = userId;
    policy.updatedAt = new Date();

    this.db.policies.set(policy.id, policy);

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.review_submitted",
      resourceType: "policy",
      resourceId: policy.id,
    });

    return policy;
  }

  public approvePolicy(
    organizationId: string,
    policyId: string,
    approverUserId: string,
    approverRole: Role,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    if (policy.status !== "IN_REVIEW" && policy.status !== "DRAFT") {
      throw new Error("INVALID_STATE_FOR_APPROVAL");
    }

    // Dual-control enforcement: Approver cannot be author unless OWNER
    if (policy.createdById === approverUserId && approverRole !== "OWNER") {
      throw new Error("DUAL_CONTROL_VIOLATION");
    }

    const now = new Date();
    policy.status = "APPROVED";
    policy.approvedById = approverUserId;
    policy.approvedAt = now;
    policy.updatedAt = now;

    // Create immutable version snapshot
    const versionRecord: PolicyVersionRecord = {
      id: `pol_ver_${crypto.randomUUID().slice(0, 8)}`,
      policyId: policy.id,
      organizationId,
      version: policy.version,
      definition: {
        name: policy.name,
        description: policy.description,
        category: policy.category,
        applicableResourceTypes: [...policy.applicableResourceTypes],
        applicableOperations: [...policy.applicableOperations],
        priority: policy.priority,
        rules: JSON.parse(JSON.stringify(policy.rules)),
        complianceControls: [...policy.complianceControls],
      },
      approvedById: approverUserId,
      approvedAt: now,
      changeSummary: policy.changeSummary,
      createdAt: now,
    };
    this.db.policyVersions.set(versionRecord.id, versionRecord);

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId: approverUserId,
      action: "policy.approved",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { version: policy.version },
    });

    return policy;
  }

  public activatePolicy(
    organizationId: string,
    policyId: string,
    userId: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    if (policy.status !== "APPROVED" && policy.status !== "SUSPENDED") {
      throw new Error("POLICY_NOT_APPROVED");
    }

    policy.status = "ACTIVE";
    policy.updatedAt = new Date();
    policy.lastModifiedById = userId;

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.activated",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { version: policy.version },
    });

    return policy;
  }

  public suspendPolicy(
    organizationId: string,
    policyId: string,
    userId: string,
    reason?: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    if (policy.status !== "ACTIVE") {
      throw new Error("POLICY_NOT_ACTIVE");
    }

    policy.status = "SUSPENDED";
    policy.updatedAt = new Date();
    policy.lastModifiedById = userId;

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.suspended",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { reason, version: policy.version },
    });

    return policy;
  }

  public rollbackPolicy(
    organizationId: string,
    policyId: string,
    targetVersion: number,
    userId: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    // Find snapshot for targetVersion
    const targetVerRecord = Array.from(this.db.policyVersions.values()).find(
      (v) => v.policyId === policyId && v.version === targetVersion,
    );
    if (!targetVerRecord) {
      throw new Error("VERSION_SNAPSHOT_NOT_FOUND");
    }

    const newVersionNumber = policy.version + 1;
    const now = new Date();

    policy.name = targetVerRecord.definition.name;
    policy.description = targetVerRecord.definition.description;
    policy.category = targetVerRecord.definition.category;
    policy.applicableResourceTypes = [
      ...targetVerRecord.definition.applicableResourceTypes,
    ];
    policy.applicableOperations = [
      ...targetVerRecord.definition.applicableOperations,
    ];
    policy.priority = targetVerRecord.definition.priority;
    policy.rules = JSON.parse(JSON.stringify(targetVerRecord.definition.rules));
    policy.complianceControls = [
      ...targetVerRecord.definition.complianceControls,
    ];
    policy.version = newVersionNumber;
    policy.changeSummary = `Rolled back to version ${targetVersion}`;
    policy.lastModifiedById = userId;
    policy.status = "APPROVED";
    policy.approvedById = userId;
    policy.approvedAt = now;
    policy.updatedAt = now;

    // Record new version record for the rollback
    const newVerRecord: PolicyVersionRecord = {
      id: `pol_ver_${crypto.randomUUID().slice(0, 8)}`,
      policyId: policy.id,
      organizationId,
      version: newVersionNumber,
      definition: {
        name: policy.name,
        description: policy.description,
        category: policy.category,
        applicableResourceTypes: [...policy.applicableResourceTypes],
        applicableOperations: [...policy.applicableOperations],
        priority: policy.priority,
        rules: JSON.parse(JSON.stringify(policy.rules)),
        complianceControls: [...policy.complianceControls],
      },
      approvedById: userId,
      approvedAt: now,
      changeSummary: policy.changeSummary,
      createdAt: now,
    };
    this.db.policyVersions.set(newVerRecord.id, newVerRecord);

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.rolled_back",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { targetVersion, newVersion: newVersionNumber },
    });

    return policy;
  }

  public retirePolicy(
    organizationId: string,
    policyId: string,
    userId: string,
  ): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    policy.status = "RETIRED";
    policy.updatedAt = new Date();
    policy.lastModifiedById = userId;

    this.db.policies.set(policy.id, policy);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.retired",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { version: policy.version },
    });

    return policy;
  }

  public listPolicies(
    organizationId: string,
    filters?: {
      category?: string;
      status?: string;
      workspaceId?: string;
    },
  ): PolicyRecord[] {
    const results: PolicyRecord[] = [];
    for (const p of this.db.policies.values()) {
      if (p.organizationId !== organizationId) continue;
      if (filters?.category && p.category !== filters.category) continue;
      if (filters?.status && p.status !== filters.status) continue;
      if (
        filters?.workspaceId &&
        p.workspaceId &&
        p.workspaceId !== filters.workspaceId
      )
        continue;
      results.push(p);
    }
    return results.sort((a, b) => a.priority - b.priority);
  }

  public getPolicy(organizationId: string, policyId: string): PolicyRecord {
    const policy = this.db.policies.get(policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }
    return policy;
  }

  // ==========================================================================
  // 2. CENTRAL POLICY EVALUATION ENGINE
  // ==========================================================================

  public async evaluate(
    context: PolicyEvaluationContext,
  ): Promise<PolicyEvaluationDecision> {
    const startTime = Date.now();
    const correlationId =
      context.correlationId || `eval_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();

    // Check bounded cache
    const cacheKey = `${context.organizationId}:${context.workspaceId || ""}:${context.resourceType}:${context.resourceId || ""}:${context.operation}:${JSON.stringify(context.attributes)}`;
    const cached = PolicyService.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.decision,
        correlationId,
        evaluationDurationMs: Date.now() - startTime,
      };
    }

    // 1. Gather all active policies applicable to this resourceType & operation
    const candidatePolicies: PolicyRecord[] = [];
    for (const p of this.db.policies.values()) {
      if (p.organizationId !== context.organizationId) continue;
      if (
        p.workspaceId &&
        context.workspaceId &&
        p.workspaceId !== context.workspaceId
      )
        continue;
      if (p.status !== "ACTIVE") continue;
      if (!p.applicableResourceTypes.includes(context.resourceType)) continue;
      if (!p.applicableOperations.includes(context.operation)) continue;

      if (p.effectiveStartDate && now < p.effectiveStartDate) continue;
      if (p.effectiveEndDate && now > p.effectiveEndDate) continue;

      candidatePolicies.push(p);
    }

    // Sort by priority ascending (lower number = higher precedence)
    candidatePolicies.sort((a, b) => a.priority - b.priority);

    // 2. Check for active exceptions
    const activeExceptions: PolicyExceptionRecord[] = [];
    if (context.resourceId) {
      for (const ex of this.db.policyExceptions.values()) {
        if (ex.organizationId !== context.organizationId) continue;
        if (ex.resourceType !== context.resourceType) continue;
        if (ex.resourceId !== context.resourceId) continue;
        if (ex.operation !== context.operation) continue;
        if (ex.status !== "APPROVED") continue;
        if (ex.expiresAt <= now) continue;
        activeExceptions.push(ex);
      }
    }

    let isAllowed = true;
    let requiresApproval = false;
    let requiredApprovalRole: Role | undefined = undefined;
    let decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "FLAG_FOR_REVIEW" =
      "ALLOW";
    let auditRequired = false;

    const matchedPolicies: PolicyEvaluationDecision["matchedPolicies"] = [];
    const violations: PolicyEvaluationDecision["violations"] = [];
    const warnings: PolicyEvaluationDecision["warnings"] = [];

    // 3. Evaluate each rule
    for (const policy of candidatePolicies) {
      for (const rule of policy.rules) {
        // Check if an approved exception applies to this specific rule or policy
        const isExempt = activeExceptions.some(
          (ex) =>
            ex.policyId === policy.id && (!ex.ruleId || ex.ruleId === rule.id),
        );

        if (isExempt) {
          continue; // Rule bypassed due to active approved exception
        }

        const isRuleTriggered = evaluateRule(rule, context.attributes);
        if (!isRuleTriggered) continue;

        matchedPolicies.push({
          policyId: policy.id,
          policyVersion: policy.version,
          policyName: policy.name,
          ruleId: rule.id,
          outcome: rule.outcome,
          severity: rule.severity,
          reasonCode: rule.reasonCode,
          message: rule.message,
        });

        if (rule.outcome === "DENY") {
          isAllowed = false;
          decision = "DENY";
          violations.push({
            policyId: policy.id,
            policyVersion: policy.version,
            ruleId: rule.id,
            reasonCode: rule.reasonCode,
            message: rule.message,
            severity: rule.severity,
          });

          // Also record in db violations store if not already tracked
          if (context.resourceId) {
            this.recordViolation({
              organizationId: context.organizationId,
              workspaceId: context.workspaceId,
              policyId: policy.id,
              policyVersion: policy.version,
              ruleId: rule.id,
              resourceType: context.resourceType,
              resourceId: context.resourceId,
              operation: context.operation,
              severity: rule.severity,
              reasonCode: rule.reasonCode,
              message: rule.message,
            });
          }
        } else if (rule.outcome === "REQUIRE_APPROVAL") {
          requiresApproval = true;
          requiredApprovalRole = rule.requiredRole || "ADMIN";
          if (decision !== "DENY") {
            decision = "REQUIRE_APPROVAL";
            isAllowed = false;
          }
        } else if (rule.outcome === "FLAG_FOR_REVIEW") {
          warnings.push({
            code: rule.reasonCode,
            message: rule.message,
            policyId: policy.id,
            severity: rule.severity,
          });
          if (decision === "ALLOW") {
            decision = "FLAG_FOR_REVIEW";
          }
        } else if (rule.outcome === "REQUIRE_AUDIT") {
          auditRequired = true;
        }
      }
    }

    const evaluationDurationMs = Date.now() - startTime;
    const finalDecision: PolicyEvaluationDecision = {
      decision,
      isAllowed,
      requiresApproval,
      requiredApprovalRole,
      matchedPolicies,
      violations,
      warnings,
      auditRequired,
      evaluationDurationMs,
      evaluatedAt: new Date().toISOString(),
      correlationId,
    };

    // Store in cache
    if (PolicyService.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = PolicyService.cache.keys().next().value;
      if (oldestKey) PolicyService.cache.delete(oldestKey);
    }
    PolicyService.cache.set(cacheKey, {
      decision: finalDecision,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    if (auditRequired || decision === "DENY") {
      this.db.recordAudit({
        organizationId: context.organizationId,
        userId: context.principal.id,
        action:
          decision === "DENY" ? "policy.violation_blocked" : "policy.evaluated",
        resourceType: context.resourceType,
        resourceId: context.resourceId || "N/A",
        outcome: decision === "DENY" ? "DENIED" : "SUCCESS",
        metadata: {
          decision,
          operation: context.operation,
          correlationId,
          matchedRuleCount: matchedPolicies.length,
        },
      });
    }

    return finalDecision;
  }

  // ==========================================================================
  // 3. POLICY SIMULATION & DRY-RUN TESTING
  // ==========================================================================

  public simulate(
    organizationId: string,
    req: SimulatePolicyRequest,
  ): PolicyEvaluationDecision {
    const startTime = Date.now();
    const correlationId = `sim_${crypto.randomUUID().slice(0, 8)}`;

    const rulesToTest: PolicyRule[] = req.policy?.rules
      ? req.policy.rules
      : req.policyId
        ? this.db.policies.get(req.policyId)?.rules || []
        : [];

    let isAllowed = true;
    let requiresApproval = false;
    let requiredApprovalRole: Role | undefined = undefined;
    let decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "FLAG_FOR_REVIEW" =
      "ALLOW";
    let auditRequired = false;

    const matchedPolicies: PolicyEvaluationDecision["matchedPolicies"] = [];
    const violations: PolicyEvaluationDecision["violations"] = [];
    const warnings: PolicyEvaluationDecision["warnings"] = [];

    for (const rule of rulesToTest) {
      const isTriggered = evaluateRule(rule, req.context.attributes || {});
      if (!isTriggered) continue;

      matchedPolicies.push({
        policyId: req.policyId || "draft_simulation",
        policyVersion: 1,
        policyName: req.policy?.name || "Draft Policy",
        ruleId: rule.id,
        outcome: rule.outcome,
        severity: rule.severity,
        reasonCode: rule.reasonCode,
        message: rule.message,
      });

      if (rule.outcome === "DENY") {
        isAllowed = false;
        decision = "DENY";
        violations.push({
          policyId: req.policyId || "draft_simulation",
          policyVersion: 1,
          ruleId: rule.id,
          reasonCode: rule.reasonCode,
          message: rule.message,
          severity: rule.severity,
        });
      } else if (rule.outcome === "REQUIRE_APPROVAL") {
        requiresApproval = true;
        requiredApprovalRole = rule.requiredRole || "ADMIN";
        if (decision !== "DENY") {
          decision = "REQUIRE_APPROVAL";
          isAllowed = false;
        }
      } else if (rule.outcome === "FLAG_FOR_REVIEW") {
        warnings.push({
          code: rule.reasonCode,
          message: rule.message,
          policyId: req.policyId || "draft_simulation",
          severity: rule.severity,
        });
        if (decision === "ALLOW") {
          decision = "FLAG_FOR_REVIEW";
        }
      } else if (rule.outcome === "REQUIRE_AUDIT") {
        auditRequired = true;
      }
    }

    return {
      decision,
      isAllowed,
      requiresApproval,
      requiredApprovalRole,
      matchedPolicies,
      violations,
      warnings,
      auditRequired,
      evaluationDurationMs: Date.now() - startTime,
      evaluatedAt: new Date().toISOString(),
      correlationId,
    };
  }

  // ==========================================================================
  // 4. EXCEPTIONS & OVERRIDES
  // ==========================================================================

  public requestException(
    organizationId: string,
    req: CreatePolicyExceptionRequest,
    requesterUserId: string,
  ): PolicyExceptionRecord {
    const policy = this.db.policies.get(req.policyId);
    if (!policy || policy.organizationId !== organizationId) {
      throw new Error("POLICY_NOT_FOUND");
    }

    const expiresAt = new Date(Date.now() + req.expiresInHours * 3600000);
    const exception: PolicyExceptionRecord = {
      id: `ex_${crypto.randomUUID().slice(0, 10)}`,
      organizationId,
      workspaceId: req.workspaceId || null,
      policyId: req.policyId,
      policyVersion: policy.version,
      ruleId: req.ruleId || null,
      resourceType: req.resourceType,
      resourceId: req.resourceId,
      operation: req.operation,
      reason: req.reason,
      status: "PENDING",
      requestedById: requesterUserId,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.db.policyExceptions.set(exception.id, exception);

    this.db.recordAudit({
      organizationId,
      userId: requesterUserId,
      action: "policy.exception_requested",
      resourceType: "policy_exception",
      resourceId: exception.id,
      metadata: { policyId: req.policyId, reason: req.reason },
    });

    return exception;
  }

  public decideException(
    organizationId: string,
    exceptionId: string,
    decision: "APPROVED" | "REJECTED",
    deciderUserId: string,
  ): PolicyExceptionRecord {
    const exception = this.db.policyExceptions.get(exceptionId);
    if (!exception || exception.organizationId !== organizationId) {
      throw new Error("EXCEPTION_NOT_FOUND");
    }

    if (exception.status !== "PENDING") {
      throw new Error("EXCEPTION_ALREADY_DECIDED");
    }

    const now = new Date();
    exception.status = decision;
    exception.approvedById = deciderUserId;
    exception.approvedAt = now;
    exception.updatedAt = now;

    this.db.policyExceptions.set(exception.id, exception);
    this.clearCache();

    this.db.recordAudit({
      organizationId,
      userId: deciderUserId,
      action:
        decision === "APPROVED"
          ? "policy.exception_granted"
          : "policy.exception_rejected",
      resourceType: "policy_exception",
      resourceId: exception.id,
      metadata: {
        policyId: exception.policyId,
        resourceId: exception.resourceId,
        expiresAt: exception.expiresAt.toISOString(),
      },
    });

    return exception;
  }

  public listExceptions(organizationId: string): PolicyExceptionRecord[] {
    const list: PolicyExceptionRecord[] = [];
    for (const ex of this.db.policyExceptions.values()) {
      if (ex.organizationId === organizationId) {
        list.push(ex);
      }
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ==========================================================================
  // 5. VIOLATIONS & REMEDIATION
  // ==========================================================================

  public recordViolation(violation: {
    organizationId: string;
    workspaceId?: string;
    policyId: string;
    policyVersion: number;
    ruleId: string;
    resourceType: any;
    resourceId: string;
    operation: any;
    severity: any;
    reasonCode: string;
    message: string;
  }): PolicyViolationRecord {
    const id = `viol_${crypto.randomUUID().slice(0, 10)}`;
    const record: PolicyViolationRecord = {
      id,
      organizationId: violation.organizationId,
      workspaceId: violation.workspaceId || null,
      policyId: violation.policyId,
      policyVersion: violation.policyVersion,
      ruleId: violation.ruleId,
      resourceType: violation.resourceType,
      resourceId: violation.resourceId,
      operation: violation.operation,
      severity: violation.severity,
      reasonCode: violation.reasonCode,
      message: violation.message,
      status: "OPEN",
      detectedAt: new Date(),
    };

    this.db.policyViolations.set(record.id, record);
    return record;
  }

  public listViolations(
    organizationId: string,
    filters?: {
      status?: string;
      severity?: string;
      resourceType?: string;
    },
  ): PolicyViolationRecord[] {
    const list: PolicyViolationRecord[] = [];
    for (const v of this.db.policyViolations.values()) {
      if (v.organizationId !== organizationId) continue;
      if (filters?.status && v.status !== filters.status) continue;
      if (filters?.severity && v.severity !== filters.severity) continue;
      if (filters?.resourceType && v.resourceType !== filters.resourceType)
        continue;
      list.push(v);
    }
    return list.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  public updateViolation(
    organizationId: string,
    violationId: string,
    updates: {
      status?: "OPEN" | "ACKNOWLEDGED" | "EXCEPTION_GRANTED" | "RESOLVED";
      assignedToId?: string;
      remediationNotes?: string;
    },
    userId: string,
  ): PolicyViolationRecord {
    const v = this.db.policyViolations.get(violationId);
    if (!v || v.organizationId !== organizationId) {
      throw new Error("VIOLATION_NOT_FOUND");
    }

    if (updates.status !== undefined) {
      v.status = updates.status;
      if (updates.status === "RESOLVED") {
        v.resolvedAt = new Date();
      }
    }
    if (updates.assignedToId !== undefined)
      v.assignedToId = updates.assignedToId;
    if (updates.remediationNotes !== undefined)
      v.remediationNotes = updates.remediationNotes;

    this.db.policyViolations.set(v.id, v);

    this.db.recordAudit({
      organizationId,
      userId,
      action: "policy.violation_updated",
      resourceType: "policy_violation",
      resourceId: v.id,
      metadata: { status: v.status, assignedToId: v.assignedToId },
    });

    return v;
  }
}

export const policyService = new PolicyService();
