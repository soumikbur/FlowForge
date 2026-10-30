import { defaultConnectorRegistry } from "./connector-registry.js";
import {
  httpApiConnectorDefinition,
  httpApiHandler,
  httpApiTester,
} from "./connectors/http-api.js";
import {
  smtpEmailConnectorDefinition,
  smtpEmailHandler,
  smtpEmailTester,
} from "./connectors/smtp-email.js";
import {
  slackWebhookConnectorDefinition,
  slackWebhookHandler,
  slackWebhookTester,
} from "./connectors/slack-webhook.js";

// Auto-register built-in connectors
defaultConnectorRegistry.register(
  httpApiConnectorDefinition,
  httpApiHandler,
  httpApiTester,
);
defaultConnectorRegistry.register(
  smtpEmailConnectorDefinition,
  smtpEmailHandler,
  smtpEmailTester,
);
defaultConnectorRegistry.register(
  slackWebhookConnectorDefinition,
  slackWebhookHandler,
  slackWebhookTester,
);

export * from "./ssrf.js";
export * from "./http.js";
export * from "./credentials.js";
export * from "./webhook.js";
export * from "./email.js";
export * from "./scheduler.js";
export * from "./redaction.js";
export * from "./connector-registry.js";
export * from "./connection-tester.js";
export * from "./connectors/http-api.js";
export * from "./connectors/smtp-email.js";
export * from "./connectors/slack-webhook.js";
export * from "./event-delivery.js";
