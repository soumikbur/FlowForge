import {
  isPrivateOrBlockedDestination,
  resolveAndValidateDestination,
} from "./ssrf.js";

export interface HttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
  idempotentRetry?: boolean;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  durationMs: number;
}

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
]);

/**
 * Redacts sensitive header values from headers dictionary.
 */
export function redactSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
      sanitized[k] = "[REDACTED]";
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export async function executeSafeHttpRequest(
  options: HttpRequestOptions,
): Promise<HttpResponse> {
  const {
    url,
    method = "GET",
    headers = {},
    queryParams,
    body,
    timeoutMs = 10000,
    maxRetries = 2,
    maxResponseBytes = 5 * 1024 * 1024, // 5MB
    idempotentRetry = false,
  } = options;

  // Fast synchronous check
  if (isPrivateOrBlockedDestination(url)) {
    throw new Error(
      `SSRF Prevention: Prohibited or private destination blocked: ${url}`,
    );
  }

  // Deep DNS resolution check
  const dnsCheck = await resolveAndValidateDestination(url);
  if (!dnsCheck.isSafe) {
    throw new Error(
      `SSRF Prevention: Destination check failed: ${dnsCheck.reason}`,
    );
  }

  // Build final URL with query params
  const targetUrl = new URL(url);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      targetUrl.searchParams.set(k, v);
    }
  }

  const upperMethod = method.toUpperCase();
  const isIdempotentMethod = [
    "GET",
    "HEAD",
    "PUT",
    "DELETE",
    "OPTIONS",
  ].includes(upperMethod);

  // Non-idempotent methods (POST, PATCH) should not retry unless explicitly opted in
  const effectiveRetries = isIdempotentMethod || idempotentRetry ? maxRetries : 0;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= effectiveRetries) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl.toString(), {
        method: upperMethod,
        headers: {
          "User-Agent": "FlowForge-Workflow-Engine/1.0",
          ...headers,
        },
        body: ["GET", "HEAD"].includes(upperMethod) ? undefined : body,
        signal: controller.signal,
        redirect: "error", // Reject automatic redirect following to prevent redirect-based SSRF
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // Check Content-Length header against maxResponseBytes
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > maxResponseBytes) {
          throw new Error(
            `Response size ${contentLength} exceeds maximum limit of ${maxResponseBytes} bytes.`,
          );
        }
      }

      // Read response body safely with byte limit guard
      const rawText = await response.text();
      if (Buffer.byteLength(rawText, "utf8") > maxResponseBytes) {
        throw new Error(
          `Response payload exceeded maximum allowed limit of ${maxResponseBytes} bytes.`,
        );
      }

      let parsedData: unknown;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          parsedData = JSON.parse(rawText);
        } catch {
          parsedData = rawText;
        }
      } else {
        parsedData = rawText;
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: redactSensitiveHeaders(responseHeaders),
        data: parsedData,
        durationMs,
      };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      attempt++;

      if (attempt > effectiveRetries) {
        break;
      }

      // Exponential backoff
      await new Promise((res) => setTimeout(res, 200 * Math.pow(2, attempt)));
    }
  }

  const safeErrorMessage = lastError?.message || "Unknown error";
  throw new Error(
    `HTTP request failed after ${effectiveRetries + 1} attempts: ${safeErrorMessage}`,
  );
}
