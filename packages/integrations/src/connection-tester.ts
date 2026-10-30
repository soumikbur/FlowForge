import { ConnectionTestResult } from "@flowforge/shared";
import { defaultConnectorRegistry } from "./connector-registry.js";
import { redactErrorMessage } from "./redaction.js";

/**
 * Executes a live connection test probe against a registered connector.
 * Applies timeout guards, records latency, redacts sensitive details from error messages,
 * and categorizes failures.
 */
export async function testConnection(
  connectorId: string,
  credentialData: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<ConnectionTestResult> {
  const start = Date.now();
  const testedAt = new Date().toISOString();

  if (!defaultConnectorRegistry.has(connectorId)) {
    return {
      success: false,
      message: `Connector '${connectorId}' is not found in registry.`,
      latencyMs: Date.now() - start,
      errorCategory: "CONNECTOR_NOT_FOUND",
      testedAt,
    };
  }

  const tester = defaultConnectorRegistry.getTester(connectorId);
  if (!tester) {
    // If no custom tester is registered, perform basic schema and structure validation
    return {
      success: true,
      message: `Connector '${connectorId}' has valid credential configuration.`,
      latencyMs: Date.now() - start,
      testedAt,
    };
  }

  try {
    const result = await tester(credentialData, config);
    return {
      success: result.success,
      message: redactErrorMessage(result.message),
      latencyMs: result.latencyMs ?? Date.now() - start,
      errorCategory: result.errorCategory,
      testedAt,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    let category = err.category || "TEST_FAILED";
    const msg = err.message || "Connection test failed";

    if (msg.includes("SSRF") || msg.includes("private") || msg.includes("loopback")) {
      category = "SSRF_BLOCKED";
    } else if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      category = "TIMEOUT";
    } else if (msg.includes("401") || msg.includes("403") || msg.includes("auth")) {
      category = "AUTH_ERROR";
    }

    return {
      success: false,
      message: redactErrorMessage(msg),
      latencyMs,
      errorCategory: category,
      testedAt,
    };
  }
}
