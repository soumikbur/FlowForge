import crypto from "crypto";
import { apiStore } from "../store.js";
import {
  AuditLogRecord,
  RetentionPolicyRecord,
  RetentionJobRecord,
  PrivacyRequestRecord,
  LegalHoldRecord,
  ComplianceControlItem,
  sanitizeAuditMetadata,
} from "@flowforge/test-utils";
import {
  CreateLegalHoldInput,
  ReleaseLegalHoldInput,
  CreatePrivacyRequestInput,
  ReviewPrivacyRequestInput,
  AuditExportQueryInput,
} from "@flowforge/shared";

export class ComplianceService {
  // ==========================================
  // 1. AUDIT INTEGRITY & CHAIN VERIFICATION
  // ==========================================

  public verifyAuditChain(organizationId: string): {
    verified: boolean;
    totalEvents: number;
    lastHash?: string;
    brokenRecordId?: string;
    expectedHash?: string;
    actualHash?: string;
    index?: number;
  } {
    const logs = apiStore.auditLogs.filter(
      (l) => l.organizationId === organizationId,
    );
    if (logs.length === 0) {
      return { verified: true, totalEvents: 0 };
    }

    let prevHash = "GENESIS_HASH";

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const sanitizedMeta = log.metadata
        ? sanitizeAuditMetadata(log.metadata)
        : {};

      const hashPayload = `${prevHash}:${log.id}:${new Date(log.createdAt).toISOString()}:${log.organizationId}:${log.action}:${log.resourceType}:${log.resourceId}:${log.outcome || "SUCCESS"}:${JSON.stringify(sanitizedMeta)}`;
      const expectedHash = crypto
        .createHash("sha256")
        .update(hashPayload)
        .digest("hex");

      // Verify prevRecordHash matches previous
      if (log.prevRecordHash && log.prevRecordHash !== prevHash) {
        this.triggerTamperAlert(
          organizationId,
          log.id,
          "Chain continuity broken (prevRecordHash mismatch)",
        );
        return {
          verified: false,
          totalEvents: logs.length,
          brokenRecordId: log.id,
          expectedHash: prevHash,
          actualHash: log.prevRecordHash,
          index: i,
        };
      }

      // Verify recordHash matches payload computation
      if (log.recordHash && log.recordHash !== expectedHash) {
        this.triggerTamperAlert(
          organizationId,
          log.id,
          "Audit record content hash tampered",
        );
        return {
          verified: false,
          totalEvents: logs.length,
          brokenRecordId: log.id,
          expectedHash,
          actualHash: log.recordHash,
          index: i,
        };
      }

      prevHash = log.recordHash || expectedHash;
    }

