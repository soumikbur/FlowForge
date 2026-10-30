import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  hasPermission,
  Role,
  Permission,
} from "@flowforge/shared";

describe("Organization RBAC & Role Permissions Unit Tests", () => {
  it("enforces that OWNER possesses all administrative and sensitive permissions", () => {
    const ownerPermissions = ROLE_PERMISSIONS.OWNER;
    expect(ownerPermissions).toContain("org:delete");
    expect(ownerPermissions).toContain("org:owner:transfer");
    expect(ownerPermissions).toContain("org:members:write");
    expect(ownerPermissions).toContain("org:members:delete");
    expect(ownerPermissions).toContain("workflow:write");
    expect(ownerPermissions).toContain("workflow:publish");
    expect(ownerPermissions).toContain("workflow:delete");
    expect(ownerPermissions).toContain("audit:read");
    expect(hasPermission("OWNER", "org:delete")).toBe(true);
    expect(hasPermission("OWNER", "org:owner:transfer")).toBe(true);
  });

  it("enforces that ADMIN has management rights but cannot delete organization or transfer root ownership", () => {
    expect(hasPermission("ADMIN", "workflow:write")).toBe(true);
    expect(hasPermission("ADMIN", "workflow:publish")).toBe(true);
    expect(hasPermission("ADMIN", "workflow:delete")).toBe(true);
    expect(hasPermission("ADMIN", "org:members:write")).toBe(true);
    expect(hasPermission("ADMIN", "audit:read")).toBe(true);

    // Administrative boundary invariants:
    expect(hasPermission("ADMIN", "org:delete")).toBe(false);
    expect(hasPermission("ADMIN", "org:owner:transfer")).toBe(false);
  });

  it("enforces that MEMBER has read & execute privileges only", () => {
    expect(hasPermission("MEMBER", "org:read")).toBe(true);
    expect(hasPermission("MEMBER", "org:members:read")).toBe(true);
    expect(hasPermission("MEMBER", "workflow:read")).toBe(true);
    expect(hasPermission("MEMBER", "workflow:execute")).toBe(true);
    expect(hasPermission("MEMBER", "approval:read")).toBe(true);

    // Restricted operations:
    expect(hasPermission("MEMBER", "workflow:write")).toBe(false);
    expect(hasPermission("MEMBER", "workflow:publish")).toBe(false);
    expect(hasPermission("MEMBER", "workflow:delete")).toBe(false);
    expect(hasPermission("MEMBER", "org:write")).toBe(false);
    expect(hasPermission("MEMBER", "org:members:write")).toBe(false);
    expect(hasPermission("MEMBER", "org:members:delete")).toBe(false);
    expect(hasPermission("MEMBER", "audit:read")).toBe(false);
  });

  it("correctly identifies unknown role or invalid permission as false", () => {
    expect(hasPermission("UNKNOWN" as Role, "workflow:read")).toBe(false);
    expect(hasPermission("MEMBER", "invalid:perm" as Permission)).toBe(false);
  });
});

