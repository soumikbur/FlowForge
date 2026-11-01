import crypto from "crypto";
import {
  PlanRecord,
  PlanEntitlements,
  SubscriptionRecord,
  UsageRecord,
  InvoiceRecord,
  DEFAULT_PLANS,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import {
  defaultBillingProvider,
  BillingProviderAdapter,
} from "./billing.provider.js";

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?:
    | "QUOTA_EXCEEDED"
    | "CONCURRENT_EXECUTION_LIMIT_EXCEEDED"
    | "SUBSCRIPTION_SUSPENDED"
    | "FEATURE_NOT_IN_PLAN";
  message?: string;
  metric?: string;
  limit?: number;
  currentUsage?: number;
  remaining?: number;
  details?: Record<string, unknown>;
}

export interface MetricUsageDetails {
  current: number;
  limit: number;
  unlimited: boolean;
  percentage: number;
  warningThresholdReached: boolean;
  exceeded: boolean;
}

export interface UsageSummary {
  organizationId: string;
  plan: PlanRecord;
  subscription: SubscriptionRecord | null;
  periodStart: Date;
  periodEnd: Date;
  metrics: {
    monthlyExecutions: MetricUsageDetails;
    concurrentExecutions: MetricUsageDetails;
    activeWorkflows: MetricUsageDetails;
    totalWorkflows: MetricUsageDetails;
    seats: MetricUsageDetails;
    connectors: MetricUsageDetails;
  };
  features: PlanEntitlements;
}

export class EntitlementService {
  constructor(
    private provider: BillingProviderAdapter = defaultBillingProvider,
  ) {}

