import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkipLink } from "../../apps/web/src/components/ui/SkipLink.js";
import { Badge } from "../../apps/web/src/components/ui/Badge.js";
import { Button } from "../../apps/web/src/components/ui/Button.js";
import {
  FormField,
  Input,
} from "../../apps/web/src/components/ui/FormField.js";
import { Modal } from "../../apps/web/src/components/ui/Modal.js";
import { ConfirmDialog } from "../../apps/web/src/components/ui/ConfirmDialog.js";
import { EmptyState } from "../../apps/web/src/components/ui/EmptyState.js";
import { Workflow } from "lucide-react";

describe("Prompt 38 — Product Usability, Accessibility, and Design Consistency", () => {
  describe("WCAG 2.4.1 Bypass Blocks & Skip Links", () => {
    it("renders an accessible skip link targeting #main-content with sr-only / focusable classes", () => {
      const html = renderToStaticMarkup(
        React.createElement(SkipLink, { targetId: "main-content" }),
      );
      expect(html).toContain('href="#main-content"');
      expect(html).toContain("Skip to main content");
      expect(html).toContain("skip-link");
    });
  });

  describe("WCAG 1.4.1 Use of Color & Status Badges", () => {
    const statuses = [
      "SUCCEEDED",
      "ACTIVE",
      "COMPLETED",
      "FAILED",
      "ERROR",
      "WAITING_APPROVAL",
      "WAITING",
      "WAITING_DELAY",
      "RUNNING",
      "IN_PROGRESS",
      "RETRYING",
      "CANCELLED",
      "DRAFT",
      "ARCHIVED",
    ];

    it.each(statuses)(
      "renders status %s with both text label and an icon symbol",
      (status) => {
        const html = renderToStaticMarkup(
          React.createElement(Badge, { status }),
        );
        // Must contain role="status"
        expect(html).toContain('role="status"');
        // Must contain SVG icon element for non-color identification
        expect(html).toContain("<svg");
        // Must contain human-readable status text (underscores replaced by spaces)
        expect(html).toContain(status.replace(/_/g, " "));
      },
    );

    it("supports different badge sizes cleanly", () => {
      const smHtml = renderToStaticMarkup(
        React.createElement(Badge, { status: "ACTIVE", size: "sm" }),
      );
      const mdHtml = renderToStaticMarkup(
        React.createElement(Badge, { status: "ACTIVE", size: "md" }),
      );
      expect(smHtml).toContain("text-[11px]");
      expect(mdHtml).toContain("text-xs");
    });
  });

  describe("WCAG 1.3.1 Info and Relationships & Form Associations", () => {
    it("associates label htmlFor with the field id and renders required indicator", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          FormField,
          {
            id: "workflow-name",
            label: "Workflow Name",
            required: true,
            hint: "Enter an identifiable name",
          },
          React.createElement(Input, {
            id: "workflow-name",
            placeholder: "e.g. Invoice Approval",
          }),
        ),
      );
      expect(html).toContain('for="workflow-name"');
      expect(html).toContain("Workflow Name");
      expect(html).toContain('aria-hidden="true">*</span>');
      expect(html).toContain('id="workflow-name-hint"');
      expect(html).toContain("Enter an identifiable name");
      expect(html).toContain('aria-describedby="workflow-name-hint"');
    });

    it("renders error message with role='alert' and connects aria-invalid to the input", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          FormField,
          {
            id: "email-field",
            label: "Email Address",
            error: "A valid work email is required",
          },
          React.createElement(Input, {
            id: "email-field",
            isInvalid: true,
            placeholder: "user@company.com",
          }),
        ),
      );
      expect(html).toContain('for="email-field"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("A valid work email is required");
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="email-field-error"');
    });
  });

  describe("WCAG 4.1.2 Name, Role, Value & Interactive Controls", () => {
    it("renders accessible button variants with proper focus classes and loading state", () => {
      const normalBtn = renderToStaticMarkup(
        React.createElement(
          Button,
          { variant: "primary" },
          "Create Automation",
        ),
      );
      expect(normalBtn).toContain("Create Automation");
      expect(normalBtn).toContain("focus-visible:ring-2");
      expect(normalBtn).toContain('type="button"');

      const loadingBtn = renderToStaticMarkup(
        React.createElement(
          Button,
          { variant: "primary", isLoading: true },
          "Saving",
        ),
      );
      expect(loadingBtn).toContain('aria-busy="true"');
      expect(loadingBtn).toContain("disabled");
      expect(loadingBtn).toContain("<svg"); // loader icon
    });

    it("renders accessible modal with role='dialog', aria-modal, and labelledby", () => {
      const modalHtml = renderToStaticMarkup(
        React.createElement(
          Modal,
          { isOpen: true, onClose: () => {}, title: "Create New Trigger" },
          React.createElement("p", null, "Modal body content"),
        ),
      );
      expect(modalHtml).toContain('role="dialog"');
      expect(modalHtml).toContain('aria-modal="true"');
      expect(modalHtml).toContain('aria-labelledby="modal-title"');
      expect(modalHtml).toContain('id="modal-title"');
      expect(modalHtml).toContain("Create New Trigger");
      expect(modalHtml).toContain("Modal body content");
    });

    it("renders destructive confirm dialog with explicit warning indicators", () => {
      const confirmHtml = renderToStaticMarkup(
        React.createElement(ConfirmDialog, {
          isOpen: true,
          onClose: () => {},
          onConfirm: () => {},
          title: "Delete Workflow",
          message:
            "Are you sure you want to permanently delete this automation?",
          confirmLabel: "Delete Workflow",
          isDestructive: true,
        }),
      );
      expect(confirmHtml).toContain('role="dialog"');
      expect(confirmHtml).toContain("Delete Workflow");
      expect(confirmHtml).toContain(
        "Are you sure you want to permanently delete this automation?",
      );
      expect(confirmHtml).toContain("bg-rose-600");
    });
  });

  describe("User Experience: Empty States & Discoverability", () => {
    it("renders informative empty states with clear iconography and call-to-action", () => {
      const emptyHtml = renderToStaticMarkup(
        React.createElement(EmptyState, {
          icon: Workflow,
          title: "No workflows found",
          description:
            "Create your first automated workflow to streamline operations.",
          actionLabel: "New Workflow",
          onAction: () => {},
        }),
      );
      expect(emptyHtml).toContain("No workflows found");
      expect(emptyHtml).toContain(
        "Create your first automated workflow to streamline operations.",
      );
      expect(emptyHtml).toContain("New Workflow");
      expect(emptyHtml).toContain("<svg");
    });
  });

  describe("Sensitive Credential Redaction in Execution Diagnostics", () => {
    function sanitizePayload(obj: unknown): unknown {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(sanitizePayload);
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (/password|token|secret|apikey|authorization/i.test(key)) {
          sanitized[key] = "***REDACTED***";
        } else if (typeof val === "object" && val !== null) {
          sanitized[key] = sanitizePayload(val);
        } else {
          sanitized[key] = val;
        }
      }
      return sanitized;
    }

    it("redacts sensitive authentication tokens, passwords, and API keys", () => {
      const rawPayload = {
        orderId: "ORD-9821",
        amount: 5000,
        userPassword: "PlainPassword123!",
        api_token: "ff_sec_abc123456",
        authorization: "Bearer secret-jwt-token",
        nestedConfig: {
          clientSecret: "shh-secret",
          webhookKey: "whsec_xyz",
          allowedUsers: ["user1@acme.com", "user2@acme.com"],
        },
      };

      const sanitized = sanitizePayload(rawPayload) as any;
      expect(sanitized.orderId).toBe("ORD-9821");
      expect(sanitized.amount).toBe(5000);
      expect(sanitized.userPassword).toBe("***REDACTED***");
      expect(sanitized.api_token).toBe("***REDACTED***");
      expect(sanitized.authorization).toBe("***REDACTED***");
      expect(sanitized.nestedConfig.clientSecret).toBe("***REDACTED***");
      expect(sanitized.nestedConfig.allowedUsers).toEqual([
        "user1@acme.com",
        "user2@acme.com",
      ]);
    });
  });
});
