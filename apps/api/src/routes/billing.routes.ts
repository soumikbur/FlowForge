import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateCheckoutSchema,
  CreatePortalSchema,
  UpgradeSubscriptionSchema,
  CancelSubscriptionSchema,
  SubscriptionRecord,
  BillingWebhookEventRecord,
  DEFAULT_PLANS,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { entitlementService } from "../services/entitlement.service.js";
import { defaultBillingProvider } from "../services/billing.provider.js";

export const billingRouter = Router();

// ==========================================
// 1. PUBLIC / AUTHENTICATED: Get Available Plans
// ==========================================
billingRouter.get("/plans", (req: Request, res: Response) => {
  const plans = Array.from(apiStore.plans.values())
    .filter(
      (p, index, self) => self.findIndex((item) => item.id === p.id) === index,
    ) // Unique by id
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => a.priceCents - b.priceCents);

  res.json({
    success: true,
    data: plans,
    error: null,
  });
});

// ==========================================
// 2. WEBHOOK ENDPOINT (Provider Auth via Signature)
// Must be registered BEFORE requireAuth middleware!
// ==========================================
billingRouter.post("/webhook", async (req: Request, res: Response) => {
  const signature =
    (req.headers["stripe-signature"] as string) ||
    (req.headers["x-billing-signature"] as string) ||
    "";

  const rawBody = req.body;
  const bodyString =
    typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);

  const isValid = defaultBillingProvider.verifyWebhookSignature(
    bodyString,
    signature,
  );
  if (!isValid) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_SIGNATURE",
        message: "Billing webhook signature verification failed.",
      },
    });
    return;
  }

  const event = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const provider = event.provider || "stripe";
  const eventId = event.id || `evt_${crypto.randomUUID()}`;
  const eventType = event.type || "unknown";

  // Deduplication check
  const existingEvent = Array.from(apiStore.billingWebhookEvents.values()).find(
    (e) => e.provider === provider && e.providerEventId === eventId,
  );

  if (existingEvent) {
    res.status(200).json({
      success: true,
      data: { duplicate: true, status: existingEvent.status },
      message: "Webhook event previously received and processed.",
    });
    return;
  }

  const webhookRecord: BillingWebhookEventRecord = {
    id: `bwe_${crypto.randomUUID()}`,
    provider,
    providerEventId: eventId,
    eventType,
    payload: event,
    status: "RECEIVED",
    createdAt: new Date(),
  };
  apiStore.billingWebhookEvents.set(webhookRecord.id, webhookRecord);

  try {
    switch (eventType) {
      case "checkout.session.completed": {
        const session = event.data?.object || event.payload || {};
        const orgId = session.client_reference_id || session.organizationId;
        const planSlug = session.metadata?.planSlug || "pro";
        const targetPlan = apiStore.plans.get(planSlug) || DEFAULT_PLANS.pro;

        if (orgId) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const subRecord: SubscriptionRecord = {
            id: `sub_${crypto.randomUUID()}`,
            organizationId: orgId,
            planId: targetPlan.id,
            providerCustomerId:
              session.customer || `cus_${crypto.randomUUID().slice(0, 8)}`,
            providerSubscriptionId:
              session.subscription ||
              `sub_ext_${crypto.randomUUID().slice(0, 8)}`,
            status: "ACTIVE",
            billingInterval: "MONTHLY",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            createdAt: now,
            updatedAt: now,
          };
          apiStore.subscriptions.set(subRecord.id, subRecord);

          apiStore.recordAudit({
            organizationId: orgId,
            action: "billing.subscription_created",
            resourceType: "subscription",
            resourceId: subRecord.id,
            metadata: { planId: targetPlan.id, planSlug: targetPlan.slug },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subData = event.data?.object || event.payload || {};
        const providerSubId = subData.id;
        const statusMap: Record<string, any> = {
          active: "ACTIVE",
          past_due: "PAST_DUE",
          canceled: "CANCELLED",
          trialing: "TRIALING",
          unpaid: "SUSPENDED",
        };
        const mappedStatus = statusMap[subData.status] || "ACTIVE";

        const existingSub = Array.from(apiStore.subscriptions.values()).find(
          (s) => s.providerSubscriptionId === providerSubId,
        );

        if (existingSub) {
          existingSub.status = mappedStatus;
          existingSub.cancelAtPeriodEnd = Boolean(subData.cancel_at_period_end);
          if (subData.current_period_start) {
            existingSub.currentPeriodStart = new Date(
              subData.current_period_start * 1000,
            );
          }
          if (subData.current_period_end) {
            existingSub.currentPeriodEnd = new Date(
              subData.current_period_end * 1000,
            );
          }
          existingSub.updatedAt = new Date();
          apiStore.subscriptions.set(existingSub.id, existingSub);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subData = event.data?.object || event.payload || {};
        const providerSubId = subData.id;
        const existingSub = Array.from(apiStore.subscriptions.values()).find(
          (s) => s.providerSubscriptionId === providerSubId,
        );
        if (existingSub) {
          existingSub.status = "CANCELLED";
          existingSub.canceledAt = new Date();
          existingSub.updatedAt = new Date();
          apiStore.subscriptions.set(existingSub.id, existingSub);

          apiStore.recordAudit({
            organizationId: existingSub.organizationId,
            action: "billing.subscription_cancelled",
            resourceType: "subscription",
            resourceId: existingSub.id,
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoiceData = event.data?.object || event.payload || {};
        const providerSubId = invoiceData.subscription;
        if (providerSubId) {
          entitlementService.handlePaymentSuccess(providerSubId, {
            id: invoiceData.id,
            invoiceNumber: invoiceData.number,
            amountPaid: invoiceData.amount_paid,
            currency: invoiceData.currency,
            subtotal: invoiceData.subtotal,
            tax: invoiceData.tax,
            total: invoiceData.total,
            hostedInvoiceUrl: invoiceData.hosted_invoice_url,
            invoicePdfUrl: invoiceData.invoice_pdf,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoiceData = event.data?.object || event.payload || {};
        const providerSubId = invoiceData.subscription;
        const reason =
          invoiceData.failure_message ||
          invoiceData.last_payment_error?.message ||
          "Card declined";
        if (providerSubId) {
          entitlementService.handlePaymentFailure(providerSubId, reason);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    webhookRecord.status = "PROCESSED";
    webhookRecord.processedAt = new Date();
    apiStore.billingWebhookEvents.set(webhookRecord.id, webhookRecord);

    res
      .status(200)
      .json({ success: true, message: `Webhook ${eventType} processed.` });
  } catch (err: any) {
    webhookRecord.status = "FAILED";
    webhookRecord.error = err.message;
    apiStore.billingWebhookEvents.set(webhookRecord.id, webhookRecord);

    res.status(500).json({
      success: false,
      error: { code: "WEBHOOK_PROCESSING_ERROR", message: err.message },
    });
  }
});

// ==========================================
// AUTHENTICATED ROUTES
// ==========================================
billingRouter.use(requireAuth);

/**
 * 3. GET /subscription: Get current organization subscription & effective plan
 */
billingRouter.get(
  "/subscription",
  requirePermission("billing:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const subscription = entitlementService.getSubscription(orgId);
    const plan = entitlementService.getEffectivePlan(orgId);
    const isSuspended = entitlementService.isSuspended(orgId);

    res.json({
      success: true,
      data: {
        subscription,
        plan,
        isSuspended,
        billingPeriod: entitlementService.getCurrentBillingPeriod(orgId),
      },
      error: null,
    });
  },
);

/**
 * 4. POST /checkout: Create checkout session for subscription / upgrade
 */
billingRouter.post(
  "/checkout",
  requirePermission("billing:write"),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const parse = CreateCheckoutSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: parse.error.issues[0].message,
        },
      });
      return;
    }

    const { planSlug, billingInterval, successUrl, cancelUrl } = parse.data;
    const targetPlan = apiStore.plans.get(planSlug);
    if (!targetPlan || targetPlan.status !== "ACTIVE") {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "PLAN_NOT_FOUND",
          message: `Active plan '${planSlug}' was not found.`,
        },
      });
      return;
    }

    try {
      const checkoutSession =
        await defaultBillingProvider.createCheckoutSession({
          organizationId: orgId,
          plan: targetPlan,
          billingInterval,
          customerEmail: req.user?.email,
          successUrl,
          cancelUrl,
        });

      apiStore.recordAudit({
        organizationId: orgId,
        userId: req.user?.id,
        action: "billing.checkout_session_created",
        resourceType: "checkout_session",
        resourceId: checkoutSession.sessionId,
        metadata: { planSlug, billingInterval },
      });

      res.status(200).json({
        success: true,
        data: checkoutSession,
        error: null,
      });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        data: null,
        error: { code: "BILLING_PROVIDER_ERROR", message: err.message },
      });
    }
  },
);

