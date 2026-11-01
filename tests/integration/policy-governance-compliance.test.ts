import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { apiStore } from "../../apps/api/src/store.js";
import {
  WorkflowDefinition,
  CreatePolicyRequest,
  PolicyRecord,
  Role,
} from "@flowforge/shared";

describe("Prompt 33 — Policy-as-Code, Automated Governance, and Compliance Enforcement", () => {
  const validBcryptHash =
    "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY5k7rhKhGfdW.q";

  const orgA = {
    id: "org_policy_alpha",
    name: "Policy Alpha Corp",
    slug: "policy-alpha",
    billingEmail: "admin@policyalpha.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgB = {
    id: "org_policy_beta",
    name: "Policy Beta Corp",
    slug: "policy-beta",
    billingEmail: "admin@policybeta.io",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let ownerUserA: any;
  let adminUserA: any;
  let memberUserA: any;
  let viewerUserA: any;
  let ownerUserB: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let memberTokenA: string;
  let viewerTokenA: string;
  let ownerTokenB: string;

  const sampleDefinition: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger",
        type: "TRIGGER",
        name: "Manual Start",
        config: { triggerType: "MANUAL" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node_http",
        type: "HTTP_REQUEST",
        name: "External API Call",
        config: {
          url: "https://untrusted-external-domain.com/webhook",
          method: "POST",
        },
        position: { x: 50, y: 150 },
      },
      {
        id: "node_end",
        type: "END",
        name: "Done",
        config: {},
        position: { x: 50, y: 250 },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger", target: "node_http" },
      { id: "e2", source: "node_http", target: "node_end" },
    ],
  };

  beforeEach(() => {
    apiStore.clear();

    apiStore.organizations.set(orgA.id, orgA);
    apiStore.organizations.set(orgB.id, orgB);

    ownerUserA = {
      id: `usr_owner_a_${Date.now()}`,
      email: "owner@policyalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    adminUserA = {
      id: `usr_admin_a_${Date.now()}`,
      email: "admin@policyalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    memberUserA = {
      id: `usr_member_a_${Date.now()}`,
      email: "member@policyalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    viewerUserA = {
      id: `usr_viewer_a_${Date.now()}`,
      email: "viewer@policyalpha.io",
      passwordHash: validBcryptHash,
      active: true,
    };
    ownerUserB = {
      id: `usr_owner_b_${Date.now()}`,
      email: "owner@policybeta.io",
      passwordHash: validBcryptHash,
      active: true,
    };

    apiStore.users.set(ownerUserA.id, ownerUserA);
    apiStore.users.set(adminUserA.id, adminUserA);
    apiStore.users.set(memberUserA.id, memberUserA);
    apiStore.users.set(viewerUserA.id, viewerUserA);
    apiStore.users.set(ownerUserB.id, ownerUserB);

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
    apiStore.memberships.set("mem_a4", {
      id: "mem_a4",
      organizationId: orgA.id,
      userId: viewerUserA.id,
      role: "VIEWER",
    });
    apiStore.memberships.set("mem_b1", {
      id: "mem_b1",
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: "OWNER",
    });

    ownerTokenA = `tok_owner_a_${Date.now()}`;
    adminTokenA = `tok_admin_a_${Date.now()}`;
    memberTokenA = `tok_member_a_${Date.now()}`;
    viewerTokenA = `tok_viewer_a_${Date.now()}`;
    ownerTokenB = `tok_owner_b_${Date.now()}`;

    apiStore.sessions.set(ownerTokenA, {
      id: "sess_owner_a",
      userId: ownerUserA.id,
      token: ownerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(adminTokenA, {
      id: "sess_admin_a",
      userId: adminUserA.id,
      token: adminTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(memberTokenA, {
      id: "sess_member_a",
      userId: memberUserA.id,
      token: memberTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(viewerTokenA, {
      id: "sess_viewer_a",
      userId: viewerUserA.id,
      token: viewerTokenA,
      expiresAt: new Date(Date.now() + 86400000),
    });
    apiStore.sessions.set(ownerTokenB, {
      id: "sess_owner_b",
      userId: ownerUserB.id,
      token: ownerTokenB,
      expiresAt: new Date(Date.now() + 86400000),
    });
  });

  describe("1. Policy Model & Lifecycle Management", () => {
    it("creates a draft policy with valid rules schema", async () => {
      const payload: CreatePolicyRequest = {
        name: "Outbound Network Boundary Standard",
        description:
          "Restricts external HTTP calls to verified enterprise domains.",
        category: "WORKFLOW_SAFETY",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH", "EXECUTE"],
        priority: 50,
        rules: [
          {
            id: "rule_allowed_domains",
            name: "Enforce Approved Destination Domains",
            conditions: [
              {
                field: "destinationDomains",
                operator: "NOT_CONTAINS",
                value: "api.stripe.com",
              },
            ],
            logicalOperator: "AND",
            outcome: "DENY",
            severity: "HIGH",
            reasonCode: "UNAPPROVED_DESTINATION",
            message:
              "Workflows may only dispatch outbound traffic to approved endpoints.",
          },
        ],
        complianceControls: ["SOC2_CC6_6"],
      };

      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toMatch(/^pol_/);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.rules).toHaveLength(1);
    });

    it("rejects policy creation with invalid schema", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          name: "",
          rules: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("transitions draft policy through review, dual-control approval, and activation", async () => {
      // 1. Author policy as adminUserA
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          name: "High-Risk Node Safety Gate",
          category: "WORKFLOW_SAFETY",
          applicableResourceTypes: ["WORKFLOW"],
          applicableOperations: ["PUBLISH"],
          rules: [
            {
              id: "rule_no_extension_nodes",
              name: "Disallow Extension Nodes in Production",
              conditions: [
                {
                  field: "nodeTypes",
                  operator: "CONTAINS",
                  value: "EXTENSION_NODE",
                },
              ],
              outcome: "DENY",
              severity: "CRITICAL",
              reasonCode: "EXTENSION_NODE_PROHIBITED",
              message:
                "Custom extension nodes cannot be deployed directly to production.",
            },
          ],
        });
      const policyId = createRes.body.data.id;

      // 2. Submit for review
      const reviewRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/review`)
        .set("Authorization", `Bearer ${adminTokenA}`);
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe("IN_REVIEW");

      // 3. Dual-control check: Author adminUserA cannot approve their own policy
      const selfApproveRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/approve`)
        .set("Authorization", `Bearer ${adminTokenA}`);
      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.code).toBe("DUAL_CONTROL_VIOLATION");

      // 4. Second user (ownerUserA) approves policy
      const approveRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/approve`)
        .set("Authorization", `Bearer ${ownerTokenA}`);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe("APPROVED");

      // 5. Activate approved policy
      const activateRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/activate`)
        .set("Authorization", `Bearer ${adminTokenA}`);
      expect(activateRes.status).toBe(200);
      expect(activateRes.body.data.status).toBe("ACTIVE");
    });

    it("supports suspending and rolling back policies to previous snapshots", async () => {
      // Create and activate policy
      const policy = apiStore.policies.get("pol_wf_safety_prod");
      const policyId = "pol_test_rollback";
      apiStore.policies.set(policyId, {
        id: policyId,
        organizationId: orgA.id,
        name: "Rollback Test Policy",
        category: "WORKFLOW_SAFETY",
        version: 2,
        status: "ACTIVE",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 10,
        rules: [
          {
            id: "rule_v2",
            name: "V2 Strict Rule",
            conditions: [
              { field: "nodeCount", operator: "GREATER_THAN", value: 5 },
            ],
            outcome: "DENY",
            severity: "HIGH",
            reasonCode: "TOO_MANY_NODES",
            message: "Node count exceeded",
          },
        ],
        complianceControls: [],
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Snapshot version 1
      apiStore.policyVersions.set("ver_1_snap", {
        id: "ver_1_snap",
        policyId,
        organizationId: orgA.id,
        version: 1,
        definition: {
          name: "Rollback Test Policy (Original)",
          category: "WORKFLOW_SAFETY",
          applicableResourceTypes: ["WORKFLOW"],
          applicableOperations: ["PUBLISH"],
          priority: 10,
          rules: [
            {
              id: "rule_v1",
              name: "V1 Lenient Rule",
              conditions: [
                { field: "nodeCount", operator: "GREATER_THAN", value: 100 },
              ],
              outcome: "DENY",
              severity: "LOW",
              reasonCode: "LENIENT_LIMIT",
              message: "Lenient limit exceeded",
            },
          ],
          complianceControls: [],
        },
        approvedById: ownerUserA.id,
        approvedAt: new Date(),
        createdAt: new Date(),
      });

      // Suspend
      const suspendRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/suspend`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ reason: "Temporarily testing rollback" });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.status).toBe("SUSPENDED");

      // Rollback to version 1
      const rollbackRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/rollback`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({ targetVersion: 1 });
      expect(rollbackRes.status).toBe(200);
      expect(rollbackRes.body.data.version).toBe(3);
      expect(rollbackRes.body.data.rules[0].id).toBe("rule_v1");
    });
  });

  describe("2. Workflow Governance Enforcement on Publication & Validation", () => {
    it("blocks workflow publication when an active policy rule evaluates to DENY", async () => {
      // 1. Create and activate blocking policy: Deny workflows with unapproved HTTP destinations
      const policyId = "pol_block_unapproved_http";
      apiStore.policies.set(policyId, {
        id: policyId,
        organizationId: orgA.id,
        name: "Prohibit Unapproved Outbound Destinations",
        category: "WORKFLOW_SAFETY",
        version: 1,
        status: "ACTIVE",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 10,
        rules: [
          {
            id: "rule_block_untrusted",
            name: "Block untrusted webhook hosts",
            conditions: [
              {
                field: "destinationDomains",
                operator: "CONTAINS",
                value: "untrusted-external-domain.com",
              },
            ],
            outcome: "DENY",
            severity: "CRITICAL",
            reasonCode: "UNAPPROVED_DESTINATION",
            message:
              "Destination 'untrusted-external-domain.com' is not on approved enterprise list.",
          },
        ],
        complianceControls: ["SOC2_CC6_6"],
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Seed a workflow containing untrusted domain in draft
      const wf = {
        id: "wf_violating_draft_1",
        organizationId: orgA.id,
        name: "Unsafe Integration Workflow",
        status: "DRAFT" as const,
        draftDefinition: sampleDefinition,
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.workflows.set(wf.id, wf);

      // 3. Attempt publication -> Expect 403 POLICY_VIOLATION
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${wf.id}/publish`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(pubRes.status).toBe(403);
      expect(pubRes.body.success).toBe(false);
      expect(pubRes.body.error.code).toBe("POLICY_VIOLATION");
      expect(pubRes.body.error.details.violations).toHaveLength(1);
      expect(pubRes.body.error.details.violations[0].reasonCode).toBe(
        "UNAPPROVED_DESTINATION",
      );

      // Verify a PolicyViolationRecord was automatically created
      const violations = Array.from(apiStore.policyViolations.values());
      expect(violations.some((v) => v.resourceId === wf.id)).toBe(true);
    });

    it("requires explicit administrative approval when policy outcome is REQUIRE_APPROVAL", async () => {
      // 1. Create policy requiring approval for flows touching RESTRICTED data
      const policyId = "pol_require_approval_restricted";
      apiStore.policies.set(policyId, {
        id: policyId,
        organizationId: orgA.id,
        name: "Require Approval for Restricted Data Workflows",
        category: "DATA_PROTECTION",
        version: 1,
        status: "ACTIVE",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 10,
        rules: [
          {
            id: "rule_approval_restricted",
            name: "Approval Required for Restricted Flows",
            conditions: [
              {
                field: "dataClassification",
                operator: "EQUALS",
                value: "RESTRICTED",
              },
            ],
            outcome: "REQUIRE_APPROVAL",
            requiredRole: "ADMIN",
            severity: "HIGH",
            reasonCode: "APPROVAL_GATE_RESTRICTED_DATA",
            message:
              "Workflows handling RESTRICTED data require explicit administrator approval before publish.",
          },
        ],
        complianceControls: ["GDPR_ART32"],
        createdById: ownerUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Seed a safe workflow marked as RESTRICTED
      const safeDefinition: WorkflowDefinition = {
        nodes: [
          {
            id: "t1",
            type: "TRIGGER",
            name: "Trigger",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "e1",
            type: "END",
            name: "End",
            config: {},
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", source: "t1", target: "e1" }],
      };

      const wf = {
        id: "wf_restricted_data_2",
        organizationId: orgA.id,
        name: "Restricted Payroll Processor",
        dataClassification: "RESTRICTED",
        status: "DRAFT" as const,
        draftDefinition: safeDefinition,
        createdById: memberUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.workflows.set(wf.id, wf);

      // 3. Attempt publication -> Expect 403 POLICY_APPROVAL_REQUIRED
      const pubRes = await request(app)
        .post(`/api/v1/workflows/${wf.id}/publish`)
        .set("Authorization", `Bearer ${memberTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(pubRes.status).toBe(403);
      expect(pubRes.body.success).toBe(false);
      expect(pubRes.body.error.code).toBe("POLICY_APPROVAL_REQUIRED");
      expect(pubRes.body.error.details.requiredRole).toBe("ADMIN");
    });

    it("surfaces policy evaluation details and warnings during workflow draft validation", async () => {
      const wf = {
        id: "wf_validate_preview",
        organizationId: orgA.id,
        name: "Validation Test Flow",
        status: "DRAFT" as const,
        draftDefinition: sampleDefinition,
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.workflows.set(wf.id, wf);

      const valRes = await request(app)
        .post(`/api/v1/workflows/${wf.id}/validate`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);

      expect(valRes.status).toBe(200);
      expect(valRes.body.success).toBe(true);
      expect(valRes.body.data.isValid).toBe(true);
      expect(valRes.body.data.policyDecision).toBeDefined();
      expect(valRes.body.data.policyDecision.evaluatedAt).toBeDefined();
    });
  });

  describe("3. Time-Limited Exceptions & Overrides", () => {
    it("allows a previously blocked workflow to publish once a time-limited exception is approved", async () => {
      // 1. Configure policy blocking workflows with > 1 node
      const policyId = "pol_strict_one_node";
      apiStore.policies.set(policyId, {
        id: policyId,
        organizationId: orgA.id,
        name: "Temporary Node Limit",
        category: "WORKFLOW_SAFETY",
        version: 1,
        status: "ACTIVE",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 10,
        rules: [
          {
            id: "rule_max_node_1",
            name: "Max 1 Node Allowed",
            conditions: [
              { field: "nodeCount", operator: "GREATER_THAN", value: 1 },
            ],
            outcome: "DENY",
            severity: "HIGH",
            reasonCode: "NODE_COUNT_EXCEEDED",
            message: "Workflows cannot exceed 1 node.",
          },
        ],
        complianceControls: [],
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const safeDef: WorkflowDefinition = {
        nodes: [
          {
            id: "n1",
            type: "TRIGGER",
            name: "T",
            config: { triggerType: "MANUAL" },
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            type: "END",
            name: "E",
            config: {},
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      };

      const wf = {
        id: "wf_needs_exception",
        organizationId: orgA.id,
        name: "High Priority Two Node Flow",
        status: "DRAFT" as const,
        draftDefinition: safeDef,
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.workflows.set(wf.id, wf);

      // Verify publish is initially blocked
      const initialPub = await request(app)
        .post(`/api/v1/workflows/${wf.id}/publish`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);
      expect(initialPub.status).toBe(403);
      expect(initialPub.body.error.code).toBe("POLICY_VIOLATION");

      // 2. Request an exception
      const reqExRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/exceptions`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          policyId,
          ruleId: "rule_max_node_1",
          resourceType: "WORKFLOW",
          resourceId: wf.id,
          operation: "PUBLISH",
          reason: "Approved emergency maintenance release requiring 2 nodes.",
          expiresInHours: 4,
        });
      expect(reqExRes.status).toBe(201);
      const exceptionId = reqExRes.body.data.id;
      expect(reqExRes.body.data.status).toBe("PENDING");

      // 3. Admin/Owner approves the exception
      const decideRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.id}/policies/exceptions/${exceptionId}/decide`,
        )
        .set("Authorization", `Bearer ${ownerTokenA}`)
        .send({ decision: "APPROVED" });
      expect(decideRes.status).toBe(200);
      expect(decideRes.body.data.status).toBe("APPROVED");

      // 4. Retry publication -> Exception applies, publication succeeds!
      const finalPub = await request(app)
        .post(`/api/v1/workflows/${wf.id}/publish`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .set("x-organization-id", orgA.id);
      expect(finalPub.status).toBe(201);
      expect(finalPub.body.success).toBe(true);
      expect(finalPub.body.data.version.id).toBeDefined();
      expect(finalPub.body.data.workflow.publishedVersionId).toBeDefined();
    });
  });

  describe("4. Policy Simulation & Dry-Run Evaluation", () => {
    it("simulates policy conditions without external side-effects or state mutation", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/simulate`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          policy: {
            name: "Mock Simulation Policy",
            category: "WORKFLOW_SAFETY",
            applicableResourceTypes: ["WORKFLOW"],
            applicableOperations: ["PUBLISH"],
            rules: [
              {
                id: "rule_sim_regex",
                name: "Regex Domain Filter",
                conditions: [
                  {
                    field: "targetDomain",
                    operator: "MATCHES_REGEX",
                    value: "^api\\.internal\\..*$",
                  },
                ],
                outcome: "ALLOW",
                severity: "LOW",
                reasonCode: "INTERNAL_API_MATCH",
                message: "Matches trusted internal domain regex pattern.",
              },
            ],
          },
          context: {
            resourceType: "WORKFLOW",
            operation: "PUBLISH",
            attributes: {
              targetDomain: "api.internal.billing.acme.corp",
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.decision).toBe("ALLOW");
      expect(res.body.data.matchedPolicies).toHaveLength(1);
      expect(res.body.data.evaluationDurationMs).toBeGreaterThanOrEqual(0);

      // Verify no DB violations or policies were saved
      expect(apiStore.policies.size).toBe(0);
      expect(apiStore.policyViolations.size).toBe(0);
    });

    it("handles safe regex validation with catastrophic backtracking protection", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/simulate`)
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          policy: {
            name: "ReDoS Test Policy",
            category: "WORKFLOW_SAFETY",
            applicableResourceTypes: ["WORKFLOW"],
            applicableOperations: ["PUBLISH"],
            rules: [
              {
                id: "rule_malformed_regex",
                name: "Malformed Regex",
                conditions: [
                  {
                    field: "payload",
                    operator: "MATCHES_REGEX",
                    value: "[a-z+(\\", // Malformed regex
                  },
                ],
                outcome: "DENY",
                severity: "HIGH",
                reasonCode: "INVALID_REGEX",
                message: "Invalid regex test",
              },
            ],
          },
          context: {
            resourceType: "WORKFLOW",
            operation: "PUBLISH",
            attributes: { payload: "test" },
          },
        });

      // Does not throw 500; gracefully evaluates malformed regex as false
      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe("ALLOW");
    });
  });

  describe("5. Violations Tracking & Remediation Workflows", () => {
    it("lists recorded violations and allows updating resolution status", async () => {
      // 1. Seed a violation
      const viol = {
        id: "viol_sample_99",
        organizationId: orgA.id,
        policyId: "pol_1",
        policyVersion: 1,
        ruleId: "rule_1",
        resourceType: "WORKFLOW" as const,
        resourceId: "wf_bad_123",
        operation: "PUBLISH" as const,
        severity: "HIGH" as const,
        reasonCode: "POLICY_VIOLATION",
        message: "Prohibited configuration detected",
        status: "OPEN" as const,
        detectedAt: new Date(),
      };
      apiStore.policyViolations.set(viol.id, viol);

      // 2. Fetch list
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/policies/violations?status=OPEN`)
        .set("Authorization", `Bearer ${adminTokenA}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(viol.id);

      // 3. Resolve violation
      const patchRes = await request(app)
        .patch(
          `/api/v1/organizations/${orgA.id}/policies/violations/${viol.id}`,
        )
        .set("Authorization", `Bearer ${adminTokenA}`)
        .send({
          status: "RESOLVED",
          assignedToId: adminUserA.id,
          remediationNotes: "Config updated to compliant endpoint.",
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.status).toBe("RESOLVED");
      expect(patchRes.body.data.resolvedAt).toBeDefined();
    });
  });

  describe("6. Multi-Tenant Isolation & Role-Based Access Control", () => {
    it("enforces strict tenant isolation preventing Tenant B from viewing or managing Tenant A policies", async () => {
      // Create Tenant A policy
      const policyA: PolicyRecord = {
        id: "pol_tenant_a_secret",
        organizationId: orgA.id,
        name: "Tenant A Proprietary Rules",
        category: "WORKFLOW_SAFETY",
        version: 1,
        status: "ACTIVE",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 1,
        rules: [],
        complianceControls: [],
        createdById: ownerUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiStore.policies.set(policyA.id, policyA);

      // Tenant B queries Tenant A policies -> Returns empty list
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/policies`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(0);

      // Tenant B tries to get Tenant A policy directly -> 404
      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/policies/${policyA.id}`)
        .set("Authorization", `Bearer ${ownerTokenB}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe("POLICY_NOT_FOUND");
    });

    it("enforces RBAC permissions: VIEWER cannot create policies, MEMBER cannot activate", async () => {
      // VIEWER cannot create policy
      const viewerRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies`)
        .set("Authorization", `Bearer ${viewerTokenA}`)
        .send({
          name: "Viewer Policy",
          applicableResourceTypes: ["WORKFLOW"],
          applicableOperations: ["PUBLISH"],
          rules: [],
        });
      expect(viewerRes.status).toBe(403);
      expect(viewerRes.body.error.code).toBe("FORBIDDEN");

      // Seed approved policy
      const policyId = "pol_approved_for_member_test";
      apiStore.policies.set(policyId, {
        id: policyId,
        organizationId: orgA.id,
        name: "Test Policy",
        category: "WORKFLOW_SAFETY",
        version: 1,
        status: "APPROVED",
        applicableResourceTypes: ["WORKFLOW"],
        applicableOperations: ["PUBLISH"],
        priority: 10,
        rules: [],
        complianceControls: [],
        createdById: adminUserA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // MEMBER cannot activate (requires policy:admin)
      const memberActivateRes = await request(app)
        .post(`/api/v1/organizations/${orgA.id}/policies/${policyId}/activate`)
        .set("Authorization", `Bearer ${memberTokenA}`);
      expect(memberActivateRes.status).toBe(403);
      expect(memberActivateRes.body.error.code).toBe("FORBIDDEN");
    });
  });
});
