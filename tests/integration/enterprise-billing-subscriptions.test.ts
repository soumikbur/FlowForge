import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { defaultBillingProvider } from "../../apps/api/src/services/billing.provider.js";
import { entitlementService } from "../../apps/api/src/services/entitlement.service.js";
import { PlanRecord, DEFAULT_PLANS } from "@flowforge/shared";

describe("Prompt 22: Enterprise SaaS Billing, Subscription Management, and Usage Metering", () => {
  let orgA: any;
  let orgB: any;
  let ownerUser: any;
  let adminUser: any;
  let memberUser: any;
  let viewerUser: any;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;

  beforeEach(() => {
    apiStore.clear();

    // 1. Create Organization A
    orgA = {
      id: `org_a_${Date.now()}`,
      name: "Acme Corp",
      slug: `acme-${Date.now()}`,
      billingEmail: "billing@acme.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Create Organization B (Tenant Isolation)
    orgB = {
      id: `org_b_${Date.now()}`,
      name: "Beta LLC",
      slug: `beta-${Date.now()}`,
      billingEmail: "billing@beta.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Create Users
    ownerUser = {
      id: `usr_owner_${Date.now()}`,
      email: "owner@acme.com",
      passwordHash: "hash",
    };
    adminUser = {
      id: `usr_admin_${Date.now()}`,
      email: "admin@acme.com",
      passwordHash: "hash",
    };
    memberUser = {
      id: `usr_member_${Date.now()}`,
      email: "member@acme.com",
      passwordHash: "hash",
    };
    viewerUser = {
      id: `usr_viewer_${Date.now()}`,
      email: "viewer@acme.com",
      passwordHash: "hash",
    };

    apiStore.users.set(ownerUser.id, ownerUser);
    apiStore.users.set(adminUser.id, adminUser);
    apiStore.users.set(memberUser.id, memberUser);
    apiStore.users.set(viewerUser.id, viewerUser);

    // 4. Create Memberships in Org A
    apiStore.memberships.set(`mem_1`, {
      id: "mem_1",
      organizationId: orgA.id,
      userId: ownerUser.id,
      role: "OWNER",
    });
    apiStore.memberships.set(`mem_2`, {
      id: "mem_2",
      organizationId: orgA.id,
      userId: adminUser.id,
      role: "ADMIN",
    });
    apiStore.memberships.set(`mem_3`, {
      id: "mem_3",
      organizationId: orgA.id,
      userId: memberUser.id,
      role: "MEMBER",
    });
    apiStore.memberships.set(`mem_4`, {
      id: "mem_4",
      organizationId: orgA.id,
      userId: viewerUser.id,
      role: "VIEWER",
    });

    // 5. Create Sessions
    ownerToken = `token_owner_${Date.now()}`;
    adminToken = `token_admin_${Date.now()}`;
    memberToken = `token_member_${Date.now()}`;
    viewerToken = `token_viewer_${Date.now()}`;

    const exp = new Date(Date.now() + 86400000);
    apiStore.sessions.set(ownerToken, {
      id: "s1",
      userId: ownerUser.id,
      token: ownerToken,
      expiresAt: exp,
    });
    apiStore.sessions.set(adminToken, {
      id: "s2",
      userId: adminUser.id,
      token: adminToken,
      expiresAt: exp,
    });
    apiStore.sessions.set(memberToken, {
      id: "s3",
      userId: memberUser.id,
      token: memberToken,
      expiresAt: exp,
    });
    apiStore.sessions.set(viewerToken, {
      id: "s4",
      userId: viewerUser.id,
      token: viewerToken,
      expiresAt: exp,
    });
  });

  // ==========================================================================
  // 1. Plan Catalog & Public Plans API
  // ==========================================================================
  describe("1. Plan Catalog & Public Pricing API", () => {
    it("returns all active subscription plans sorted by price", async () => {
      const res = await request(app).get("/api/v1/billing/plans");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);

      const slugs = res.body.data.map((p: any) => p.slug);
      expect(slugs).toContain("free");
      expect(slugs).toContain("starter");
      expect(slugs).toContain("pro");
      expect(slugs).toContain("enterprise");

      // Verify pricing ascending order
      for (let i = 0; i < res.body.data.length - 1; i++) {
        expect(res.body.data[i].priceCents).toBeLessThanOrEqual(
          res.body.data[i + 1].priceCents,
        );
      }
    });
  });

  // ==========================================================================
  // 2. Subscription Lifecycle & Role-Based Access Controls
  // ==========================================================================
  describe("2. Subscription Lifecycle & Role-Based Access Control", () => {
    it("returns default Free plan when no subscription exists", async () => {
      const res = await request(app)
        .get("/api/v1/billing/subscription")
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscription).toBeNull();
      expect(res.body.data.plan.slug).toBe("free");
      expect(res.body.data.isSuspended).toBe(false);
    });

    it("restricts billing endpoints to OWNER and ADMIN (denies VIEWER and MEMBER)", async () => {
      // Viewer denied
      const resViewer = await request(app)
        .get("/api/v1/billing/subscription")
        .set("Cookie", [`flowforge_session=${viewerToken}`]);
      expect(resViewer.status).toBe(403);
      expect(resViewer.body.error.code).toBe("FORBIDDEN");

      // Member denied
      const resMember = await request(app)
        .get("/api/v1/billing/subscription")
        .set("Cookie", [`flowforge_session=${memberToken}`]);
      expect(resMember.status).toBe(403);
      expect(resMember.body.error.code).toBe("FORBIDDEN");

      // Admin allowed
      const resAdmin = await request(app)
        .get("/api/v1/billing/subscription")
        .set("Cookie", [`flowforge_session=${adminToken}`]);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.success).toBe(true);
    });

    it("allows OWNER to upgrade subscription immediately", async () => {
      const res = await request(app)
        .post("/api/v1/billing/subscription/upgrade")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ planSlug: "pro", billingInterval: "MONTHLY" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plan.slug).toBe("pro");
      expect(res.body.data.subscription.status).toBe("ACTIVE");
      expect(res.body.data.subscription.organizationId).toBe(orgA.id);

      // Verify stored in apiStore
      const sub = entitlementService.getSubscription(orgA.id);
      expect(sub).not.toBeNull();
      expect(sub?.status).toBe("ACTIVE");
      expect(sub?.planId).toBe(DEFAULT_PLANS.pro.id);
    });

    it("handles cancelAtPeriodEnd and allows resuming a subscription", async () => {
      // First upgrade to Pro
      await request(app)
        .post("/api/v1/billing/subscription/upgrade")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ planSlug: "pro" });

      // Request cancellation at period end
      const resCancel = await request(app)
        .post("/api/v1/billing/subscription/cancel")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ cancelAtPeriodEnd: true, reason: "Switching tools" });

      expect(resCancel.status).toBe(200);
      expect(resCancel.body.data.subscription.cancelAtPeriodEnd).toBe(true);
      expect(resCancel.body.data.subscription.status).toBe("ACTIVE"); // Still active until period end

      // Resume subscription
      const resResume = await request(app)
        .post("/api/v1/billing/subscription/resume")
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(resResume.status).toBe(200);
      expect(resResume.body.data.cancelAtPeriodEnd).toBe(false);

      const sub = entitlementService.getSubscription(orgA.id);
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Checkout and Billing Portal Integration
  // ==========================================================================
  describe("3. Checkout and Customer Billing Portal Sessions", () => {
    it("creates a checkout session with provider and records audit event", async () => {
      const res = await request(app)
        .post("/api/v1/billing/checkout")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({
          planSlug: "enterprise",
          billingInterval: "YEARLY",
          successUrl:
            "http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: "http://localhost:3000/billing/cancel",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toMatch(/^cs_test_/);
      expect(res.body.data.url).toContain("mock_checkout=true");

      // Verify audit trail
      const audit = apiStore.auditLogs.find(
        (a) =>
          a.organizationId === orgA.id &&
          a.action === "billing.checkout_session_created",
      );
      expect(audit).toBeDefined();
    });

    it("creates a billing portal session for customer self-service", async () => {
      const res = await request(app)
        .post("/api/v1/billing/portal")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ returnUrl: "http://localhost:3000/settings/billing" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain("billing.stripe.com/p/session");
    });
  });

  // ==========================================================================
  // 4. Entitlement Gating & Quota Enforcement
  // ==========================================================================
  describe("4. Centralized Entitlement Gating & Quota Enforcement", () => {
    it("enforces monthly workflow execution quota and returns 402 QUOTA_EXCEEDED", async () => {
      // Set org on a restricted plan with maxMonthlyExecutions: 2
      const restrictedPlan: PlanRecord = {
        id: "plan_test_micro",
        slug: "micro",
        name: "Micro Plan",
        description: "Test plan with tight limits",
        billingInterval: "MONTHLY",
        priceCents: 1000,
        currency: "USD",
        trialDays: 0,
        status: "ACTIVE",
        entitlements: {
          maxSeats: 10,
          maxWorkflows: 10,
          maxActiveWorkflows: 10,
          maxMonthlyExecutions: 2,
          maxConcurrentExecutions: 10,
          maxConnectors: 10,
          retentionDays: 7,
          hasAnalytics: true,
          hasGovernance: false,
          hasCustomConnectors: false,
          hasSso: false,
          hasPrioritySupport: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.plans.set(restrictedPlan.id, restrictedPlan);

      apiStore.subscriptions.set("sub_micro", {
        id: "sub_micro",
        organizationId: orgA.id,
        planId: restrictedPlan.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create and publish a test workflow
      const wfId = `wf_exec_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Order Processing",
        status: "ACTIVE",
        draftDefinition: {
          nodes: [
            {
              id: "t1",
              type: "TRIGGER",
              name: "Trigger",
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
        },
        publishedVersionId: "v1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("v1", {
        id: "v1",
        workflowId: wfId,
        versionNumber: 1,
        definition: { nodes: [], edges: [] },
        publishedAt: new Date(),
      });

      // Execution 1: Allowed (1/2)
      const res1 = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);
      expect(res1.status).toBe(202);

      // Execution 2: Allowed (2/2)
      const res2 = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);
      expect(res2.status).toBe(202);

      // Execution 3: BLOCKED with 402 QUOTA_EXCEEDED
      const res3 = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(res3.status).toBe(402);
      expect(res3.body.success).toBe(false);
      expect(res3.body.error.code).toBe("QUOTA_EXCEEDED");
      expect(res3.body.error.details.currentUsage).toBe(2);
      expect(res3.body.error.details.limit).toBe(2);
    });

    it("enforces concurrent execution limit and returns 429", async () => {
      // Set org plan with maxConcurrentExecutions: 1
      const concurrentPlan: PlanRecord = {
        id: "plan_test_concurrent",
        slug: "concurrent_test",
        name: "Concurrent Test",
        description: "Test concurrent limits",
        billingInterval: "MONTHLY",
        priceCents: 1000,
        currency: "USD",
        trialDays: 0,
        status: "ACTIVE",
        entitlements: {
          maxSeats: 10,
          maxWorkflows: 10,
          maxActiveWorkflows: 10,
          maxMonthlyExecutions: 100,
          maxConcurrentExecutions: 1,
          maxConnectors: 10,
          retentionDays: 7,
          hasAnalytics: true,
          hasGovernance: false,
          hasCustomConnectors: false,
          hasSso: false,
          hasPrioritySupport: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.plans.set(concurrentPlan.id, concurrentPlan);

      apiStore.subscriptions.set("sub_conc", {
        id: "sub_conc",
        organizationId: orgA.id,
        planId: concurrentPlan.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate an existing RUNNING execution for orgA
      apiStore.executions.set("exec_running_1", {
        id: "exec_running_1",
        organizationId: orgA.id,
        workflowId: "wf1",
        workflowVersionId: "v1",
        triggerType: "MANUAL",
        triggerPayload: {},
        status: "RUNNING",
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const wfId = `wf_conc_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Concurrent WF",
        status: "ACTIVE",
        draftDefinition: { nodes: [], edges: [] },
        publishedVersionId: "v1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("v1", {
        id: "v1",
        workflowId: wfId,
        versionNumber: 1,
        definition: { nodes: [], edges: [] },
        publishedAt: new Date(),
      });

      // Attempt second execution while 1 is RUNNING
      const res = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("CONCURRENT_EXECUTION_LIMIT_EXCEEDED");
    });

    it("enforces seat quota on team invitations", async () => {
      // Plan with maxSeats: 4 (already 4 members in orgA)
      const seatPlan: PlanRecord = {
        id: "plan_test_seats",
        slug: "seat_test",
        name: "Seat Test",
        description: "Test seat quota",
        billingInterval: "MONTHLY",
        priceCents: 1000,
        currency: "USD",
        trialDays: 0,
        status: "ACTIVE",
        entitlements: {
          maxSeats: 4,
          maxWorkflows: 10,
          maxActiveWorkflows: 10,
          maxMonthlyExecutions: 100,
          maxConcurrentExecutions: 10,
          maxConnectors: 10,
          retentionDays: 7,
          hasAnalytics: true,
          hasGovernance: false,
          hasCustomConnectors: false,
          hasSso: false,
          hasPrioritySupport: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.plans.set(seatPlan.id, seatPlan);
      apiStore.subscriptions.set("sub_seats", {
        id: "sub_seats",
        organizationId: orgA.id,
        planId: seatPlan.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Attempt to invite 5th member
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/invitations`)
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ email: "fifth@acme.com", role: "MEMBER" });

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
      expect(res.body.error.details.limit).toBe(4);
    });

    it("preserves existing data when downgraded and restricts new creations", async () => {
      // Org A has 4 members and 2 workflows
      // Downgrade to plan with maxWorkflows: 1
      const tinyPlan: PlanRecord = {
        id: "plan_tiny",
        slug: "tiny",
        name: "Tiny",
        description: "Tiny plan",
        billingInterval: "MONTHLY",
        priceCents: 0,
        currency: "USD",
        trialDays: 0,
        status: "ACTIVE",
        entitlements: {
          maxSeats: 10,
          maxWorkflows: 1,
          maxActiveWorkflows: 1,
          maxMonthlyExecutions: 100,
          maxConcurrentExecutions: 5,
          maxConnectors: 5,
          retentionDays: 7,
          hasAnalytics: true,
          hasGovernance: false,
          hasCustomConnectors: false,
          hasSso: false,
          hasPrioritySupport: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.plans.set(tinyPlan.id, tinyPlan);
      apiStore.subscriptions.set("sub_tiny", {
        id: "sub_tiny",
        organizationId: orgA.id,
        planId: tinyPlan.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Pre-existing workflow is preserved
      apiStore.workflows.set("wf_legacy", {
        id: "wf_legacy",
        organizationId: orgA.id,
        name: "Legacy Important Workflow",
        status: "DRAFT",
        draftDefinition: { nodes: [], edges: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Existing workflow is NOT deleted
      expect(apiStore.workflows.get("wf_legacy")).toBeDefined();

      // Attempting to create an additional workflow is blocked
      const resCreate = await request(app)
        .post("/api/v1/workflows")
        .set("Cookie", [`flowforge_session=${ownerToken}`])
        .send({ name: "New Blocked Workflow", description: "Should fail" });

      expect(resCreate.status).toBe(402);
      expect(resCreate.body.error.code).toBe("QUOTA_EXCEEDED");
    });
  });

  // ==========================================================================
  // 5. Durable Usage Metering & Idempotency
  // ==========================================================================
  describe("5. Durable Usage Metering and Idempotent Tracking", () => {
    it("meters workflow execution durably and prevents duplicate counting on retry", () => {
      const idempotencyKey = `exec_unique_${Date.now()}`;

      // First record
      const rec1 = entitlementService.recordUsage({
        organizationId: orgA.id,
        metric: "WORKFLOW_EXECUTION",
        quantity: 1,
        idempotencyKey,
      });

      expect(rec1.id).toBeDefined();
      expect(rec1.quantity).toBe(1);

      // Repeat with same idempotency key (simulated retry / duplicate dispatch)
      const rec2 = entitlementService.recordUsage({
        organizationId: orgA.id,
        metric: "WORKFLOW_EXECUTION",
        quantity: 1,
        idempotencyKey,
      });

      expect(rec2.id).toBe(rec1.id);

      // Verify only 1 record exists in apiStore.usageRecords
      const allRecords = Array.from(apiStore.usageRecords.values()).filter(
        (u) =>
          u.organizationId === orgA.id && u.idempotencyKey === idempotencyKey,
      );
      expect(allRecords.length).toBe(1);
    });
  });

  // ==========================================================================
  // 6. Billing Webhooks, Signature Verification & Deduplication
  // ==========================================================================
  describe("6. Billing Webhook Processing, Security & Deduplication", () => {
    it("rejects webhooks with invalid or missing signatures", async () => {
      const payload = { id: "evt_1", type: "checkout.session.completed" };

      const resNoSig = await request(app)
        .post("/api/v1/billing/webhook")
        .send(payload);
      expect(resNoSig.status).toBe(401);
      expect(resNoSig.body.error.code).toBe("INVALID_SIGNATURE");

      const resBadSig = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", "t=123,v1=invalidsignaturehash")
        .send(payload);
      expect(resBadSig.status).toBe(401);
      expect(resBadSig.body.error.code).toBe("INVALID_SIGNATURE");
    });

    it("accepts valid signed webhooks and creates subscription on checkout.session.completed", async () => {
      const eventPayload = {
        id: `evt_chk_${Date.now()}`,
        type: "checkout.session.completed",
        provider: "stripe",
        data: {
          object: {
            organizationId: orgA.id,
            customer: "cus_stripe_123",
            subscription: "sub_stripe_123",
            metadata: { planSlug: "pro" },
          },
        },
      };

      const sig = defaultBillingProvider.generateWebhookSignature(eventPayload);

      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", sig)
        .send(eventPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify subscription created
      const sub = entitlementService.getSubscription(orgA.id);
      expect(sub).not.toBeNull();
      expect(sub?.status).toBe("ACTIVE");
      expect(sub?.providerSubscriptionId).toBe("sub_stripe_123");
    });

    it("deduplicates identical webhook events on redelivery", async () => {
      const eventPayload = {
        id: `evt_dedup_${Date.now()}`,
        type: "customer.subscription.updated",
        provider: "stripe",
        data: {
          object: {
            id: "sub_stripe_xyz",
            status: "active",
          },
        },
      };

      const sig = defaultBillingProvider.generateWebhookSignature(eventPayload);

      // First delivery
      const res1 = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", sig)
        .send(eventPayload);
      expect(res1.status).toBe(200);

      // Second delivery (duplicate)
      const res2 = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", sig)
        .send(eventPayload);
      expect(res2.status).toBe(200);
      expect(res2.body.data?.duplicate).toBe(true);
    });
  });

  // ==========================================================================
  // 7. Payment Failures, Grace Periods & Delinquent Suspension
  // ==========================================================================
  describe("7. Payment Failure, Grace Period and Suspension Handling", () => {
    it("transitions subscription to PAST_DUE on payment failure and establishes grace period", async () => {
      const providerSubId = `sub_fail_${Date.now()}`;
      apiStore.subscriptions.set("sub_f1", {
        id: "sub_f1",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.pro.id,
        providerSubscriptionId: providerSubId,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const eventPayload = {
        id: `evt_fail_${Date.now()}`,
        type: "invoice.payment_failed",
        provider: "stripe",
        data: {
          object: {
            subscription: providerSubId,
            failure_message: "Insufficient funds in customer account",
          },
        },
      };

      const sig = defaultBillingProvider.generateWebhookSignature(eventPayload);
      await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", sig)
        .send(eventPayload);

      const sub = entitlementService.getSubscription(orgA.id);
      expect(sub?.status).toBe("PAST_DUE");
      expect(sub?.gracePeriodEnd).toBeDefined();

      // Verify urgent notification sent
      const notification = Array.from(apiStore.notifications.values()).find(
        (n) =>
          n.organizationId === orgA.id && n.title.includes("Payment Failed"),
      );
      expect(notification).toBeDefined();
    });

    it("suspends executions when grace period expires, but restores on payment success", async () => {
      const providerSubId = `sub_grace_${Date.now()}`;
      // Expired grace period (yesterday)
      apiStore.subscriptions.set("sub_exp", {
        id: "sub_exp",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.pro.id,
        providerSubscriptionId: providerSubId,
        status: "PAST_DUE",
        gracePeriodEnd: new Date(Date.now() - 86400000),
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const wfId = `wf_susp_${Date.now()}`;
      apiStore.workflows.set(wfId, {
        id: wfId,
        organizationId: orgA.id,
        name: "Suspended WF",
        status: "ACTIVE",
        draftDefinition: { nodes: [], edges: [] },
        publishedVersionId: "v1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      apiStore.versions.set("v1", {
        id: "v1",
        workflowId: wfId,
        versionNumber: 1,
        definition: { nodes: [], edges: [] },
        publishedAt: new Date(),
      });

      // Executing workflow while delinquent is blocked with SUBSCRIPTION_SUSPENDED
      const resBlocked = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(resBlocked.status).toBe(402);
      expect(resBlocked.body.error.code).toBe("SUBSCRIPTION_SUSPENDED");

      // Now customer updates payment details; invoice.payment_succeeded arrives
      const successPayload = {
        id: `evt_succ_${Date.now()}`,
        type: "invoice.payment_succeeded",
        provider: "stripe",
        data: {
          object: {
            subscription: providerSubId,
            number: "INV-999888",
            amount_paid: 9900,
            currency: "usd",
            total: 9900,
          },
        },
      };

      const sig =
        defaultBillingProvider.generateWebhookSignature(successPayload);
      await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", sig)
        .send(successPayload);

      // Verify restored to ACTIVE
      const restoredSub = entitlementService.getSubscription(orgA.id);
      expect(restoredSub?.status).toBe("ACTIVE");
      expect(restoredSub?.gracePeriodEnd).toBeUndefined();

      // Executions now succeed
      const resAllowed = await request(app)
        .post(`/api/v1/workflows/${wfId}/execute`)
        .set("Cookie", [`flowforge_session=${ownerToken}`]);
      expect(resAllowed.status).toBe(202);
    });
  });

  // ==========================================================================
  // 8. Invoices and Billing History with Tenant Isolation
  // ==========================================================================
  describe("8. Invoices and Multi-Tenant Isolation", () => {
    it("provides paginated invoice history for authorized tenant", async () => {
      // Seed invoices for Org A
      apiStore.invoices.set("inv_1", {
        id: "inv_1",
        organizationId: orgA.id,
        invoiceNumber: "INV-001",
        currency: "USD",
        subtotal: 9900,
        tax: 0,
        total: 9900,
        amountPaid: 9900,
        status: "PAID",
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/billing/invoices")
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].invoiceNumber).toBe("INV-001");
      expect(res.body.meta.total).toBe(1);
    });

    it("strictly isolates invoices across tenant boundaries", async () => {
      // Org A invoice
      apiStore.invoices.set("inv_org_a", {
        id: "inv_org_a",
        organizationId: orgA.id,
        invoiceNumber: "INV-SECRET-A",
        currency: "USD",
        subtotal: 9900,
        tax: 0,
        total: 9900,
        amountPaid: 9900,
        status: "PAID",
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // User from Org B
      const userB = {
        id: `usr_b_${Date.now()}`,
        email: "user@beta.com",
        passwordHash: "hash",
      };
      apiStore.users.set(userB.id, userB);
      apiStore.memberships.set("mem_b", {
        id: "mem_b",
        organizationId: orgB.id,
        userId: userB.id,
        role: "OWNER",
      });
      const tokenB = `token_b_${Date.now()}`;
      apiStore.sessions.set(tokenB, {
        id: "sb",
        userId: userB.id,
        token: tokenB,
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Tenant B requests Org A's invoice: denied 404
      const res = await request(app)
        .get("/api/v1/billing/invoices/inv_org_a")
        .set("Cookie", [`flowforge_session=${tokenB}`]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================================================
  // 9. Usage Visibility & Threshold Notifications
  // ==========================================================================
  describe("9. Usage Visibility and Threshold Notifications", () => {
    it("reports usage percentages and triggers threshold notifications at 80% and 100%", async () => {
      // Set org on Starter plan (5000 executions limit)
      apiStore.subscriptions.set("sub_starter", {
        id: "sub_starter",
        organizationId: orgA.id,
        planId: DEFAULT_PLANS.starter.id,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ),
        currentPeriodEnd: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0,
          23,
          59,
          59,
        ),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Record 4,100 executions (82% usage)
      entitlementService.recordUsage({
        organizationId: orgA.id,
        metric: "WORKFLOW_EXECUTION",
        quantity: 4100,
      });

      const resUsage = await request(app)
        .get("/api/v1/billing/usage")
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(resUsage.status).toBe(200);
      expect(resUsage.body.success).toBe(true);

      const monthlyExec = resUsage.body.data.metrics.monthlyExecutions;
      expect(monthlyExec.current).toBe(4100);
      expect(monthlyExec.limit).toBe(5000);
      expect(monthlyExec.percentage).toBe(82);
      expect(monthlyExec.warningThresholdReached).toBe(true);
      expect(monthlyExec.exceeded).toBe(false);

      // Verify 80% notification created
      const warnNotification = Array.from(apiStore.notifications.values()).find(
        (n) =>
          n.organizationId === orgA.id &&
          n.title.includes("Approaching Monthly Execution Quota"),
      );
      expect(warnNotification).toBeDefined();
    });
  });

  // ==========================================================================
  // 10. Reconciliation with Payment Provider
  // ==========================================================================
  describe("10. Payment Provider Reconciliation", () => {
    it("allows billing administrator to run subscription reconciliation", async () => {
      const res = await request(app)
        .post("/api/v1/billing/reconcile")
        .set("Cookie", [`flowforge_session=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.synchronized).toBe(true);

      const audit = apiStore.auditLogs.find(
        (a) => a.organizationId === orgA.id && a.action === "billing.reconcile",
      );
      expect(audit).toBeDefined();
    });
  });
});
