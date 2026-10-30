import { ConnectorDefinition } from "@flowforge/shared";
import {
  ConnectorHandler,
  ConnectorTester,
} from "../connector-registry.js";
import { executeSafeHttpRequest } from "../http.js";
import { resolveAndValidateDestination } from "../ssrf.js";
import { redactErrorMessage } from "../redaction.js";

export const slackWebhookConnectorDefinition: ConnectorDefinition = {
  id: "slack-webhook",
  name: "Slack Webhook Notifications",
  description:
    "Post formatted messages, alerts, and notifications directly into Slack channels via Incoming Webhooks.",
  version: "1.0.0",
  category: "NOTIFICATION",
  authType: "CUSTOM",
  authConfigFields: [
    {
      name: "webhookUrl",
      label: "Webhook URL",
      type: "secret",
      required: true,
      description: "Slack Incoming Webhook URL (e.g. https://hooks.slack.com/services/...)",
    },
    {
      name: "defaultChannel",
      label: "Default Channel (Optional)",
      type: "string",
      required: false,
      description: "#general or #alerts",
    },
  ],
  operations: [
    {
      id: "sendMessage",
      name: "Send Slack Message",
      description: "Post a message or rich payload block to the designated Slack webhook.",
      parameters: [
        {
          name: "text",
          label: "Message Text",
          type: "string",
          required: true,
          description: "Main message text or fallback summary.",
        },
        {
          name: "channel",
          label: "Channel Override (Optional)",
          type: "string",
          required: false,
        },
        {
          name: "blocks",
          label: "Slack Block Kit Blocks (Optional JSON)",
          type: "json",
          required: false,
        },
      ],
      isIdempotent: false,
    },
  ],
  icon: "MessageSquare",
  documentationUrl: "https://docs.flowforge.dev/integrations/slack-webhook",
};

export const slackWebhookHandler: ConnectorHandler = async (
  operationId,
  parameters,
  context,
) => {
  if (operationId !== "sendMessage") {
    throw new Error(`Unsupported operation '${operationId}' for slack-webhook connector.`);
  }

  const webhookUrl =
    (context.credentials.webhookUrl as string) ||
    (parameters.webhookUrl as string);

  if (!webhookUrl || typeof webhookUrl !== "string") {
    const err = new Error("Slack Incoming Webhook URL is required.");
    (err as any).isNonRetryable = true;
    (err as any).category = "AUTH_ERROR";
    throw err;
  }

  const text = (parameters.text as string) || "";
  if (!text && !parameters.blocks) {
    const err = new Error("Message text or blocks payload is required.");
    (err as any).isNonRetryable = true;
    (err as any).category = "VALIDATION_ERROR";
    throw err;
  }

  const payload: Record<string, unknown> = {
    text,
  };
  if (parameters.channel || context.credentials.defaultChannel) {
    payload.channel = parameters.channel || context.credentials.defaultChannel;
  }
  if (parameters.blocks) {
    payload.blocks = parameters.blocks;
  }

  try {
    const response = await executeSafeHttpRequest({
      url: webhookUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: context.timeoutMs || 8000,
      idempotentRetry: context.idempotentRetry,
    });

    return {
      success: response.status === 200,
      data: {
        delivered: response.status === 200,
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    const sanitized = redactErrorMessage(err.message);
    const error = new Error(sanitized);
    (error as any).isNonRetryable = err.isNonRetryable ?? true;
    (error as any).category = err.category || "SLACK_DELIVERY_ERROR";
    throw error;
  }
};

export const slackWebhookTester: ConnectorTester = async (credentials) => {
  const start = Date.now();
  const webhookUrl = credentials.webhookUrl as string;

  if (!webhookUrl) {
    return {
      success: false,
      message: "Slack Webhook URL is required.",
      latencyMs: Date.now() - start,
      errorCategory: "VALIDATION_ERROR",
    };
  }

  // Pre-validate SSRF
  const ssrfValidation = await resolveAndValidateDestination(webhookUrl);
  if (!ssrfValidation.isSafe) {
    return {
      success: false,
      message: `SSRF Violation: Webhook URL '${webhookUrl}' targets blocked or internal IP. ${ssrfValidation.reason || ""}`.trim(),
      latencyMs: Date.now() - start,
      errorCategory: "SSRF_BLOCKED",
    };
  }

  if (!webhookUrl.startsWith("https://")) {
    return {
      success: false,
      message: "Slack Webhook URL must use secure HTTPS protocol.",
      latencyMs: Date.now() - start,
      errorCategory: "VALIDATION_ERROR",
    };
  }

  return {
    success: true,
    message: "Slack webhook destination validated securely.",
    latencyMs: Date.now() - start,
  };
};