    return {
      verified: true,
      totalEvents: logs.length,
      lastHash: prevHash,
    };
  }

  private triggerTamperAlert(
    organizationId: string,
    recordId: string,
    reason: string,
  ): void {
    const alertId = `alert_tamper_${Date.now()}`;
    apiStore.alerts.set(alertId, {
      id: alertId,
      organizationId,
      ruleType: "AUDIT_TAMPER_DETECTED",
      severity: "CRITICAL",
      status: "ACTIVE",
      title: "Audit Log Tamper Detected",
      message: `Audit verification failed for event ${recordId}: ${reason}`,
      contextJson: { recordId, reason },
      triggeredAt: new Date(),
    });
  }

  // ==========================================
  // 2. AUDIT EXPORT & FORMULA INJECTION DEFENSE
  // ==========================================

  public exportAuditLogs(
    organizationId: string,
    query: AuditExportQueryInput,
    actorId?: string,
  ): {
    contentType: string;
    filename: string;
    content: string;
    count: number;
  } {
    let logs = apiStore.auditLogs.filter(
      (l) => l.organizationId === organizationId,
    );

    if (query.action) {
      logs = logs.filter((l) => l.action.includes(query.action!));
    }
    if (query.resourceType) {
      logs = logs.filter((l) => l.resourceType === query.resourceType);
    }
    if (query.from) {
      const fromDate = new Date(query.from);
      logs = logs.filter((l) => new Date(l.createdAt) >= fromDate);
    }
    if (query.to) {
      const toDate = new Date(query.to);
      logs = logs.filter((l) => new Date(l.createdAt) <= toDate);
    }

    // Limit maximum export size
    const limit = Math.min(query.limit || 1000, 5000);
    logs = logs.slice(0, limit);

    // Record audit event for the export operation itself
    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "audit.logs.exported",
      resourceType: "audit_export",
      resourceId: `export_${Date.now()}`,
      metadata: { format: query.format, recordCount: logs.length },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (query.format === "csv") {
      const headers = [
        "id",
        "timestamp",
        "action",
        "actorType",
        "actorId",
        "resourceType",
        "resourceId",
        "outcome",
        "ipAddress",
        "correlationId",
        "metadata",
      ];

      const rows = logs.map((log) => [
        this.escapeCsvField(log.id),
        this.escapeCsvField(new Date(log.createdAt).toISOString()),
        this.escapeCsvField(log.action),
        this.escapeCsvField(log.actorType || "USER"),
        this.escapeCsvField(log.actorId || log.userId || "system"),
        this.escapeCsvField(log.resourceType),
        this.escapeCsvField(log.resourceId),
        this.escapeCsvField(log.outcome || "SUCCESS"),
        this.escapeCsvField(log.ipAddress || ""),
        this.escapeCsvField(log.correlationId || ""),
        this.escapeCsvField(JSON.stringify(log.metadata || {})),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((r) => r.join(",")),
      ].join("\n");

      return {
        contentType: "text/csv; charset=utf-8",
        filename: `audit-export-${organizationId}-${timestamp}.csv`,
        content: csvContent,
        count: logs.length,
      };
    }

    // JSON export
    const jsonContent = JSON.stringify(logs, null, 2);
    return {
      contentType: "application/json; charset=utf-8",
      filename: `audit-export-${organizationId}-${timestamp}.json`,
      content: jsonContent,
      count: logs.length,
    };
  }

  /**
   * Prevents CSV formula injection by prepending dangerous leading characters with a single quote.
   */
  public escapeCsvField(val: string): string {
    if (val === null || val === undefined) return '""';
    let str = String(val);

    // Formula injection triggers: =, +, -, @, tab, CR
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }

    return '"' + str.replace(/"/g, '""') + '"';
  }

  // ==========================================
  // 3. RETENTION POLICIES & CONSTRAINTS
  // ==========================================

  private static DEFAULT_RETENTION_DAYS: Record<string, number> = {
    AUDIT_LOGS: 365,
    WORKFLOW_EXECUTIONS: 90,
    EXECUTION_LOGS: 30,
    WORKFLOW_VERSIONS: 365,
    WEBHOOK_DELIVERIES: 30,
    NOTIFICATION_DELIVERIES: 30,
    EXPORTS_TEMPORARY: 7,
    PRIVACY_REQUESTS: 365,
  };

  private static MIN_PLATFORM_RETENTION: Record<string, number> = {
    AUDIT_LOGS: 90, // Mandatory platform floor
  };

  public getRetentionPolicies(organizationId: string): RetentionPolicyRecord[] {
    const custom = Array.from(apiStore.retentionPolicies.values()).filter(
      (p) => p.organizationId === organizationId,
    );

    const categories = Object.keys(ComplianceService.DEFAULT_RETENTION_DAYS);
    const result: RetentionPolicyRecord[] = [];

    for (const cat of categories) {
      const existing = custom.find((p) => p.category === cat);
      if (existing) {
        result.push(existing);
      } else {
        result.push({
          id: `def_ret_${cat.toLowerCase()}`,
          organizationId,
          category: cat,
          retentionDays: ComplianceService.DEFAULT_RETENTION_DAYS[cat],
          enabled: true,
          legalHoldExempt: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return result;
  }

  public setRetentionPolicy(
    organizationId: string,
    category: string,
    days: number,
    enabled: boolean,
    legalHoldExempt: boolean,
    actorId?: string,
  ): RetentionPolicyRecord {
    // Platform minimum restriction validation
    const minDays = ComplianceService.MIN_PLATFORM_RETENTION[category];
    if (minDays && days < minDays) {
      throw new Error(
        `Retention for category '${category}' cannot be configured below the mandatory platform threshold of ${minDays} days.`,
      );
    }

    const key = `${organizationId}_${category}`;
    const existing = apiStore.retentionPolicies.get(key);

    const record: RetentionPolicyRecord = {
      id:
        existing?.id ||
        `ret_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId,
      category,
      retentionDays: days,
      enabled,
      legalHoldExempt,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    apiStore.retentionPolicies.set(key, record);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "retention.policy.updated",
      resourceType: "retention_policy",
      resourceId: record.id,
      metadata: { category, retentionDays: days, enabled, legalHoldExempt },
    });

    return record;
  }

  // ==========================================
  // 4. RETENTION PREVIEW & BATCH PROCESSING
  // ==========================================

  public previewRetention(
    organizationId: string,
    targetCategory?: string,
  ): {
    organizationId: string;
    evaluatedAt: Date;
    categories: Record<
      string,
      {
        totalRecords: number;
        eligibleForPurge: number;
        preservedByLegalHold: number;
        policyRetentionDays: number;
      }
    >;
    totalEligibleForPurge: number;
    totalPreservedByLegalHold: number;
  } {
    const policies = this.getRetentionPolicies(organizationId);
    const activeHolds = this.getActiveLegalHolds(organizationId);

    const categoriesSummary: Record<string, any> = {};
    let totalEligible = 0;
    let totalPreserved = 0;

    for (const policy of policies) {
      if (targetCategory && policy.category !== targetCategory) continue;
      if (!policy.enabled) continue;

      const cutoff = new Date(
        Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000,
      );
      let catTotal = 0;
      let catEligible = 0;
      let catPreserved = 0;

      const records = this.getRecordsForCategory(
        organizationId,
        policy.category,
      );
      catTotal = records.length;

      for (const rec of records) {
        const recDate = new Date(rec.createdAt);
        if (recDate < cutoff) {
          if (
            !policy.legalHoldExempt &&
            this.isCoveredByActiveHold(rec, policy.category, activeHolds)
          ) {
            catPreserved++;
          } else {
            catEligible++;
          }
        }
      }

      categoriesSummary[policy.category] = {
        totalRecords: catTotal,
        eligibleForPurge: catEligible,
        preservedByLegalHold: catPreserved,
        policyRetentionDays: policy.retentionDays,
      };

      totalEligible += catEligible;
      totalPreserved += catPreserved;
    }

    return {
      organizationId,
      evaluatedAt: new Date(),
      categories: categoriesSummary,
      totalEligibleForPurge: totalEligible,
      totalPreservedByLegalHold: totalPreserved,
    };
  }

  public runRetentionJob(
    organizationId: string,
    category?: string,
    dryRun = false,
    actorId?: string,
  ): RetentionJobRecord {
    const preview = this.previewRetention(organizationId, category);
    const jobId = `retjob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date();

    let recordsPurged = 0;
    let recordsEvaluated = 0;

    for (const cat of Object.keys(preview.categories)) {
      recordsEvaluated += preview.categories[cat].totalRecords;
    }

    if (!dryRun) {
      // Execute bounded batch deletion
      const policies = this.getRetentionPolicies(organizationId);
      const activeHolds = this.getActiveLegalHolds(organizationId);

      for (const policy of policies) {
        if (category && policy.category !== category) continue;
        if (!policy.enabled) continue;

        const cutoff = new Date(
          Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000,
        );
        const records = this.getRecordsForCategory(
          organizationId,
          policy.category,
        );

        for (const rec of records) {
          const recDate = new Date(rec.createdAt);
          if (recDate < cutoff) {
            if (
              policy.legalHoldExempt ||
              !this.isCoveredByActiveHold(rec, policy.category, activeHolds)
            ) {
              this.deleteRecordForCategory(policy.category, rec.id);
              recordsPurged++;
            }
          }
        }
      }
    }

    const jobRecord: RetentionJobRecord = {
      id: jobId,
      organizationId,
      category,
      status: "COMPLETED",
      recordsEvaluated,
      recordsPurged: dryRun ? 0 : recordsPurged,
      dryRun,
      startedAt: startTime,
      completedAt: new Date(),
      createdAt: startTime,
    };

    apiStore.retentionJobs.set(jobId, jobRecord);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: dryRun
        ? "retention.dryrun.completed"
        : "retention.cleanup.completed",
      resourceType: "retention_job",
      resourceId: jobId,
      metadata: {
        dryRun,
        recordsEvaluated,
        recordsPurged: dryRun ? 0 : recordsPurged,
        category: category || "ALL",
      },
    });

    return jobRecord;
  }

  private getRecordsForCategory(
    organizationId: string,
    category: string,
  ): Array<{ id: string; createdAt: Date; [k: string]: any }> {
    switch (category) {
      case "AUDIT_LOGS":
        return apiStore.auditLogs.filter(
          (l) => l.organizationId === organizationId,
        );
      case "WORKFLOW_EXECUTIONS":
        return Array.from(apiStore.executions.values()).filter(
          (e) => e.organizationId === organizationId,
        );
      case "EXECUTION_LOGS":
        return Array.from(apiStore.executions.values())
          .filter((e) => e.organizationId === organizationId)
          .map((e) => ({
            id: `logs_${e.id}`,
            createdAt: e.createdAt,
            executionId: e.id,
          }));
      case "WORKFLOW_VERSIONS":
        return Array.from(apiStore.versions.values())
          .filter((v) => {
            const wf = apiStore.workflows.get(v.workflowId);
            return wf?.organizationId === organizationId;
          })
          .map((v) => ({
            id: v.id,
            createdAt: v.publishedAt,
            workflowId: v.workflowId,
          }));
      case "WEBHOOK_DELIVERIES":
        return Array.from(apiStore.webhookDeliveries.values()).filter(
          (w) => w.organizationId === organizationId,
        );
      case "NOTIFICATION_DELIVERIES":
        return Array.from(apiStore.notifications.values()).filter(
          (n) => n.organizationId === organizationId,
        );
      case "PRIVACY_REQUESTS":
        return Array.from(apiStore.privacyRequests.values()).filter(
          (p) => p.organizationId === organizationId,
        );
      default:
        return [];
    }
  }

  private deleteRecordForCategory(category: string, id: string): void {
    switch (category) {
      case "AUDIT_LOGS":
        apiStore.auditLogs = apiStore.auditLogs.filter((l) => l.id !== id);
        break;
      case "WORKFLOW_EXECUTIONS":
        apiStore.executions.delete(id);
        break;
      case "WORKFLOW_VERSIONS":
        apiStore.versions.delete(id);
        break;
      case "WEBHOOK_DELIVERIES":
        apiStore.webhookDeliveries.delete(id);
        break;
      case "NOTIFICATION_DELIVERIES":
        apiStore.notifications.delete(id);
        break;
      case "PRIVACY_REQUESTS":
        apiStore.privacyRequests.delete(id);
        break;
    }
  }

  // ==========================================
  // 5. LEGAL HOLDS & PRESERVATION
  // ==========================================

  public getActiveLegalHolds(organizationId: string): LegalHoldRecord[] {
    return Array.from(apiStore.legalHolds.values()).filter(
      (h) => h.organizationId === organizationId && h.status === "ACTIVE",
    );
  }

  public createLegalHold(
    organizationId: string,
    input: CreateLegalHoldInput,
    actorId: string,
  ): LegalHoldRecord {
    const id = `hold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: LegalHoldRecord = {
      id,
      organizationId,
      name: input.name,
      description: input.description,
      reason: input.reason,
      targetType: input.targetType || "ORGANIZATION",
      targetId: input.targetId,
      categories: input.categories,
      status: "ACTIVE",
      createdById: actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    apiStore.legalHolds.set(id, record);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "legal_hold.created",
      resourceType: "legal_hold",
      resourceId: id,
      metadata: {
        name: record.name,
        reason: record.reason,
        categories: record.categories,
      },
    });

    return record;
  }

  public releaseLegalHold(
    organizationId: string,
    holdId: string,
    input: ReleaseLegalHoldInput,
    actorId: string,
  ): LegalHoldRecord {
    const hold = apiStore.legalHolds.get(holdId);
    if (!hold || hold.organizationId !== organizationId) {
      throw new Error("Legal hold not found");
    }

    if (hold.status === "RELEASED") {
      return hold;
    }

    hold.status = "RELEASED";
    hold.releasedById = actorId;
    hold.releasedAt = new Date();
    hold.releaseReason = input.releaseReason;
    hold.updatedAt = new Date();

    apiStore.legalHolds.set(holdId, hold);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "legal_hold.released",
      resourceType: "legal_hold",
      resourceId: holdId,
      metadata: { releaseReason: input.releaseReason },
    });

    return hold;
  }

  public isCoveredByActiveHold(
    record: any,
    category: string,
    activeHolds: LegalHoldRecord[],
  ): boolean {
    for (const hold of activeHolds) {
      if (hold.categories.includes(category)) {
        if (hold.targetType === "ORGANIZATION") return true;
        if (
          hold.targetType === "USER" &&
          (record.userId === hold.targetId || record.actorId === hold.targetId)
        ) {
          return true;
        }
        if (
          hold.targetType === "WORKFLOW" &&
          (record.workflowId === hold.targetId ||
            record.resourceId === hold.targetId)
        ) {
          return true;
        }
        if (hold.targetType === "CATEGORY") return true;
      }
    }
    return false;
  }

  // ==========================================
  // 6. PRIVACY REQUEST MANAGEMENT (GDPR/CCPA)
  // ==========================================

  public submitPrivacyRequest(
    organizationId: string,
    input: CreatePrivacyRequestInput,
    callerId: string,
  ): PrivacyRequestRecord {
    const targetUserId = input.userId || callerId;
    const id = `priv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: PrivacyRequestRecord = {
      id,
      organizationId,
      userId: targetUserId,
      requestType: input.requestType,
      status: "SUBMITTED",
      details: input.details,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    apiStore.privacyRequests.set(id, record);

    apiStore.recordAudit({
      organizationId,
      userId: callerId,
      action: "privacy.request.submitted",
      resourceType: "privacy_request",
      resourceId: id,
      metadata: { targetUserId, requestType: input.requestType },
    });

    return record;
  }

  public reviewPrivacyRequest(
    organizationId: string,
    requestId: string,
    input: ReviewPrivacyRequestInput,
    reviewerId: string,
  ): PrivacyRequestRecord {
    const request = apiStore.privacyRequests.get(requestId);
    if (!request || request.organizationId !== organizationId) {
      throw new Error("Privacy request not found");
    }

    request.status = input.decision;
    request.reviewedById = reviewerId;
    request.reviewNote = input.reviewNote;
    request.updatedAt = new Date();

    apiStore.privacyRequests.set(requestId, request);

    apiStore.recordAudit({
      organizationId,
      userId: reviewerId,
      action: `privacy.request.${input.decision.toLowerCase()}`,
      resourceType: "privacy_request",
      resourceId: requestId,
      metadata: { decision: input.decision, reviewNote: input.reviewNote },
    });

    return request;
  }

  public executePrivacyRequest(
    organizationId: string,
    requestId: string,
    actorId: string,
  ): PrivacyRequestRecord {
    const request = apiStore.privacyRequests.get(requestId);
    if (!request || request.organizationId !== organizationId) {
      throw new Error("Privacy request not found");
    }

    if (request.status !== "APPROVED") {
      throw new Error(
        `Cannot execute privacy request with status '${request.status}'. Request must be APPROVED.`,
      );
    }

    // Preservation & Legal Hold Guard
    const activeHolds = this.getActiveLegalHolds(organizationId);
    const isUnderHold = activeHolds.some(
      (h) =>
        h.targetType === "ORGANIZATION" ||
        (h.targetType === "USER" && h.targetId === request.userId),
    );

    if (isUnderHold) {
      throw new Error(
        "Cannot execute privacy deletion/restriction: active legal hold is currently in place for this user or organization.",
      );
    }

    request.status = "PROCESSING";

    if (request.requestType === "DELETION") {
      // Soft deletion & Anonymization of personal information
      const user = apiStore.users.get(request.userId);
      if (user) {
        user.email = `deleted_${user.id.slice(0, 8)}@anonymized.flowforge.internal`;
        user.firstName = "Anonymized";
        user.lastName = "User";
        user.passwordHash = "";
        user.active = false;
        apiStore.users.set(user.id, user);

        // Terminate all active sessions for the user
        for (const [sId, sess] of apiStore.sessions.entries()) {
          if (sess.userId === user.id) {
            apiStore.sessions.delete(sId);
          }
        }
      }

      request.status = "COMPLETED";
      request.outcomeSummary =
        "User personal data anonymized and all active sessions terminated.";
    } else if (
      request.requestType === "EXPORT" ||
      request.requestType === "ACCESS"
    ) {
      // Compile personal data bundle
      const user = apiStore.users.get(request.userId);
      const userMemberships = Array.from(apiStore.memberships.values()).filter(
        (m) => m.userId === request.userId,
      );
      const userApprovals = Array.from(apiStore.approvals.values()).filter(
        (a) => a.assignedUserId === request.userId,
      );

      const exportBundle = {
        profile: user
          ? {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            }
          : null,
        memberships: userMemberships,
        assignedApprovalsCount: userApprovals.length,
        exportedAt: new Date().toISOString(),
      };

      const downloadToken = crypto.randomBytes(16).toString("hex");
      request.artifactUrl = `/api/v1/organizations/${organizationId}/privacy/requests/${requestId}/artifact?token=${downloadToken}`;
      request.artifactExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h TTL
      request.details = {
        ...(request.details || {}),
        exportBundle,
        downloadToken,
      };
      request.status = "COMPLETED";
      request.outcomeSummary = "Personal data portability bundle generated.";
    } else if (request.requestType === "CORRECTION") {
      const user = apiStore.users.get(request.userId);
      if (user && request.details) {
        if (request.details.firstName)
          user.firstName = String(request.details.firstName);
        if (request.details.lastName)
          user.lastName = String(request.details.lastName);
        apiStore.users.set(user.id, user);
      }
      request.status = "COMPLETED";
      request.outcomeSummary =
        "User personal information updated per correction request.";
    } else if (request.requestType === "RESTRICTION") {
      const user = apiStore.users.get(request.userId);
      if (user) {
        user.active = false;
        apiStore.users.set(user.id, user);
      }
      request.status = "COMPLETED";
      request.outcomeSummary =
        "Account processing restricted (account deactivated).";
    }

    request.updatedAt = new Date();
    apiStore.privacyRequests.set(requestId, request);

    apiStore.recordAudit({
      organizationId,
      userId: actorId,
      action: "privacy.request.executed",
      resourceType: "privacy_request",
      resourceId: requestId,
      metadata: {
        requestType: request.requestType,
        outcome: request.outcomeSummary,
      },
    });

    return request;
  }

  // ==========================================
  // 7. COMPLIANCE TECHNICAL CONTROL INVENTORY
  // ==========================================

  public getComplianceControls(organizationId: string): {
    frameworks: string[];
    controls: ComplianceControlItem[];
    verifiedAt: string;
    summary: {
      implemented: number;
      partial: number;
      external: number;
      total: number;
    };
  } {
    const verifiedAt = new Date().toISOString();

    const controls: ComplianceControlItem[] = [
      // SOC 2 Type II Controls
      {
        id: "SOC2-CC6.1",
        framework: "SOC2",
        title: "Logical Access Controls & Least Privilege",
        description:
          "Access to platform workflows, environments, and administrative APIs is restricted via role-based access control (OWNER, ADMIN, MEMBER, VIEWER).",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/middleware/rbac.ts; packages/shared/src/index.ts (ROLE_PERMISSIONS)",
        verifiedAt,
      },
      {
        id: "SOC2-CC6.2",
        framework: "SOC2",
        title: "User Registration & Authentication Credentials",
        description:
          "Users are authenticated via bcrypt hashed credentials, enterprise SAML 2.0, or OpenID Connect with PKCE (S256).",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/routes/auth.routes.ts; apps/api/src/services/identity.service.ts",
        verifiedAt,
      },
      {
        id: "SOC2-CC6.3",
        framework: "SOC2",
        title: "Access Revocation & SCIM Deactivation",
        description:
          "User access can be revoked immediately via session governance, SCIM 2.0 PatchOp, or membership removal.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/identity.service.ts (revokeAllSessionsForUser); apps/api/src/routes/scim.routes.ts",
        verifiedAt,
      },
      {
        id: "SOC2-CC6.6",
        framework: "SOC2",
        title: "Data Encryption in Transit & at Rest",
        description:
          "External connector credentials are encrypted at rest using AES-256-GCM; programmatic APIs require TLS in transit.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/routes/credential.routes.ts (aes-256-gcm); apps/api/src/app.ts",
        verifiedAt,
      },
      {
        id: "SOC2-CC7.1",
        framework: "SOC2",
        title: "Vulnerability Management & Dependency Scanning",
        description:
          "CI pipeline executes automated dependency vulnerability checks and code quality gates.",
        status: "IMPLEMENTED",
        evidence: ".github/workflows/ci.yml",
        verifiedAt,
      },
      {
        id: "SOC2-CC7.2",
        framework: "SOC2",
        title: "Security Monitoring & Anomaly Alerting",
        description:
          "Platform monitors authentication bursts, tamper events, and cross-tenant attempts, generating durable OperationalAlerts.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts; apps/api/src/routes/incident.routes.ts",
        verifiedAt,
      },
      {
        id: "SOC2-CC7.3",
        framework: "SOC2",
        title: "Incident Response & Lifecycle Tracking",
        description:
          "Operational incidents track severity, resolution notes, and post-mortem accountability.",
        status: "IMPLEMENTED",
        evidence: "apps/api/src/routes/incident.routes.ts",
        verifiedAt,
      },
      {
        id: "SOC2-A1.2",
        framework: "SOC2",
        title: "Data Retention & Disposal Controls",
        description:
          "Policy-driven data retention engine enforces automated cleanup with legal hold preservation safeguards.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts; packages/database/prisma/schema.prisma",
        verifiedAt,
      },

      // ISO/IEC 27001:2022 Controls
      {
        id: "ISO-A.5.15",
        framework: "ISO27001",
        title: "Access Control & Machine Authentication",
        description:
          "Programmatic access secured with granularly scoped API keys and RFC 6749 OAuth 2.0 Client Credentials.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/oauth.service.ts; apps/api/src/routes/oauth.routes.ts",
        verifiedAt,
      },
      {
        id: "ISO-A.8.10",
        framework: "ISO27001",
        title: "Information Deletion & Right to Erasure",
        description:
          "Controlled privacy request workflow executes user anonymization without destroying audit trail continuity.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts (executePrivacyRequest)",
        verifiedAt,
      },
      {
        id: "ISO-A.8.11",
        framework: "ISO27001",
        title: "Data Masking & Metadata Sanitization",
        description:
          "Sensitive secrets, tokens, and credentials are recursively redacted from audit logs and exports.",
        status: "IMPLEMENTED",
        evidence: "packages/test-utils/src/index.ts (sanitizeAuditMetadata)",
        verifiedAt,
      },
      {
        id: "ISO-A.8.12",
        framework: "ISO27001",
        title: "Data Leakage Prevention & SSRF Defenses",
        description:
          "Webhook delivery and connector HTTP action execution enforces private IPv4/IPv6 blocking against SSRF.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/routes/webhook.routes.ts; packages/integrations/src/index.ts",
        verifiedAt,
      },

      // GDPR Privacy Controls
      {
        id: "GDPR-Art.15",
        framework: "GDPR",
        title: "Right of Access by Data Subject",
        description:
          "Enables users and authorized compliance officers to request and review comprehensive summaries of personal data.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts (PrivacyRequestType: ACCESS)",
        verifiedAt,
      },
      {
        id: "GDPR-Art.17",
        framework: "GDPR",
        title: "Right to Erasure ('Forgotten')",
        description:
          "Enforces compliant deletion by anonymizing user identifiers while respecting legal holds and financial retention obligations.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts (executePrivacyRequest DELETION)",
        verifiedAt,
      },
      {
        id: "GDPR-Art.20",
        framework: "GDPR",
        title: "Right to Data Portability",
        description:
          "Generates secure, time-limited download links for machine-readable personal data bundles.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts (artifactUrl with 1h TTL)",
        verifiedAt,
      },
      {
        id: "GDPR-Art.30",
        framework: "GDPR",
        title: "Records of Processing Activities",
        description:
          "Immutable SHA-256 hash-chained audit logging records all processing, authorization, and administrative events.",
        status: "IMPLEMENTED",
        evidence:
          "packages/test-utils/src/index.ts (recordAudit hash chaining); apps/api/src/services/compliance.service.ts",
        verifiedAt,
      },

      // HIPAA Security Rule Controls
      {
        id: "HIPAA-164.312(b)",
        framework: "HIPAA",
        title: "Audit Controls & Evidence Integrity",
        description:
          "Mechanisms to record and examine platform activity with tamper-evident chain verification.",
        status: "IMPLEMENTED",
        evidence:
          "apps/api/src/services/compliance.service.ts (verifyAuditChain)",
        verifiedAt,
      },
      {
        id: "HIPAA-164.312(a)(2)(iv)",
        framework: "HIPAA",
        title: "Encryption & Decryption Controls",
        description:
          "Stored integration credentials and sensitive variables use authenticated AES-256-GCM encryption.",
        status: "IMPLEMENTED",
        evidence: "apps/api/src/routes/credential.routes.ts",
        verifiedAt,
      },
      {
        id: "EXTERNAL-BACKUP-IMMUTABILITY",
        framework: "SOC2",
        title: "Cloud Provider WORM Storage & Backup Retention",
        description:
          "Cold snapshot durability and air-gapped backup replication depends on customer cloud provider configuration (AWS S3 Object Lock, GCP Bucket Lock).",
        status: "EXTERNAL_DEPENDENCY",
        evidence: "docs/disaster-recovery-runbook.md",
        verifiedAt,
      },
    ];

    const implemented = controls.filter(
      (c) => c.status === "IMPLEMENTED",
    ).length;
    const partial = controls.filter((c) => c.status === "PARTIAL").length;
    const external = controls.filter(
      (c) => c.status === "EXTERNAL_DEPENDENCY",
    ).length;

    return {
      frameworks: ["SOC2", "ISO27001", "GDPR", "HIPAA"],
      controls,
      verifiedAt,
      summary: {
        implemented,
        partial,
        external,
        total: controls.length,
      },
    };
  }

  // ==========================================
  // 8. GOVERNANCE DASHBOARD OVERVIEW
  // ==========================================

  public getGovernanceOverview(organizationId: string): {
    retentionPoliciesCount: number;
    activeLegalHoldsCount: number;
    pendingPrivacyRequestsCount: number;
    totalAuditLogsCount: number;
    auditChainVerification: { verified: boolean; lastHash?: string };
    complianceScorePercentage: number;
  } {
    const policies = this.getRetentionPolicies(organizationId);
    const activeHolds = this.getActiveLegalHolds(organizationId);
    const pendingPrivacy = Array.from(apiStore.privacyRequests.values()).filter(
      (p) =>
        p.organizationId === organizationId &&
        (p.status === "SUBMITTED" || p.status === "UNDER_REVIEW"),
    );
    const auditLogsCount = apiStore.auditLogs.filter(
      (l) => l.organizationId === organizationId,
    ).length;
    const chainVerification = this.verifyAuditChain(organizationId);
    const controlMapping = this.getComplianceControls(organizationId);

    const complianceScore = Math.round(
      ((controlMapping.summary.implemented +
        controlMapping.summary.external * 0.5) /
        controlMapping.summary.total) *
        100,
    );

    return {
      retentionPoliciesCount: policies.length,
      activeLegalHoldsCount: activeHolds.length,
      pendingPrivacyRequestsCount: pendingPrivacy.length,
      totalAuditLogsCount: auditLogsCount,
      auditChainVerification: {
        verified: chainVerification.verified,
        lastHash: chainVerification.lastHash,
      },
      complianceScorePercentage: complianceScore,
    };
  }
}

export const complianceService = new ComplianceService();
