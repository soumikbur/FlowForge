import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.js";
import { complianceService } from "../../apps/api/src/services/compliance.service.js";

describe("Prompt 26: Enterprise Compliance, Audit Governance, Data Retention, and Privacy Controls", () => {
  // Tenant A: Sovereign Compliance Corp
  let orgA: any;
  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;

  // Tenant B: Isolated Systems Ltd (for cross-tenant checks)
  let orgB: any;
  let ownerUserB: any;
  let ownerTokenB: string;

  const validBcryptHash =
    "$2b$10$X8zg6T64H1t8i5f1Tu.qAO5FVL9bP2i1VoCm6vXj7dFOPmdTSh/WK";

  beforeEach(() => {
    resetRateLimits();
    apiStore.clear();

    // 1. Create Organization A
    orgA = {
      id: `org_comp_${Date.now()}`,
      name: "Sovereign Compliance Corp",
      slug: `sovereign-${Date.now()}`,
      billingEmail: "compliance@sovereign.corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgA.id, orgA);

    // 2. Create Organization B
    orgB = {
      id: `org_iso_${Date.now()}`,
      name: "Isolated Systems Ltd",
      slug: `isolated-${Date.now()}`,
      billingEmail: "security@isolated.io",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    apiStore.organizations.set(orgB.id, orgB);

    // 3. Create Users
    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@sovereign.corp",
      passwordHash: validBcryptHash,
      firstName: "Alice",
      lastName: "Chief",
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@sovereign.corp",
      passwordHash: validBcryptHash,
      firstName: "Bob",
      lastName: "Auditor",
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@sovereign.corp",
      passwordHash: validBcryptHash,
      firstName: "Charlie",
      lastName: "Operator",
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@isolated.io",
      passwordHash: validBcryptHash,
      firstName: "David",
      lastName: "External",
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

    // 4. Create Memberships
    apiStore.memberships.set("mem_a1", {
      id: "mem_a1",
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: "OWNER",
    });
    apiStore.memberships.set("mem_a2", {
      id: "mem_a2",
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: "ADMIN",
    });
    apiStore.memberships.set("mem_a3", {
      id: "mem_a3",
      organizationId: orgA.id,
      userId: memberUserA.id,
      role: "MEMBER",
    });
    apiStore.memberships.set("mem_b1", {
      id: "mem_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    // 5. Create Sessions
    ownerTokenA = `sess_owner_a_${Date.now()}`;
    adminTokenA = `sess_admin_a_${Date.now()}`;
    memberTokenA = `sess_member_a_${Date.now()}`;
    ownerTokenB = `sess_owner_b_${Date.now()}`;

    apiStore.sessions.set(ownerTokenA, {
      id: ownerTokenA,
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(adminTokenA, {
      id: adminTokenA,
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(memberTokenA, {
      id: memberTokenA,
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: ownerTokenB,
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: new Date(Date.now() + 86400000),
    });
  });

  // ==========================================
  // 1. AUDIT ARCHITECTURE & INTEGRITY HASH CHAINING
  // ==========================================
  describe("1. Centralized Audit Event Architecture & Tamper-Evident Hash Chain", () => {
    it("1.1 should record structured audit events with SHA-256 hash chaining and secret sanitization", async () => {
      // Record event 1
      const log1 = apiStore.recordAudit({
        organizationId: orgA.id,
        userId: ownerUserA.id,
        action: "workflow.created",
        resourceType: "workflow",
        resourceId: "wf_101",
        metadata: {
          name: "Invoice Approvals",
          clientSecret: "super_secret_oauth_secret_value",
          token: "eyJhbGciOi...",
          safeField: "active",
        },
      });

      expect(log1.id).toBeDefined();
      expect(log1.recordHash).toBeDefined();
      expect(log1.prevRecordHash).toBe("GENESIS_HASH");
      // Verify metadata redaction
      expect(log1.metadata?.clientSecret).toBe("[REDACTED]");
      expect(log1.metadata?.token).toBe("[REDACTED]");
      expect(log1.metadata?.safeField).toBe("active");

      // Record event 2
      const log2 = apiStore.recordAudit({
        organizationId: orgA.id,
        userId: adminUserA.id,
        action: "workflow.published",
        resourceType: "workflow",
        resourceId: "wf_101",
        metadata: { version: 1 },
      });

      expect(log2.prevRecordHash).toBe(log1.recordHash);
      expect(log2.recordHash).not.toBe(log1.recordHash);
    });

    it("1.2 should verify audit hash chain successfully via POST /audit/verify", async () => {
      // Seed 3 sequential audit logs
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: ownerUserA.id,
        action: "org.created",
        resourceType: "org",
        resourceId: orgA.id,
      });
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: adminUserA.id,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: "ws_1",
      });
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: memberUserA.id,
        action: "execution.started",
        resourceType: "execution",
        resourceId: "ex_1",
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/audit/verify`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.totalEvents).toBe(3);
      expect(res.body.data.lastHash).toBeDefined();
    });

    it("1.3 should detect audit record tampering and raise a CRITICAL OperationalAlert", async () => {
      const log1 = apiStore.recordAudit({
        organizationId: orgA.id,
        userId: ownerUserA.id,
        action: "key.created",
        resourceType: "api_key",
        resourceId: "k_1",
      });
      const log2 = apiStore.recordAudit({
        organizationId: orgA.id,
        userId: adminUserA.id,
        action: "key.rotated",
        resourceType: "api_key",
        resourceId: "k_1",
      });

      // Malicious actor tampers with log1 metadata in storage
      log1.metadata = { tampered: true };

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/audit/verify`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.brokenRecordId).toBe(log1.id);

      // Verify tamper alert created
      const tamperAlert = Array.from(apiStore.alerts.values()).find(
        (a) =>
          a.organizationId === orgA.id &&
          a.ruleType === "AUDIT_TAMPER_DETECTED",
      );
      expect(tamperAlert).toBeDefined();
      expect(tamperAlert?.severity).toBe("CRITICAL");
    });
  });

  // ==========================================
  // 2. AUDIT SEARCH, FILTERING, AND EXPORT
  // ==========================================
  describe("2. Audit Search, Filtering, and Export Governance", () => {
    beforeEach(() => {
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: ownerUserA.id,
        action: "login.success",
        resourceType: "session",
        resourceId: "s1",
        outcome: "SUCCESS",
      });
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: adminUserA.id,
        action: "policy.update",
        resourceType: "policy",
        resourceId: "p1",
        outcome: "SUCCESS",
      });
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: memberUserA.id,
        action: "workflow.execute",
        resourceType: "workflow",
        resourceId: "w1",
        outcome: "DENIED",
      });
    });

    it("2.1 should filter audit logs by outcome, action, and resourceType", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/audit-logs?outcome=DENIED`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe("workflow.execute");
      expect(res.body.data[0].outcome).toBe("DENIED");
    });

    it("2.2 should export audit logs as JSON and record an audit log for the export", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/audit/export`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ format: "json" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(Array.isArray(JSON.parse(res.text))).toBe(true);

      // Verify export action was audited
      const exportAudit = apiStore.auditLogs.find(
        (l) => l.action === "audit.logs.exported",
      );
      expect(exportAudit).toBeDefined();
      expect(exportAudit?.organizationId).toBe(orgA.id);
    });

    it("2.3 should export audit logs as CSV with formula-injection defenses", async () => {
      // Create an audit log with potentially dangerous formula injection characters (=CMD, +SUM, @IMPORT)
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: memberUserA.id,
        action: "=cmd|'/C calc'!A0",
        resourceType: "+2+5",
        resourceId: "@evil_script",
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/audit/export`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ format: "csv" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");

      // Verify dangerous leading characters are escaped with a leading single quote
      expect(res.text).toContain("\"'=cmd|'/C calc'!A0\"");
      expect(res.text).toContain('"\'+2+5"');
      expect(res.text).toContain('"\'@evil_script"');
    });

    it("2.4 should paginate audit logs properly and return meta pagination information", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/audit-logs?page=1&pageSize=2`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.pageSize).toBe(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    });

    it("2.5 should filter audit logs by correlationId", async () => {
      const correlationId = `corr_${Date.now()}`;
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: adminUserA.id,
        action: "job.traced",
        resourceType: "job",
        resourceId: "j_1",
        correlationId,
      });

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/audit-logs?correlationId=${correlationId}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].correlationId).toBe(correlationId);
    });
  });

  // ==========================================
  // 3. CONFIGURABLE DATA RETENTION POLICIES
  // ==========================================
  describe("3. Configurable Data Retention Policies & Platform Constraints", () => {
    it("3.1 should list default platform retention policies across all categories", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/retention/policies`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(8);
      const auditPolicy = res.body.data.find(
        (p: any) => p.category === "AUDIT_LOGS",
      );
      expect(auditPolicy).toBeDefined();
      expect(auditPolicy.retentionDays).toBe(365);
    });

    it("3.2 should reject lowering AUDIT_LOGS retention below platform minimum 90 days", async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/retention/policies`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({
          category: "AUDIT_LOGS",
          retentionDays: 30, // Below mandatory 90 days!
          enabled: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_RETENTION_POLICY");
      expect(res.body.error.message).toContain("90 days");
    });

    it("3.3 should configure valid retention policy and record audit event", async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/retention/policies`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          category: "WORKFLOW_EXECUTIONS",
          retentionDays: 180,
          enabled: true,
          legalHoldExempt: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.category).toBe("WORKFLOW_EXECUTIONS");
      expect(res.body.data.retentionDays).toBe(180);

      const audit = apiStore.auditLogs.find(
        (l) => l.action === "retention.policy.updated",
      );
      expect(audit).toBeDefined();
    });

    it("3.4 should generate retention preview estimating records eligible for purge", async () => {
      // Seed an old execution older than 90 days
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
      apiStore.executions.set("exec_old", {
        id: "exec_old",
        workflowId: "wf_1",
        workflowVersionId: "v_1",
        organizationId: orgA.id,
        triggerType: "MANUAL",
        status: "COMPLETED",
        context: {},
        steps: [],
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/retention/preview`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ category: "WORKFLOW_EXECUTIONS" });

      expect(res.status).toBe(200);
      expect(
        res.body.data.categories.WORKFLOW_EXECUTIONS.eligibleForPurge,
      ).toBe(1);
    });

    it("3.5 should reject member from modifying retention policies (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${orgA.id}/retention/policies`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          category: "WORKFLOW_EXECUTIONS",
          retentionDays: 120,
          enabled: true,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 4. RETENTION CLEANUP JOBS & LEGAL HOLD PRESERVATION
  // ==========================================
  describe("4. Retention Cleanup Jobs & Legal Hold Preservation", () => {
    it("4.1 should execute dry-run retention job without deleting records", async () => {
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
      apiStore.executions.set("exec_dry", {
        id: "exec_dry",
        workflowId: "wf_1",
        workflowVersionId: "v_1",
        organizationId: orgA.id,
        triggerType: "MANUAL",
        status: "COMPLETED",
        context: {},
        steps: [],
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/retention/jobs`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ category: "WORKFLOW_EXECUTIONS", dryRun: true });

      expect(res.status).toBe(201);
      expect(res.body.data.dryRun).toBe(true);
      expect(res.body.data.recordsPurged).toBe(0);
      expect(apiStore.executions.has("exec_dry")).toBe(true); // Untouched!
    });

    it("4.2 should create active Legal Hold and preserve eligible records from retention purge", async () => {
      // 1. Create Legal Hold covering WORKFLOW_EXECUTIONS
      const holdRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/legal-holds`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          name: "Matter 2026-A Litigation Preservation",
          reason: "Subpoena preservation order regarding billing workflows",
          targetType: "ORGANIZATION",
          categories: ["WORKFLOW_EXECUTIONS"],
        });

      expect(holdRes.status).toBe(201);
      const holdId = holdRes.body.data.id;
      expect(holdRes.body.data.status).toBe("ACTIVE");

      // 2. Add an execution older than default 90 days
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      apiStore.executions.set("exec_preserved", {
        id: "exec_preserved",
        workflowId: "wf_hold",
        workflowVersionId: "v_1",
        organizationId: orgA.id,
        triggerType: "MANUAL",
        status: "COMPLETED",
        context: {},
        steps: [],
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      // 3. Execute live retention job
      const jobRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/retention/jobs`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ category: "WORKFLOW_EXECUTIONS", dryRun: false });

      expect(jobRes.status).toBe(201);
      expect(jobRes.body.data.recordsPurged).toBe(0); // Preserved by hold!
      expect(apiStore.executions.has("exec_preserved")).toBe(true);

      // 4. Release Legal Hold
      const releaseRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/legal-holds/${holdId}/release`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ releaseReason: "Matter settled and dismissed by court" });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.data.status).toBe("RELEASED");

      // 5. Re-run retention job -> now purged safely
      const purgeRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/retention/jobs`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ category: "WORKFLOW_EXECUTIONS", dryRun: false });

      expect(purgeRes.status).toBe(201);
      expect(purgeRes.body.data.recordsPurged).toBe(1);
      expect(apiStore.executions.has("exec_preserved")).toBe(false);
    });

    it("4.3 should list legal holds and retrieve hold details", async () => {
      const hold = complianceService.createLegalHold(
        orgA.id,
        {
          name: "Patent Litigation Preservation",
          reason: "Preserve workflow graphs and versions for IP dispute",
          targetType: "ORGANIZATION",
          categories: ["WORKFLOW_VERSIONS"],
        },
        adminUserA.id,
      );

      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/legal-holds`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((h: any) => h.id === hold.id)).toBe(true);

      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/legal-holds/${hold.id}`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe("Patent Litigation Preservation");
      expect(getRes.body.data.status).toBe("ACTIVE");
    });
  });

  // ==========================================
  // 5. PRIVACY REQUEST MANAGEMENT (GDPR/CCPA)
  // ==========================================
  describe("5. Privacy Request Management (GDPR/CCPA/Portability)", () => {
    it("5.1 should submit, review, and execute personal data export request", async () => {
      // 1. Member submits export request
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ requestType: "EXPORT" });

      expect(submitRes.status).toBe(201);
      const reqId = submitRes.body.data.id;
      expect(submitRes.body.data.status).toBe("SUBMITTED");

      // 2. Admin reviews and approves request
      const reviewRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          decision: "APPROVED",
          reviewNote: "Verified employee identity",
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe("APPROVED");

      // 3. Admin executes request to generate artifact
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(execRes.status).toBe(200);
      expect(execRes.body.data.status).toBe("COMPLETED");
      expect(execRes.body.data.artifactUrl).toContain("/artifact?token=");

      // 4. Download artifact using token
      const artifactUrl = execRes.body.data.artifactUrl;
      const downloadRes = await request(app)
        .get(artifactUrl)
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers["content-type"]).toContain("application/json");
      expect(downloadRes.body.profile.email).toBe(memberUserA.email);
    });

    it("5.2 should execute deletion request: anonymize personal data, terminate sessions, and preserve audit integrity", async () => {
      // Create user to delete
      const victim = {
        id: `usr_victim_${Date.now()}`,
        email: "victim@sovereign.corp",
        passwordHash: validBcryptHash,
        firstName: "Victor",
        lastName: "Victim",
        active: true,
      };
      apiStore.users.set(victim.id, victim);
      apiStore.memberships.set(`mem_${victim.id}`, {
        id: `mem_${victim.id}`,
        organizationId: orgA.id,
        userId: victim.id,
        role: "MEMBER",
      });
      const victimToken = `sess_victim_${Date.now()}`;
      apiStore.sessions.set(victimToken, {
        id: victimToken,
        userId: victim.id,
        token: victimToken,
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Add an audit log belonging to this user
      apiStore.recordAudit({
        organizationId: orgA.id,
        userId: victim.id,
        action: "workflow.run",
        resourceType: "workflow",
        resourceId: "wf_99",
      });

      // 1. Submit deletion request
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ userId: victim.id, requestType: "DELETION" });

      const reqId = submitRes.body.data.id;

      // 2. Approve
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/review`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ decision: "APPROVED" });

      // 3. Execute
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(execRes.status).toBe(200);
      expect(execRes.body.data.status).toBe("COMPLETED");

      // Verify User record was anonymized
      const anonymizedUser = apiStore.users.get(victim.id);
      expect(anonymizedUser?.email).toContain("@anonymized.flowforge.internal");
      expect(anonymizedUser?.firstName).toBe("Anonymized");
      expect(anonymizedUser?.passwordHash).toBe("");
      expect(anonymizedUser?.active).toBe(false);

      // Verify session terminated
      expect(apiStore.sessions.has(victimToken)).toBe(false);

      // Verify audit trail preserved (user ID retained, no cascaded destruction)
      const preservedAudit = apiStore.auditLogs.find(
        (l) => l.userId === victim.id,
      );
      expect(preservedAudit).toBeDefined();
    });

    it("5.3 should reject privacy deletion request if user is covered by an active Legal Hold", async () => {
      // Create user
      const holdUser = {
        id: `usr_hold_${Date.now()}`,
        email: "held@sovereign.corp",
        passwordHash: validBcryptHash,
        firstName: "Held",
        lastName: "Person",
        active: true,
      };
      apiStore.users.set(holdUser.id, holdUser);
      apiStore.memberships.set(`mem_${holdUser.id}`, {
        id: `mem_${holdUser.id}`,
        organizationId: orgA.id,
        userId: holdUser.id,
        role: "MEMBER",
      });

      // Create Legal Hold specifically targeting this user
      complianceService.createLegalHold(
        orgA.id,
        {
          name: "SEC Investigation Hold",
          reason: "Employee subject to insider trading regulatory inquiry",
          targetType: "USER",
          targetId: holdUser.id,
          categories: ["AUDIT_LOGS", "WORKFLOW_EXECUTIONS"],
        },
        adminUserA.id,
      );

      // Submit and approve deletion request
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ userId: holdUser.id, requestType: "DELETION" });

      const reqId = submitRes.body.data.id;
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/review`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ decision: "APPROVED" });

      // Execute -> must be blocked with 409 LEGAL_HOLD_ACTIVE
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(execRes.status).toBe(409);
      expect(execRes.body.error.code).toBe("LEGAL_HOLD_ACTIVE");
    });

    it("5.4 should reject execution of non-approved privacy request", async () => {
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ requestType: "EXPORT" });

      const reqId = submitRes.body.data.id;

      // Attempt to execute while still in SUBMITTED state -> must fail
      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(execRes.status).toBe(400);
      expect(execRes.body.error.code).toBe("EXECUTION_FAILED");
    });

    it("5.5 should execute CORRECTION privacy request and update user profile fields", async () => {
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({
          requestType: "CORRECTION",
          details: { firstName: "Charles", lastName: "Operative" },
        });

      const reqId = submitRes.body.data.id;
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });

      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(execRes.status).toBe(200);
      expect(execRes.body.data.status).toBe("COMPLETED");

      const updatedUser = apiStore.users.get(memberUserA.id);
      expect(updatedUser?.firstName).toBe("Charles");
      expect(updatedUser?.lastName).toBe("Operative");
    });

    it("5.6 should execute RESTRICTION privacy request and deactivate account processing", async () => {
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .send({ requestType: "RESTRICTION" });

      const reqId = submitRes.body.data.id;
      await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/review`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ decision: "APPROVED" });

      const execRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqId}/execute`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(execRes.status).toBe(200);
      expect(execRes.body.data.status).toBe("COMPLETED");

      const restrictedUser = apiStore.users.get(memberUserA.id);
      expect(restrictedUser?.active).toBe(false);
    });

    it("5.7 should reject artifact download when download token is missing or invalid", async () => {
      const reqRecord = complianceService.submitPrivacyRequest(
        orgA.id,
        { requestType: "EXPORT" },
        memberUserA.id,
      );
      complianceService.reviewPrivacyRequest(
        orgA.id,
        reqRecord.id,
        { decision: "APPROVED" },
        adminUserA.id,
      );
      const executed = complianceService.executePrivacyRequest(
        orgA.id,
        reqRecord.id,
        adminUserA.id,
      );

      // Attempt to download with invalid token
      const badRes = await request(app)
        .get(
          `/api/v1/organizations/${orgA.id}/privacy/requests/${reqRecord.id}/artifact?token=wrong_token`,
        )
        .set("Authorization", `Bearer ${memberTokenA}`);

      expect(badRes.status).toBe(401);
      expect(badRes.body.error.code).toBe("INVALID_TOKEN");
    });
  });

  // ==========================================
  // 6. COMPLIANCE TECHNICAL CONTROLS & OVERVIEW
  // ==========================================
  describe("6. Compliance Technical Controls Inventory & Overview", () => {
    it("6.1 should return technical control mappings across SOC 2, ISO 27001, GDPR, and HIPAA", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/compliance/controls`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.frameworks).toContain("SOC2");
      expect(res.body.data.frameworks).toContain("ISO27001");
      expect(res.body.data.frameworks).toContain("GDPR");
      expect(res.body.data.frameworks).toContain("HIPAA");
      expect(res.body.data.summary.implemented).toBeGreaterThan(10);
    });

    it("6.2 should return governance overview metrics and compliance score", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/governance/overview`)
        .set("Authorization", `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.complianceScorePercentage).toBeGreaterThan(80);
      expect(res.body.data.retentionPoliciesCount).toBe(8);
      expect(res.body.data.auditChainVerification.verified).toBe(true);
    });
  });

  // ==========================================
  // 7. MULTI-TENANT ISOLATION
  // ==========================================
  describe("7. Multi-Tenant Isolation & Security Boundary Guarantees", () => {
    it("7.1 should prevent Tenant B from accessing Tenant A compliance endpoints", async () => {
      // 1. Audit verification
      const verifyRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/audit/verify`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(verifyRes.status).toBe(403);

      // 2. Retention policies
      const retRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/retention/policies`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(retRes.status).toBe(403);

      // 3. Legal holds
      const holdRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/legal-holds`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(holdRes.status).toBe(403);

      // 4. Privacy requests
      const privRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(privRes.status).toBe(403);
    });

    it("7.2 should prevent Tenant B member from submitting privacy requests targeting Tenant A", async () => {
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/privacy/requests`)
        .set("Authorization", `Bearer ${ownerTokenB}`)
        .send({ requestType: "EXPORT" });

      expect(submitRes.status).toBe(403);
      expect(submitRes.body.error.code).toBe("FORBIDDEN");
    });
  });
});
