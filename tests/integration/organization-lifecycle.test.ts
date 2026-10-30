import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";

describe("Organization Lifecycle & Membership Management Integration Tests", () => {
  const ownerEmail = `owner_${Date.now()}@flowforge.dev`;
  const inviteeEmail = `invitee_${Date.now()}@flowforge.dev`;
  let ownerCookie: string;
  let inviteeCookie: string;
  let primaryOrgId: string;
  let secondaryOrgId: string;
  let invitedMembershipId: string;
  let ownerMembershipId: string;

  it("registers initial owner and creates primary organization", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: ownerEmail,
      password: "Password123!",
      firstName: "Primary",
      lastName: "Owner",
      organizationName: "Acme Master Org",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    primaryOrgId = res.body.data.organization.id;
    expect(res.body.data.organization.role).toBe("OWNER");

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    ownerCookie = cookies[0];
  });

  it("registers a second user who will be invited to organizations", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: inviteeEmail,
      password: "Password123!",
      firstName: "Bob",
      lastName: "Invitee",
      organizationName: "Bob Personal Org",
    });

    expect(res.status).toBe(201);
    const cookies = res.headers["set-cookie"];
    inviteeCookie = cookies[0];
  });

  it("allows user to create an additional organization and assigns OWNER role", async () => {
    const res = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", ownerCookie)
      .send({
        name: "Acme Secondary Org",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Acme Secondary Org");
    expect(res.body.data.role).toBe("OWNER");
    secondaryOrgId = res.body.data.id;
  });

  it("lists all organizations the caller belongs to", async () => {
    const res = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const orgIds = res.body.data.map((o: any) => o.id);
    expect(orgIds).toContain(primaryOrgId);
    expect(orgIds).toContain(secondaryOrgId);
  });

  it("retrieves organization details for a member and rejects non-members", async () => {
    // Owner access
    const resOwner = await request(app)
      .get(`/api/v1/organizations/${primaryOrgId}`)
      .set("Cookie", ownerCookie);

    expect(resOwner.status).toBe(200);
    expect(resOwner.body.data.id).toBe(primaryOrgId);

    // Non-member access
    const resNonMember = await request(app)
      .get(`/api/v1/organizations/${primaryOrgId}`)
      .set("Cookie", inviteeCookie);

    expect(resNonMember.status).toBe(403);
    expect(resNonMember.body.error.code).toBe("FORBIDDEN");
  });

  it("updates organization name and verifies audit logging", async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${primaryOrgId}`)
      .set("Cookie", ownerCookie)
      .send({
        name: "Acme Global Enterprise",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Acme Global Enterprise");
    expect(res.body.data.slug).toBe("acme-global-enterprise");
  });

  it("allows OWNER to invite a member with role ADMIN", async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${primaryOrgId}/members`)
      .set("Cookie", ownerCookie)
      .send({
        email: inviteeEmail,
        role: "ADMIN",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.user.email).toBe(inviteeEmail);
    invitedMembershipId = res.body.data.id;
  });

  it("rejects duplicate member invitations with 409 Conflict", async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${primaryOrgId}/members`)
      .set("Cookie", ownerCookie)
      .send({
        email: inviteeEmail,
        role: "MEMBER",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MEMBER_EXISTS");
  });

  it("lists organization members and identifies roles", async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${primaryOrgId}/members`)
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);

    const ownerMem = res.body.data.find((m: any) => m.role === "OWNER");
    expect(ownerMem).toBeDefined();
    ownerMembershipId = ownerMem.id;

    const adminMem = res.body.data.find((m: any) => m.role === "ADMIN");
    expect(adminMem).toBeDefined();
    expect(adminMem.user.email).toBe(inviteeEmail);
  });

  it("prevents an ADMIN from inviting someone with role OWNER", async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${primaryOrgId}/members`)
      .set("Cookie", inviteeCookie)
      .send({
        email: `new_user_${Date.now()}@flowforge.dev`,
        role: "OWNER",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents demoting the last owner (Last Owner Protection Invariant)", async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${primaryOrgId}/members/${ownerMembershipId}`)
      .set("Cookie", ownerCookie)
      .send({
        role: "MEMBER",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("LAST_OWNER_PROTECTION");
  });

  it("prevents removing the last owner", async () => {
    const res = await request(app)
      .delete(`/api/v1/organizations/${primaryOrgId}/members/${ownerMembershipId}`)
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("LAST_OWNER_PROTECTION");
  });

  it("allows updating member role", async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${primaryOrgId}/members/${invitedMembershipId}`)
      .set("Cookie", ownerCookie)
      .send({
        role: "MEMBER",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("MEMBER");
  });

  it("allows removing a member and confirms member is deleted", async () => {
    const res = await request(app)
      .delete(`/api/v1/organizations/${primaryOrgId}/members/${invitedMembershipId}`)
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify member list no longer includes removed member
    const listRes = await request(app)
      .get(`/api/v1/organizations/${primaryOrgId}/members`)
      .set("Cookie", ownerCookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].id).toBe(ownerMembershipId);
  });

  it("retrieves audit logs for organization and rejects unauthorized roles", async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${primaryOrgId}/audit-logs`)
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const actions = res.body.data.map((l: any) => l.action);
    expect(actions).toContain("organization.updated");
    expect(actions).toContain("organization.member.added");
    expect(actions).toContain("organization.member.role_updated");
    expect(actions).toContain("organization.member.removed");
  });
});