  /**
   * 1. Get current subscription for organization
   */
  getSubscription(organizationId: string): SubscriptionRecord | null {
    const subs = Array.from(apiStore.subscriptions.values())
      .filter((s) => s.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Prefer ACTIVE, TRIALING, PAST_DUE over CANCELLED/EXPIRED
    const activeSub = subs.find(
      (s) =>
        s.status === "ACTIVE" ||
        s.status === "TRIALING" ||
        s.status === "PAST_DUE" ||
        s.status === "SUSPENDED",
    );
    return activeSub || subs[0] || null;
  }

  /**
   * 2. Get effective plan for organization (defaults to Free, merges Enterprise License if active)
   */
  getEffectivePlan(organizationId: string): PlanRecord {
    const sub = this.getSubscription(organizationId);
    let basePlan = DEFAULT_PLANS.free;
    if (sub && sub.status !== "EXPIRED" && sub.status !== "CANCELLED") {
      basePlan =
        apiStore.plans.get(sub.planId) ||
        apiStore.plans.get(DEFAULT_PLANS.free.id)!;
    }

    // Check for active Enterprise License overrides
    const license = Array.from(apiStore.enterpriseLicenses.values()).find(
      (l) => l.organizationId === organizationId && l.status === "ACTIVE",
    );

    if (license) {
      const isExpired =
        license.expiresAt && new Date(license.expiresAt) <= new Date();
      if (!isExpired) {
        const overrides = (license.customEntitlements ||
          {}) as Partial<PlanEntitlements>;
        return {
          ...basePlan,
          name: `${basePlan.name} (Enterprise Licensed)`,
          entitlements: {
            ...basePlan.entitlements,
            hasWhiteLabel: true,
            hasCustomDomains: true,
            ...overrides,
          },
        };
      }
    }

    return basePlan;
  }

  /**
   * 3. Get current billing period
   */
  getCurrentBillingPeriod(organizationId: string): {
    periodStart: Date;
    periodEnd: Date;
  } {
    const sub = this.getSubscription(organizationId);
    if (sub && sub.currentPeriodStart && sub.currentPeriodEnd) {
      return {
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
      };
    }

    const now = new Date();
    return {
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    };
  }

  /**
   * 4. Check whether organization is suspended
   */
  isSuspended(organizationId: string): boolean {
    const sub = this.getSubscription(organizationId);
    if (!sub) return false;

    // Check if delinquent grace period has elapsed
    if (
      sub.status === "PAST_DUE" &&
      sub.gracePeriodEnd &&
      sub.gracePeriodEnd < new Date()
    ) {
      sub.status = "SUSPENDED";
      apiStore.subscriptions.set(sub.id, sub);
      return true;
    }

    return sub.status === "SUSPENDED";
  }

  /**
   * 5. Check execution quota (monthly & concurrent limits)
   */
  checkExecutionQuota(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message:
          "Subscription is suspended due to payment delinquency. Please update billing payment information to resume executions.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    const entitlements = plan.entitlements;

    // Check concurrent executions limit
    if (entitlements.maxConcurrentExecutions !== -1) {
      const runningCount = Array.from(apiStore.executions.values()).filter(
        (e) => e.organizationId === organizationId && e.status === "RUNNING",
      ).length;

      if (runningCount >= entitlements.maxConcurrentExecutions) {
        return {
          allowed: false,
          reason: "CONCURRENT_EXECUTION_LIMIT_EXCEEDED",
          message: `Concurrent execution limit reached (${runningCount}/${entitlements.maxConcurrentExecutions}). Upgrade plan or wait for in-flight executions to finish.`,
          metric: "concurrent_executions",
          limit: entitlements.maxConcurrentExecutions,
          currentUsage: runningCount,
          remaining: 0,
        };
      }
    }

    // Check monthly executions quota
    if (entitlements.maxMonthlyExecutions !== -1) {
      const { periodStart, periodEnd } =
        this.getCurrentBillingPeriod(organizationId);
      const monthlyUsage = Array.from(apiStore.usageRecords.values())
        .filter(
          (u) =>
            u.organizationId === organizationId &&
            u.metric === "WORKFLOW_EXECUTION" &&
            u.recordedAt >= periodStart &&
            u.recordedAt <= periodEnd,
        )
        .reduce((sum, u) => sum + u.quantity, 0);

      if (monthlyUsage >= entitlements.maxMonthlyExecutions) {
        return {
          allowed: false,
          reason: "QUOTA_EXCEEDED",
          message: `Monthly workflow execution quota exceeded (${monthlyUsage}/${entitlements.maxMonthlyExecutions}). Please upgrade your plan.`,
          metric: "monthly_executions",
          limit: entitlements.maxMonthlyExecutions,
          currentUsage: monthlyUsage,
          remaining: 0,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 6. Check total workflow creation quota
   */
  checkWorkflowCreationQuota(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (plan.entitlements.maxWorkflows === -1) return { allowed: true };

    const count = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === organizationId && !w.deletedAt,
    ).length;

    if (count >= plan.entitlements.maxWorkflows) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `Maximum workflow limit (${count}/${plan.entitlements.maxWorkflows}) reached for current plan. Upgrade to create more workflows.`,
        metric: "max_workflows",
        limit: plan.entitlements.maxWorkflows,
        currentUsage: count,
        remaining: 0,
      };
    }

    return { allowed: true };
  }

  /**
   * 7. Check active workflow publishing/activation quota
   */
  checkActiveWorkflowQuota(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (plan.entitlements.maxActiveWorkflows === -1) return { allowed: true };

    const activeCount = Array.from(apiStore.workflows.values()).filter(
      (w) =>
        w.organizationId === organizationId &&
        !w.deletedAt &&
        w.status === "ACTIVE",
    ).length;

    if (activeCount >= plan.entitlements.maxActiveWorkflows) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `Maximum active workflows quota (${activeCount}/${plan.entitlements.maxActiveWorkflows}) reached. Upgrade or archive an active workflow.`,
        metric: "active_workflows",
        limit: plan.entitlements.maxActiveWorkflows,
        currentUsage: activeCount,
        remaining: 0,
      };
    }

    return { allowed: true };
  }

  /**
   * 8. Check seat quota on user invitations/additions
   */
  checkSeatQuota(
    organizationId: string,
    additionalSeats: number = 1,
  ): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (plan.entitlements.maxSeats === -1) return { allowed: true };

    const currentSeats = Array.from(apiStore.memberships.values()).filter(
      (m) => m.organizationId === organizationId,
    ).length;