/**
 * 5. POST /portal: Create customer billing portal session
 */
billingRouter.post(
  "/portal",
  requirePermission("billing:write"),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const parse = CreatePortalSchema.safeParse(req.body);
    const returnUrl = parse.success ? parse.data.returnUrl : undefined;

    const sub = entitlementService.getSubscription(orgId);
    const customerId =
      sub?.providerCustomerId || `cus_mock_${orgId.slice(0, 8)}`;

    try {
      const portalSession = await defaultBillingProvider.createPortalSession({
        organizationId: orgId,
        customerId,
        returnUrl,
      });

      apiStore.recordAudit({
        organizationId: orgId,
        userId: req.user?.id,
        action: "billing.portal_session_created",
        resourceType: "portal_session",
        resourceId: customerId,
      });

      res.status(200).json({
        success: true,
        data: portalSession,
        error: null,
      });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        data: null,
        error: { code: "BILLING_PROVIDER_ERROR", message: err.message },
      });
    }
  },
);

/**
 * 6. POST /subscription/upgrade: Immediate plan upgrade or switch
 */
billingRouter.post(
  "/subscription/upgrade",
  requirePermission("billing:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const parse = UpgradeSubscriptionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: parse.error.issues[0].message,
        },
      });
      return;
    }

    const { planSlug, billingInterval } = parse.data;
    const targetPlan = apiStore.plans.get(planSlug);
    if (!targetPlan || targetPlan.status !== "ACTIVE") {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: "PLAN_NOT_FOUND",
          message: `Active plan '${planSlug}' was not found.`,
        },
      });
      return;
    }

    let sub = entitlementService.getSubscription(orgId);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(
      periodEnd.getMonth() + (billingInterval === "YEARLY" ? 12 : 1),
    );

    if (sub) {
      sub.planId = targetPlan.id;
      sub.billingInterval = billingInterval;
      sub.status = "ACTIVE";
      sub.cancelAtPeriodEnd = false;
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd = periodEnd;
      sub.gracePeriodEnd = undefined;
      sub.updatedAt = now;
      apiStore.subscriptions.set(sub.id, sub);
    } else {
      sub = {
        id: `sub_${crypto.randomUUID()}`,
        organizationId: orgId,
        planId: targetPlan.id,
        status: "ACTIVE",
        billingInterval,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
      };
      apiStore.subscriptions.set(sub.id, sub);
    }

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "billing.subscription_upgraded",
      resourceType: "subscription",
      resourceId: sub.id,
      metadata: { newPlanId: targetPlan.id, newPlanSlug: targetPlan.slug },
    });

    res.status(200).json({
      success: true,
      data: {
        subscription: sub,
        plan: targetPlan,
      },
      error: null,
    });
  },
);

