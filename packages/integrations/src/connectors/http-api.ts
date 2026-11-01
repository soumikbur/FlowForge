import { ConnectorDefinition } from "@flowforge/shared";
import { ConnectorHandler, ConnectorTester } from "../connector-registry.js";
import { executeSafeHttpRequest } from "../http.js";
import { resolveAndValidateDestination } from "../ssrf.js";
import { redactDeep, redactErrorMessage } from "../redaction.js";

export const httpApiConnectorDefinition: ConnectorDefinition = {
  id: "http-api",
  name: "HTTP & REST API",
  description:
    "Universal outbound HTTP and REST client with SSRF guard defenses, configurable headers, and authentication.",
  version: "1.0.0",
  category: "HTTP",
  authType: "API_KEY",
  authConfigFields: [
    {
      name: "baseUrl",
      label: "Base URL (Optional)",
      type: "string",
      required: false,
      description:
        "Default base URL for relative endpoint calls (e.g. https://api.stripe.com)",
    },
    {
      name: "authHeaderName",
      label: "Header Name",
      type: "string",
      required: false,
      defaultValue: "Authorization",
      description:
        "Header name to inject credential into (e.g. Authorization or X-API-Key)",
    },
    {
      name: "apiKey",
      label: "API Key / Token",
      type: "secret",
      required: false,
      description: "Secret token or API key value",
    },
    {
      name: "authPrefix",
      label: "Header Prefix",
      type: "string",
      required: false,
      defaultValue: "Bearer",
      description: "Prefix for authorization header value (e.g. Bearer)",
    },
  ],
  operations: [
    {
      id: "request",
      name: "Execute HTTP Request",
      description:
        "Dispatches an HTTP request with SSRF guard and response sanitization.",
      parameters: [
        {
          name: "url",
          label: "Request URL",
          type: "string",
          required: true,
          description: "Full URL or relative path if Base URL is configured.",
        },
        {
          name: "method",
          label: "HTTP Method",
          type: "string",
          required: false,
          defaultValue: "GET",
        },
        {
          name: "headers",
          label: "Headers",
          type: "json",
          required: false,
          description: "Key-value pair dictionary of request headers.",
        },
        {
          name: "queryParams",
          label: "Query Parameters",
          type: "json",
          required: false,
        },
        {
          name: "body",
          label: "Request Body",
          type: "json",
          required: false,
        },
        {
          name: "timeoutMs",
          label: "Timeout (ms)",
          type: "number",
          required: false,
          defaultValue: 10000,
        },
      ],
      isIdempotent: false,
    },
  ],
  icon: "Globe",
  documentationUrl: "https://docs.flowforge.dev/integrations/http-api",
};

export const httpApiHandler: ConnectorHandler = async (
  operationId,
  parameters,
  context,
) => {
  if (operationId !== "request") {
    throw new Error(
      `Unsupported operation '${operationId}' for http-api connector.`,
    );
  }

  let targetUrl = (parameters.url as string) || "";
  const baseUrl = (context.credentials.baseUrl as string) || "";
  if (
    baseUrl &&
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const cleanPath = targetUrl.replace(/^\/+/, "");
    targetUrl = `${cleanBase}/${cleanPath}`;
  }

  if (!targetUrl) {
    throw new Error("Target URL is required for HTTP operation.");
  }

  const method = ((parameters.method as string) || "GET").toUpperCase();
  const timeoutMs =
    (parameters.timeoutMs as number) || context.timeoutMs || 10000;
  const headers = { ...((parameters.headers as Record<string, string>) || {}) };
  const queryParams = parameters.queryParams as
    Record<string, string> | undefined;
  const body =
    typeof parameters.body === "object"
      ? JSON.stringify(parameters.body)
      : (parameters.body as string | undefined);

  // Inject configured credentials
  if (context.credentials.apiKey) {
    const headerName =
      (context.credentials.authHeaderName as string) || "Authorization";
    const prefix = (context.credentials.authPrefix as string) ?? "Bearer";
    const headerVal = prefix
      ? `${prefix} ${context.credentials.apiKey}`
      : String(context.credentials.apiKey);
    headers[headerName] = headerVal;
  } else if (context.credentials.username) {
    const user = context.credentials.username;
    const pass = context.credentials.password || "";
    const basic = Buffer.from(`${user}:${pass}`).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  try {
    const response = await executeSafeHttpRequest({
      url: targetUrl,
      method,
      headers,
      queryParams,
      body,
      timeoutMs,
      idempotentRetry: context.idempotentRetry,
    });

    return {
      success: response.status >= 200 && response.status < 400,
      data: {
        statusCode: response.status,
        headers: redactDeep(response.headers),
        body: redactDeep(response.data),
        durationMs: response.durationMs,
      },
    };
  } catch (err: any) {
    const sanitizedMsg = redactErrorMessage(err.message);
    const error = new Error(sanitizedMsg);
    (error as any).isNonRetryable = err.isNonRetryable ?? false;
    (error as any).category = err.category || "HTTP_ERROR";
    throw error;
  }
};

export const httpApiTester: ConnectorTester = async (credentials, config) => {
  const start = Date.now();
  const testUrl =
    (config?.testUrl as string) || (credentials.baseUrl as string);

  if (!testUrl) {
    // If no URL configured, credentials schema check is sufficient
    if (credentials.apiKey || credentials.username || credentials.token) {
      return {
        success: true,
        message: "Credential structure validated successfully.",
        latencyMs: Date.now() - start,
      };
    }
    return {
      success: true,
      message:
        "No authentication credentials provided (Anonymous access configured).",
      latencyMs: Date.now() - start,
    };
  }

  // Pre-validate SSRF
  const ssrfValidation = await resolveAndValidateDestination(testUrl);
  if (!ssrfValidation.isSafe) {
    return {
      success: false,
      message:
        `SSRF Violation: Target host '${testUrl}' resolves to blocked private address or forbidden host. ${ssrfValidation.reason || ""}`.trim(),
      latencyMs: Date.now() - start,
      errorCategory: "SSRF_BLOCKED",
    };
  }

  try {
    const headers: Record<string, string> = {};
    if (credentials.apiKey) {
      const headerName =
        (credentials.authHeaderName as string) || "Authorization";
      const prefix = (credentials.authPrefix as string) ?? "Bearer";
      headers[headerName] = prefix
        ? `${prefix} ${credentials.apiKey}`
        : String(credentials.apiKey);
    }

    const res = await executeSafeHttpRequest({
      url: testUrl,
      method: "GET",
      headers,
      timeoutMs: 5000,
    });

    return {
      success: res.status < 500,
      message: `Endpoint probe returned HTTP ${res.status} ${res.statusText}`,
      latencyMs: Date.now() - start,
      errorCategory: res.status >= 400 ? "AUTH_ERROR" : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      message: redactErrorMessage(
        err.message || "Failed to reach endpoint probe",
      ),
      latencyMs: Date.now() - start,
      errorCategory: err.category || "NETWORK_ERROR",
    };
  }
};