    if (currentSeats + additionalSeats > plan.entitlements.maxSeats) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `Seat quota exceeded (${currentSeats}/${plan.entitlements.maxSeats}). Upgrade to invite additional team members.`,
        metric: "seats",
        limit: plan.entitlements.maxSeats,
        currentUsage: currentSeats,
        remaining: Math.max(0, plan.entitlements.maxSeats - currentSeats),
      };
    }

    return { allowed: true };
  }

  /**
   * 9. Check connector configuration quota
   */
  checkConnectorQuota(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (plan.entitlements.maxConnectors === -1) return { allowed: true };

    const currentConnectors = Array.from(apiStore.connections.values()).filter(
      (c) => c.organizationId === organizationId && c.status !== "REVOKED",
    ).length;

    if (currentConnectors >= plan.entitlements.maxConnectors) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `Maximum connector quota reached (${currentConnectors}/${plan.entitlements.maxConnectors}). Upgrade to configure additional connectors.`,
        metric: "connectors",
        limit: plan.entitlements.maxConnectors,
        currentUsage: currentConnectors,
        remaining: 0,
      };
    }

    return { allowed: true };
  }

  /**
   * 10. Check workspace creation quota
   */
  checkWorkspaceQuota(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    const maxWorkspaces = plan.entitlements.maxWorkspaces ?? 1;
    if (maxWorkspaces === -1) return { allowed: true };

    const count = Array.from(apiStore.workspaces.values()).filter(
      (w) => w.organizationId === organizationId && w.status !== "ARCHIVED",
    ).length;

    if (count >= maxWorkspaces) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `Maximum active workspaces limit (${count}/${maxWorkspaces}) reached for your plan. Upgrade your plan or apply an enterprise license to add more workspaces.`,
        metric: "workspaces",
        limit: maxWorkspaces,
        currentUsage: count,
        remaining: 0,
      };
    }

    return { allowed: true };
  }

  /**
   * 11. Check white-label custom branding access
   */
  checkWhiteLabelAccess(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (!plan.entitlements.hasWhiteLabel) {
      return {
        allowed: false,
        reason: "FEATURE_NOT_IN_PLAN",
        message:
          "White-label custom branding requires a plan with white-labeling enabled or an active Enterprise license.",
      };
    }

    return { allowed: true };
  }

  /**
   * 12. Check custom domain access
   */
  checkCustomDomainAccess(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (!plan.entitlements.hasCustomDomains) {
      return {
        allowed: false,
        reason: "FEATURE_NOT_IN_PLAN",
        message:
          "Custom domains require a plan with custom domain support or an active Enterprise license.",
      };
    }

    return { allowed: true };
  }

  /**
   * 13. Check Enterprise SSO / SAML / OIDC / SCIM access
   */
  checkSsoAccess(organizationId: string): EntitlementCheckResult {
    if (this.isSuspended(organizationId)) {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_SUSPENDED",
        message: "Organization subscription is suspended.",
      };
    }

    const plan = this.getEffectivePlan(organizationId);
    if (!plan.entitlements.hasSso) {
      return {
        allowed: false,
        reason: "FEATURE_NOT_IN_PLAN",
        message:
          "Enterprise Single Sign-On (SSO) and SCIM provisioning require an Enterprise plan or an active Enterprise license.",
      };
    }

    return { allowed: true };
  }

  /**
   * 14. Check feature access (analytics, governance, SSO, etc.)
   */
  checkFeatureAccess(
    organizationId: string,
    feature: keyof PlanEntitlements,
  ): boolean {
    const plan = this.getEffectivePlan(organizationId);
    return Boolean(plan.entitlements[feature]);
  }

  /**
   * 11. Record durable usage event with idempotency protection
   */
  recordUsage(params: {
    organizationId: string;
    metric:
      | "WORKFLOW_EXECUTION"
      | "CONNECTOR_INVOCATION"
      | "API_REQUEST"
      | "AI_REQUEST"
      | "AI_TOKEN";
    quantity?: number;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): UsageRecord {
    const qty = params.quantity ?? 1;

    // Check idempotency key deduplication
    if (params.idempotencyKey) {
      const existing = Array.from(apiStore.usageRecords.values()).find(
        (u) =>
          u.organizationId === params.organizationId &&
          u.metric === params.metric &&
          u.idempotencyKey === params.idempotencyKey,
      );
      if (existing) {
        return existing;
      }
    }

    const sub = this.getSubscription(params.organizationId);
    const { periodStart, periodEnd } = this.getCurrentBillingPeriod(
      params.organizationId,
    );

    const record: UsageRecord = {
      id: `usage_${crypto.randomUUID()}`,
      organizationId: params.organizationId,
      subscriptionId: sub?.id,
      metric: params.metric,
      quantity: qty,
      idempotencyKey: params.idempotencyKey,
      periodStart,
      periodEnd,
      metadata: params.metadata || {},
      recordedAt: new Date(),
    };

    apiStore.usageRecords.set(record.id, record);

    // Threshold check for notifications
    if (params.metric === "WORKFLOW_EXECUTION") {
      this.evaluateUsageThresholdNotification(params.organizationId);
    }

    return record;
  }

  /**
   * 12. Evaluate usage against thresholds (80%, 100%) and notify
   */
  private evaluateUsageThresholdNotification(organizationId: string): void {
    const plan = this.getEffectivePlan(organizationId);
    if (plan.entitlements.maxMonthlyExecutions === -1) return;

    const { periodStart, periodEnd } =
      this.getCurrentBillingPeriod(organizationId);
    const totalUsage = Array.from(apiStore.usageRecords.values())
      .filter(
        (u) =>
          u.organizationId === organizationId &&
          u.metric === "WORKFLOW_EXECUTION" &&
          u.recordedAt >= periodStart &&
          u.recordedAt <= periodEnd,
      )
      .reduce((sum, u) => sum + u.quantity, 0);

    const limit = plan.entitlements.maxMonthlyExecutions;
    const ratio = totalUsage / limit;

    if (ratio >= 1.0) {
      apiStore.createNotification({
        organizationId,
        userId: "system",
        category: "SYSTEM",
        priority: "URGENT",
        title: "Workflow Execution Quota Exhausted",
        message: `Your organization has reached 100% of its monthly execution limit (${totalUsage}/${limit}). Executions are currently paused until upgrade or next billing cycle.`,
      });
    } else if (ratio >= 0.8 && ratio < 0.85) {
      // 80% threshold warning (sent once around boundary)
      apiStore.createNotification({
        organizationId,
        userId: "system",
        category: "SYSTEM",
        priority: "HIGH",
        title: "Approaching Monthly Execution Quota",
        message: `Your organization has consumed ${Math.round(ratio * 100)}% of its monthly execution quota (${totalUsage}/${limit}). Consider upgrading your plan to prevent service interruption.`,
      });
    }
  }

  /**
   * 13. Get comprehensive usage summary for organization
   */
  getUsageSummary(organizationId: string): UsageSummary {
    const plan = this.getEffectivePlan(organizationId);
    const sub = this.getSubscription(organizationId);
    const { periodStart, periodEnd } =
      this.getCurrentBillingPeriod(organizationId);

    // Monthly executions
    const monthlyExecUsage = Array.from(apiStore.usageRecords.values())
      .filter(
        (u) =>
          u.organizationId === organizationId &&
          u.metric === "WORKFLOW_EXECUTION" &&
          u.recordedAt >= periodStart &&
          u.recordedAt <= periodEnd,
      )
      .reduce((sum, u) => sum + u.quantity, 0);

    // Concurrent executions
    const concurrentRunning = Array.from(apiStore.executions.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "RUNNING",
    ).length;

    // Active workflows
    const activeWfCount = Array.from(apiStore.workflows.values()).filter(
      (w) =>
        w.organizationId === organizationId &&
        !w.deletedAt &&
        w.status === "ACTIVE",
    ).length;

    // Total workflows
    const totalWfCount = Array.from(apiStore.workflows.values()).filter(
      (w) => w.organizationId === organizationId && !w.deletedAt,
    ).length;

    // Seats
    const seatsCount = Array.from(apiStore.memberships.values()).filter(
      (m) => m.organizationId === organizationId,
    ).length;

    // Connectors
    const connectorsCount = Array.from(apiStore.connections.values()).filter(
      (c) => c.organizationId === organizationId && c.status !== "REVOKED",
    ).length;

    const buildMetric = (
      current: number,
      limit: number,
    ): MetricUsageDetails => {
      const unlimited = limit === -1;
      const percentage = unlimited
        ? 0
        : Math.min(Math.round((current / limit) * 100), 100);
      return {
        current,
        limit,
        unlimited,
        percentage,
        warningThresholdReached: !unlimited && percentage >= 80,
        exceeded: !unlimited && current >= limit,
      };
    };

    return {
      organizationId,
      plan,
      subscription: sub,
      periodStart,
      periodEnd,
      metrics: {
        monthlyExecutions: buildMetric(
          monthlyExecUsage,
          plan.entitlements.maxMonthlyExecutions,
        ),
        concurrentExecutions: buildMetric(
          concurrentRunning,
          plan.entitlements.maxConcurrentExecutions,
        ),
        activeWorkflows: buildMetric(
          activeWfCount,
          plan.entitlements.maxActiveWorkflows,
        ),
        totalWorkflows: buildMetric(
          totalWfCount,
          plan.entitlements.maxWorkflows,
        ),
        seats: buildMetric(seatsCount, plan.entitlements.maxSeats),
        connectors: buildMetric(
          connectorsCount,
          plan.entitlements.maxConnectors,
        ),
      },
      features: plan.entitlements,
    };
  }

  /**
   * 14. Handle payment failure from webhook
   */
  handlePaymentFailure(
    providerSubscriptionId: string,
    reason?: string,
  ): SubscriptionRecord | null {
    const sub = Array.from(apiStore.subscriptions.values()).find(
      (s) => s.providerSubscriptionId === providerSubscriptionId,
    );
    if (!sub) return null;

    sub.status = "PAST_DUE";
    // 7-day grace period
    sub.gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    sub.updatedAt = new Date();
    apiStore.subscriptions.set(sub.id, sub);

    apiStore.createNotification({
      organizationId: sub.organizationId,
      userId: "billing",
      category: "SECURITY",
      priority: "URGENT",
      title: "Subscription Payment Failed",
      message: `Your payment failed. A 7-day grace period is active until ${sub.gracePeriodEnd.toISOString().split("T")[0]}. Please update your payment method to prevent account suspension. Reason: ${reason || "Card declined"}`,
    });

    apiStore.recordAudit({
      organizationId: sub.organizationId,
      action: "billing.payment_failed",
      resourceType: "subscription",
      resourceId: sub.id,
      metadata: { reason, gracePeriodEnd: sub.gracePeriodEnd },
    });

    return sub;
  }

  /**
   * 15. Handle payment success from webhook
   */
  handlePaymentSuccess(
    providerSubscriptionId: string,
    invoicePayload: any,
  ): { subscription: SubscriptionRecord; invoice: InvoiceRecord } | null {
    const sub = Array.from(apiStore.subscriptions.values()).find(
      (s) => s.providerSubscriptionId === providerSubscriptionId,
    );
    if (!sub) return null;

    // Restore to ACTIVE and clear grace period
    sub.status = "ACTIVE";
    sub.gracePeriodEnd = undefined;
    sub.updatedAt = new Date();
    apiStore.subscriptions.set(sub.id, sub);

    // Create / update invoice record
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const invoiceNumber =
      invoicePayload.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
    const invoiceRecord: InvoiceRecord = {
      id: invoiceId,
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      providerInvoiceId:
        invoicePayload.id || `in_${crypto.randomUUID().slice(0, 10)}`,
      invoiceNumber,
      currency: invoicePayload.currency?.toUpperCase() || "USD",
      subtotal: invoicePayload.subtotal ?? invoicePayload.amountPaid ?? 0,
      tax: invoicePayload.tax ?? 0,
      total: invoicePayload.total ?? invoicePayload.amountPaid ?? 0,
      amountPaid: invoicePayload.amountPaid ?? 0,
      status: "PAID",
      billingPeriodStart: sub.currentPeriodStart,
      billingPeriodEnd: sub.currentPeriodEnd,
      invoicePdfUrl:
        invoicePayload.invoicePdfUrl ||
        `https://invoices.flowforge.io/${invoiceNumber}.pdf`,
      hostedInvoiceUrl:
        invoicePayload.hostedInvoiceUrl ||
        `https://billing.stripe.com/invoice/${invoiceNumber}`,
      issuedAt: new Date(),
      paidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    apiStore.invoices.set(invoiceRecord.id, invoiceRecord);

    apiStore.recordAudit({
      organizationId: sub.organizationId,
      action: "billing.payment_succeeded",
      resourceType: "invoice",
      resourceId: invoiceRecord.id,
      metadata: {
        amountPaid: invoiceRecord.amountPaid,
        currency: invoiceRecord.currency,
      },
    });

    return { subscription: sub, invoice: invoiceRecord };
  }

  /**
   * 16. Reconcile subscription state with payment provider
   */
  async reconcileSubscription(organizationId: string): Promise<any> {
    const sub = this.getSubscription(organizationId);
    const result = sub
      ? await this.provider.reconcileSubscription(sub)
      : {
          synchronized: true,
          actionTaken: "NOOP",
          details: "Free plan without active provider subscription.",
        };

    apiStore.recordAudit({
      organizationId,
      action: "billing.reconcile",
      resourceType: "subscription",
      resourceId: sub ? sub.id : "free",
      metadata: result as any,
    });

    return result;
  }
}

export const entitlementService = new EntitlementService();
