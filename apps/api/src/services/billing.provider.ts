import crypto from "crypto";
import {
  PlanRecord,
  SubscriptionRecord,
  DEFAULT_PLANS,
} from "@flowforge/shared";

export interface CreateCheckoutParams {
  organizationId: string;
  plan: PlanRecord;
  billingInterval: "MONTHLY" | "YEARLY";
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  provider: "mock" | "stripe";
  expiresAt: Date;
}

export interface CreatePortalParams {
  organizationId: string;
  customerId: string;
  returnUrl?: string;
}

export interface PortalSessionResult {
  url: string;
  provider: "mock" | "stripe";
}

export interface ProviderSubscriptionDetails {
  id: string;
  customerId: string;
  status: "active" | "past_due" | "canceled" | "trialing" | "unpaid";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planId: string;
}

export interface ReconciliationResult {
  synchronized: boolean;
  actionTaken:
    | "NOOP"
    | "STATUS_UPDATED"
    | "SUBSCRIPTION_RESTORED"
    | "SUBSCRIPTION_SUSPENDED";
  details: string;
}

export interface BillingProviderAdapter {
  createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSessionResult>;
  createPortalSession(params: CreatePortalParams): Promise<PortalSessionResult>;
  getSubscription(
    providerSubId: string,
  ): Promise<ProviderSubscriptionDetails | null>;
  cancelSubscription(
    providerSubId: string,
    atPeriodEnd: boolean,
  ): Promise<boolean>;
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): boolean;
  reconcileSubscription(
    subscription: SubscriptionRecord,
  ): Promise<ReconciliationResult>;
}

export class MockBillingAdapter implements BillingProviderAdapter {
  public failNextOperation = false;
  public simulateTimeout = false;
  private readonly defaultSecret =
    process.env.BILLING_WEBHOOK_SECRET ||
    "whsec_mock_flowforge_secret_key_32chars_min";

  async createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSessionResult> {
    if (this.simulateTimeout) {
      throw new Error("Billing provider request timed out (simulated).");
    }
    if (this.failNextOperation) {
      this.failNextOperation = false;
      throw new Error("Billing provider API unavailable (simulated 503).");
    }

    const sessionId = `cs_test_${crypto.randomUUID().replace(/-/g, "")}`;
    const successUrl =
      params.successUrl ||
      "http://localhost:3000/settings/billing?session_id={CHECKOUT_SESSION_ID}";
    const url = `${successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId)}&mock_checkout=true`;

    return {
      sessionId,
      url,
      provider: "mock",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  async createPortalSession(
    params: CreatePortalParams,
  ): Promise<PortalSessionResult> {
    if (this.simulateTimeout) {
      throw new Error("Billing provider request timed out (simulated).");
    }
    if (this.failNextOperation) {
      this.failNextOperation = false;
      throw new Error("Billing provider API unavailable (simulated 503).");
    }

    const sessionToken = crypto.randomBytes(16).toString("hex");
    const returnUrl = encodeURIComponent(
      params.returnUrl || "http://localhost:3000/settings/billing",
    );
    return {
      url: `https://billing.stripe.com/p/session/test_${sessionToken}?return_url=${returnUrl}`,
      provider: "mock",
    };
  }

  async getSubscription(
    providerSubId: string,
  ): Promise<ProviderSubscriptionDetails | null> {
    if (this.simulateTimeout) {
      throw new Error("Billing provider request timed out (simulated).");
    }
    if (this.failNextOperation) {
      this.failNextOperation = false;
      throw new Error("Billing provider API unavailable (simulated 503).");
    }

    // Return realistic mock provider subscription
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    return {
      id: providerSubId,
      customerId: `cus_${crypto.randomUUID().slice(0, 12)}`,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      planId: DEFAULT_PLANS.pro.id,
    };
  }

  async cancelSubscription(
    providerSubId: string,
    atPeriodEnd: boolean,
  ): Promise<boolean> {
    if (this.failNextOperation) {
      this.failNextOperation = false;
      throw new Error("Failed to cancel subscription with provider.");
    }
    return true;
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret?: string,
  ): boolean {
    const key = secret || this.defaultSecret;
    if (!signature || !payload) return false;

    try {
      // Signature format: t=<timestamp>,v1=<hash> or plain HMAC
      let timestamp = "";
      let expectedHash = "";

      if (signature.includes("t=") && signature.includes("v1=")) {
        const parts = signature.split(",");
        for (const part of parts) {
          const [k, v] = part.trim().split("=");
          if (k === "t") timestamp = v;
          if (k === "v1") expectedHash = v;
        }
        const signedPayload = `${timestamp}.${typeof payload === "string" ? payload : payload.toString("utf8")}`;
        const computedHash = crypto
          .createHmac("sha256", key)
          .update(signedPayload)
          .digest("hex");
        return crypto.timingSafeEqual(
          Buffer.from(computedHash),
          Buffer.from(expectedHash),
        );
      }

      // Plain HMAC signature
      const computed = crypto
        .createHmac("sha256", key)
        .update(
          typeof payload === "string" ? payload : payload.toString("utf8"),
        )
        .digest("hex");
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }

  generateWebhookSignature(
    payload: string | Record<string, unknown>,
    secret?: string,
  ): string {
    const key = secret || this.defaultSecret;
    const bodyStr =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${bodyStr}`;
    const hash = crypto
      .createHmac("sha256", key)
      .update(signedPayload)
      .digest("hex");
    return `t=${timestamp},v1=${hash}`;
  }

  async reconcileSubscription(
    subscription: SubscriptionRecord,
  ): Promise<ReconciliationResult> {
    if (!subscription.providerSubscriptionId) {
      return {
        synchronized: true,
        actionTaken: "NOOP",
        details: "No external provider subscription linked.",
      };
    }

    const providerSub = await this.getSubscription(
      subscription.providerSubscriptionId,
    );
    if (!providerSub) {
      return {
        synchronized: false,
        actionTaken: "STATUS_UPDATED",
        details:
          "Subscription not found in payment provider; marked for review.",
      };
    }

    return {
      synchronized: true,
      actionTaken: "NOOP",
      details: "Local subscription state matches payment provider.",
    };
  }
}

export const defaultBillingProvider = new MockBillingAdapter();
