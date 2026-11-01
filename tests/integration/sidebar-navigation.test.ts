import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import request from "supertest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/dist/client/components/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { Sidebar } from "../../apps/web/src/components/Sidebar.js";
import { TopBar } from "../../apps/web/src/components/TopBar.js";
import { app } from "../../apps/api/src/app.js";

describe("Sidebar and TopBar Navigation & Zero-Download Guarantee", () => {
  const sidebarRoutes = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Workflows", href: "/workflows" },
    { label: "Templates", href: "/templates" },
    { label: "Executions", href: "/executions" },
    { label: "Approvals", href: "/approvals" },
    { label: "Unified Search", href: "/search" },
    { label: "Analytics", href: "/analytics" },
    { label: "Policies", href: "/policies" },
    { label: "Quotas & Rates", href: "/quotas" },
    { label: "Developer & API", href: "/settings/developer" },
    { label: "Organization", href: "/settings" },
    { label: "Sign out", href: "/login" },
  ];

  it("renders all defined navigation items with correct in-app route destinations", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sidebar, {
        collapsed: false,
        onToggleCollapse: () => {},
        mobileOpen: false,
        onCloseMobile: () => {},
      }),
    );

    for (const route of sidebarRoutes) {
      expect(html).toContain(`href="${route.href}"`);
    }
  });

  it("ensures ZERO download attributes exist on any sidebar anchor elements", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sidebar, {
        collapsed: false,
        onToggleCollapse: () => {},
        mobileOpen: false,
        onCloseMobile: () => {},
      }),
    );

    // Verify there is no download="" or download attribute anywhere on the rendered sidebar markup
    expect(html).not.toMatch(/<a[^>]*\bdownload\b/i);
  });

  it("ensures ZERO download attributes exist on TopBar breadcrumbs or search shortcuts", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopBar, {
        collapsed: false,
        onOpenMobileMenu: () => {},
      }),
    );

    expect(html).not.toMatch(/<a[^>]*\bdownload\b/i);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/search"');
  });

  it("verifies that explicit API workflow export endpoints preserve Content-Disposition attachment", async () => {
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `export_audit_${Date.now()}@flowforge.dev`,
        password: "Password123!Secure",
        firstName: "Export",
        lastName: "Auditor",
        organizationName: "Export Integrity Corp",
      });

    expect(regRes.status).toBe(201);
    const cookie = regRes.headers["set-cookie"][0];

    const wfRes = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", cookie)
      .send({
        name: "Legitimate Export Verification Flow",
        description:
          "Checking that export attachment headers remain fully active",
      });

    expect(wfRes.status).toBe(201);
    const workflowId = wfRes.body.data.id;

    const exportRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}/export?target=draft`)
      .set("Cookie", cookie);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-disposition"]).toBeDefined();
    expect(exportRes.headers["content-disposition"]).toContain("attachment");
    expect(exportRes.headers["content-disposition"]).toContain(".json");
  });
});
