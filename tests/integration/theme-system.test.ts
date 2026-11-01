import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/templates",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { ThemeToggle } from "../../apps/web/src/components/ThemeToggle.js";
import { ThemeProvider } from "../../apps/web/src/components/ThemeProvider.js";
import { TopBar } from "../../apps/web/src/components/TopBar.js";
import { Card } from "../../apps/web/src/components/ui/Card.js";

describe("Global Theme Consistency & Design Token System", () => {
  const globalsCssPath = path.resolve(
    __dirname,
    "../../apps/web/src/app/globals.css",
  );
  const globalsCss = fs.readFileSync(globalsCssPath, "utf8");

  describe("Semantic Design Tokens Verification", () => {
    const requiredTokens = [
      "--app-bg",
      "--surface-primary",
      "--surface-secondary",
      "--surface-elevated",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--border-default",
      "--border-subtle",
      "--accent-primary",
      "--accent-hover",
      "--focus-ring",
      "--success-bg",
      "--warning-bg",
      "--danger-bg",
      "--info-bg",
    ];

    it.each(requiredTokens)(
      "defines semantic token %s in globals.css",
      (token) => {
        expect(globalsCss).toContain(token);
      },
    );

    it("defines distinct dark mode token overrides under [data-theme='dark'] or .dark", () => {
      expect(globalsCss).toContain('[data-theme="dark"]');
      expect(globalsCss).toContain(".dark");
      expect(globalsCss).toMatch(
        /\[data-theme="dark"\],\s*\.dark\s*\{[^}]*--app-bg:\s*#090d16/,
      );
    });
  });

  describe("Application Shell Theme Integration", () => {
    it("renders TopBar with ThemeToggle and theme-aware surface classes", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(TopBar, {
            collapsed: false,
            onOpenMobileMenu: () => {},
          }),
        ),
      );

      // Verify TopBar contains dark mode class mappings
      expect(html).toContain("dark:border-slate-800");
      expect(html).toContain("dark:bg-slate-900/95");
      // Verify theme toggle button is present with accessible label
      expect(html).toMatch(/aria-label="Switch to (dark|light) theme"/);
    });

    it("renders shared Card component with dual-theme classes", () => {
      const html = renderToStaticMarkup(
        React.createElement(Card, { variant: "default" }, "Card Content"),
      );
      expect(html).toContain("dark:bg-slate-900");
      expect(html).toContain("dark:border-slate-800");
    });
  });

  describe("Templates & Route Content Audit", () => {
    it("verifies Templates page does NOT contain hardcoded isolated dark shell box", () => {
      const templatesPagePath = path.resolve(
        __dirname,
        "../../apps/web/src/app/templates/page.tsx",
      );
      const templatesSource = fs.readFileSync(templatesPagePath, "utf8");

      // Verify hardcoded disconnected shell was removed
      expect(templatesSource).not.toContain(
        '<div className="min-h-screen bg-slate-950 text-slate-100">',
      );
      // Verify semantic max-w-7xl dual-theme container is present
      expect(templatesSource).toContain(
        "w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100",
      );
    });

    it("verifies Analytics, Policies, and Search pages use responsive dual-theme containers", () => {
      const pages = [
        "apps/web/src/app/analytics/page.tsx",
        "apps/web/src/app/policies/page.tsx",
        "apps/web/src/app/search/page.tsx",
        "apps/web/src/app/settings/developer/page.tsx",
      ];

      for (const p of pages) {
        const fullPath = path.resolve(__dirname, "../../", p);
        const source = fs.readFileSync(fullPath, "utf8");
        expect(source).not.toContain(
          "min-h-screen bg-slate-950 text-slate-100 p-8",
        );
        expect(source).not.toContain(
          "min-h-screen bg-slate-950 text-slate-100 p-6",
        );
        expect(source).toContain("dark:text-slate-100");
      }
    });
  });
});
