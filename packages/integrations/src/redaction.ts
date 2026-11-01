const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /api[-_]?key/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /cookie/i,
  /private[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /webhook[-_]?url/i,
];

/**
 * Checks if a property or header name represents sensitive information.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  const lower = key.toLowerCase().trim();
  if (
    lower === "authorization" ||
    lower === "proxy-authorization" ||
    lower === "x-api-key"
  ) {
    return true;
  }
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * Generates a masked summary of a sensitive secret string.
 * Example: "sk_live_123456789" -> "••••••••6789"
 */
export function maskSecret(value: unknown): string {
  if (value === null || value === undefined) return "••••••••";
  const str = String(value).trim();
  if (str.length <= 4) {
    return "••••••••";
  }
  const last4 = str.slice(-4);
  return `••••••••${last4}`;
}

/**
 * Creates a dictionary of masked credential summaries from plaintext credential data.
 */
export function createMaskedSummary(
  credentialData: Record<string, unknown>,
): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentialData)) {
    if (typeof v === "string") {
      masked[k] = isSensitiveKey(k) ? maskSecret(v) : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      masked[k] = isSensitiveKey(k) ? "••••••••" : String(v);
    } else if (v && typeof v === "object") {
      masked[k] = "[OBJECT]";
    } else {
      masked[k] = "••••••••";
    }
  }
  return masked;
}

/**
 * Sanitizes a URL by removing password from basic auth userinfo and redacting sensitive query params.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "[REDACTED]";
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    // If not a valid standard URL, perform regex-based replacement on query params
    return rawUrl
      .replace(
        /([?&](?:token|key|api[-_]?key|secret|auth)=)[^&]+/gi,
        "$1[REDACTED]",
      )
      .replace(/(:\/\/[^:]+:)[^@]+(@)/g, "$1[REDACTED]$2");
  }
}

/**
 * Sanitizes an error message or log string to prevent accidental leakage of bearer tokens or keys.
 */
export function redactErrorMessage(message: string): string {
  if (!message || typeof message !== "string") return "";
  let sanitized = message;
  // Redact Bearer tokens
  sanitized = sanitized.replace(
    /Bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    "Bearer [REDACTED]",
  );
  // Redact URLs embedded in message
  sanitized = sanitized.replace(/https?:\/\/[^\s"',]+/gi, (matched) =>
    redactUrl(matched),
  );
  // Redact hex secrets / long tokens
  sanitized = sanitized.replace(
    /(apiKey|token|secret|password)["':\s=]+([a-zA-Z0-9_\-]{8,})/gi,
    "$1=[REDACTED]",
  );
  return sanitized;
}

/**
 * Deeply and recursively redacts sensitive fields from any JavaScript object, array, or error.
 * Safe against cyclic references using WeakSet.
 */
export function redactDeep<T>(target: T, seen = new WeakSet<object>()): T {
  if (target === null || target === undefined) {
    return target;
  }

  // Primitive types
  if (typeof target !== "object") {
    if (typeof target === "string") {
      // Check if it's a URL or contains sensitive token string
      if (target.startsWith("http://") || target.startsWith("https://")) {
        return redactUrl(target) as unknown as T;
      }
    }
    return target;
  }

  // Cycle detection
  if (seen.has(target)) {
    return "[CIRCULAR_REFERENCE]" as unknown as T;
  }
  seen.add(target);

  // Error handling
  if (target instanceof Error) {
    const errorCopy: Record<string, unknown> = {
      name: target.name,
      message: redactErrorMessage(target.message),
      stack: target.stack ? redactErrorMessage(target.stack) : undefined,
    };
    for (const [key, val] of Object.entries(target)) {
      if (isSensitiveKey(key)) {
        errorCopy[key] = "[REDACTED]";
      } else {
        errorCopy[key] = redactDeep(val, seen);
      }
    }
    return errorCopy as unknown as T;
  }

  // Array handling
  if (Array.isArray(target)) {
    return target.map((item) => redactDeep(item, seen)) as unknown as T;
  }

  // Plain object handling
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(target as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      if (val !== null && typeof val === "object") {
        result[key] = redactDeep(val, seen);
      } else {
        result[key] = "[REDACTED]";
      }
    } else {
      result[key] = redactDeep(val, seen);
    }
  }

  return result as unknown as T;
}