/**
 * 7. POST /subscription/cancel: Cancel subscription at period end
 */
billingRouter.post(
  "/subscription/cancel",
  requirePermission("billing:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const parse = CancelSubscriptionSchema.safeParse(req.body);
    const cancelAtPeriodEnd = parse.success
      ? parse.data.cancelAtPeriodEnd
      : true;
    const reason = parse.success ? parse.data.reason : undefined;

    const sub = entitlementService.getSubscription(orgId);
    if (!sub || sub.status === "EXPIRED" || sub.status === "CANCELLED") {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "NO_ACTIVE_SUBSCRIPTION",
          message: "Organization has no active paid subscription to cancel.",
        },
      });
      return;
    }

    const now = new Date();
    sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
    sub.canceledAt = now;
    if (!cancelAtPeriodEnd) {
      sub.status = "CANCELLED";
    }
    sub.updatedAt = now;
    apiStore.subscriptions.set(sub.id, sub);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "billing.subscription_cancel_requested",
      resourceType: "subscription",
      resourceId: sub.id,
      metadata: { cancelAtPeriodEnd, reason },
    });

    res.status(200).json({
      success: true,
      data: {
        subscription: sub,
        effectiveCancellationDate: cancelAtPeriodEnd
          ? sub.currentPeriodEnd
          : now,
      },
      error: null,
    });
  },
);

/**
 * 8. POST /subscription/resume: Resume a subscription scheduled to cancel
 */
billingRouter.post(
  "/subscription/resume",
  requirePermission("billing:write"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const sub = entitlementService.getSubscription(orgId);

    if (!sub || !sub.cancelAtPeriodEnd) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "CANNOT_RESUME",
          message: "Subscription is not scheduled for cancellation.",
        },
      });
      return;
    }

    sub.cancelAtPeriodEnd = false;
    sub.canceledAt = undefined;
    sub.updatedAt = new Date();
    apiStore.subscriptions.set(sub.id, sub);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "billing.subscription_resumed",
      resourceType: "subscription",
      resourceId: sub.id,
    });

    res.status(200).json({
      success: true,
      data: sub,
      error: null,
    });
  },
);

/**
 * 9. GET /usage: Real-time usage and quota metrics for current period
 */
billingRouter.get(
  "/usage",
  requirePermission("billing:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const summary = entitlementService.getUsageSummary(orgId);

    res.json({
      success: true,
      data: summary,
      error: null,
    });
  },
);

/**
 * 10. GET /invoices: Paginated list of billing invoices
 */
billingRouter.get(
  "/invoices",
  requirePermission("billing:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const invoices = Array.from(apiStore.invoices.values())
      .filter((inv) => inv.organizationId === orgId)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

    const paginated = invoices.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginated,
      meta: {
        total: invoices.length,
        limit,
        offset,
      },
      error: null,
    });
  },
);

/**
 * 11. GET /invoices/:id: Single invoice detail with tenant isolation
 */
billingRouter.get(
  "/invoices/:id",
  requirePermission("billing:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const invoiceId = req.params.id;

    const invoice = apiStore.invoices.get(invoiceId);
    if (!invoice || invoice.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Invoice not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: invoice,
      error: null,
    });
  },
);

/**
 * 12. POST /reconcile: Platform / Admin reconciliation with payment provider
 */
billingRouter.post(
  "/reconcile",
  requirePermission("billing:admin"),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const result = await entitlementService.reconcileSubscription(orgId);

    res.json({
      success: true,
      data: result,
      error: null,
    });
  },
);
