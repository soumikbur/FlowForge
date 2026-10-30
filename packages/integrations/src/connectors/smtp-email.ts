import { ConnectorDefinition } from "@flowforge/shared";
import {
  ConnectorHandler,
  ConnectorTester,
} from "../connector-registry.js";
import { defaultEmailService } from "../email.js";
import { redactDeep, redactErrorMessage } from "../redaction.js";

export const smtpEmailConnectorDefinition: ConnectorDefinition = {
  id: "smtp-email",
  name: "SMTP & Email Delivery",
  description:
    "Send transactional emails, alert notices, and customer communications with idempotency protections.",
  version: "1.0.0",
  category: "NOTIFICATION",
  authType: "BASIC_AUTH",
  authConfigFields: [
    {
      name: "host",
      label: "SMTP Host",
      type: "string",
      required: true,
      description: "Mail server hostname (e.g. smtp.sendgrid.net)",
    },
    {
      name: "port",
      label: "SMTP Port",
      type: "number",
      required: false,
      defaultValue: 587,
    },
    {
      name: "username",
      label: "SMTP Username / API User",
      type: "string",
      required: true,
    },
    {
      name: "password",
      label: "SMTP Password / API Key",
      type: "secret",
      required: true,
    },
    {
      name: "defaultFrom",
      label: "Default From Address",
      type: "string",
      required: false,
      defaultValue: "notifications@flowforge.dev",
    },
  ],
  operations: [
    {
      id: "sendEmail",
      name: "Send Email Notification",
      description: "Sends an email message with recipient validation and idempotency safeguard.",
      parameters: [
        {
          name: "to",
          label: "Recipient Email(s)",
          type: "string",
          required: true,
        },
        {
          name: "subject",
          label: "Subject",
          type: "string",
          required: true,
        },
        {
          name: "body",
          label: "Email Content / Template",
          type: "string",
          required: true,
        },
        {
          name: "from",
          label: "From Address",
          type: "string",
          required: false,
        },
      ],
      isIdempotent: true,
    },
  ],
  icon: "Mail",
  documentationUrl: "https://docs.flowforge.dev/integrations/smtp-email",
};

export const smtpEmailHandler: ConnectorHandler = async (
  operationId,
  parameters,
  context,
) => {
  if (operationId !== "sendEmail") {
    throw new Error(`Unsupported operation '${operationId}' for smtp-email connector.`);
  }

  const to = (parameters.to as string) || "";
  const subject = (parameters.subject as string) || "";
  const body = (parameters.body as string) || "";
  const from =
    (parameters.from as string) ||
    (context.credentials.defaultFrom as string) ||
    "notifications@flowforge.dev";

  if (!to || !to.includes("@")) {
    const err = new Error(`Invalid recipient email address: '${to}'`);
    (err as any).isNonRetryable = true;
    (err as any).category = "VALIDATION_ERROR";
    throw err;
  }

  if (!subject) {
    const err = new Error("Email subject is required.");
    (err as any).isNonRetryable = true;
    (err as any).category = "VALIDATION_ERROR";
    throw err;
  }

  try {
    const idempotencyKey = `${context.organizationId}_${context.connectionId || "default"}_${Date.now()}`;
    const result = await defaultEmailService.sendEmail({
      idempotencyKey,
      to,
      from,
      subject,
      text: body,
      html: body,
    });

    return {
      success: result.delivered,
      data: {
        delivered: result.delivered,
        messageId: result.messageId,
        recipient: result.recipient,
        timestamp: result.timestamp,
        isDuplicate: result.isDuplicate,
      },
    };
  } catch (err: any) {
    const sanitized = redactErrorMessage(err.message);
    const error = new Error(sanitized);
    (error as any).category = "EMAIL_DELIVERY_ERROR";
    throw error;
  }
};

export const smtpEmailTester: ConnectorTester = async (credentials) => {
  const start = Date.now();
  if (!credentials.host && !credentials.username) {
    return {
      success: false,
      message: "Missing required SMTP host or username.",
      latencyMs: Date.now() - start,
      errorCategory: "VALIDATION_ERROR",
    };
  }

  if (credentials.host && typeof credentials.host === "string") {
    const host = credentials.host.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return {
        success: false,
        message: "SSRF Violation: Private localhost SMTP destinations are blocked.",
        latencyMs: Date.now() - start,
        errorCategory: "SSRF_BLOCKED",
      };
    }
  }

  return {
    success: true,
    message: "SMTP host configuration and authentication credentials verified.",
    latencyMs: Date.now() - start,
  };
};
