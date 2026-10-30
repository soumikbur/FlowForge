import crypto from "crypto";

export interface WebhookValidationOptions {
  payload: string | Buffer;
  signature?: string;
  secret?: string;
  timestamp?: string | number;
  maxAgeSeconds?: number;
  algorithm?: "sha256" | "sha1";
}

export interface WebhookValidationResult {
  isValid: boolean;
  errorCode?:
    | "MISSING_SIGNATURE"
    | "INVALID_SIGNATURE"
    | "TIMESTAMP_EXPIRED"
    | "MALFORMED_TIMESTAMP";
  message?: string;
}

export function verifyWebhookSignatureDetailed(
  options: WebhookValidationOptions,
): WebhookValidationResult {
  const {
    payload,
    signature,
    secret,
    timestamp,
    maxAgeSeconds = 300, // 5 minutes
    algorithm = "sha256",
  } = options;

  // 1. Replay attack timestamp check
  if (timestamp !== undefined) {
    let timestampMs: number;
    if (typeof timestamp === "number") {
      timestampMs = timestamp > 1e11 ? timestamp : timestamp * 1000;
    } else {
      const parsed = Date.parse(timestamp);
      timestampMs = !isNaN(parsed) ? parsed : parseInt(timestamp, 10);
      if (isNaN(timestampMs)) {
        return {
          isValid: false,
          errorCode: "MALFORMED_TIMESTAMP",
          message: "Provided webhook timestamp could not be parsed.",
        };
      }
      if (timestampMs < 1e11) {
        timestampMs *= 1000;
      }
    }

    const now = Date.now();
    const ageSeconds = Math.abs(now - timestampMs) / 1000;

    if (ageSeconds > maxAgeSeconds) {
      return {
        isValid: false,
        errorCode: "TIMESTAMP_EXPIRED",
        message: `Webhook timestamp outside permitted window (${Math.round(ageSeconds)}s > ${maxAgeSeconds}s).`,
      };
    }
  }

  // 2. Signature verification
  if (!secret) {
    return { isValid: true };
  }

  if (!signature) {
    return {
      isValid: false,
      errorCode: "MISSING_SIGNATURE",
      message: "Missing signature header for signed webhook.",
    };
  }

  try {
    const rawPayloadString = Buffer.isBuffer(payload)
      ? payload.toString("utf8")
      : payload;

    let cleanSignature = signature.replace(/^(sha256=|sha1=)/i, "").trim();
    let headerTimestamp = timestamp;

    if (signature.includes("t=") || signature.includes("v1=")) {
      const parts = signature.split(",");
      const v1Part = parts.find((p) => p.trim().startsWith("v1="));
      const tPart = parts.find((p) => p.trim().startsWith("t="));
      if (v1Part) {
        cleanSignature = v1Part.trim().slice(3);
      }
      if (tPart && headerTimestamp === undefined) {
        headerTimestamp = Number(tPart.trim().slice(2));
      }
    }

    const signatureBuffer = Buffer.from(cleanSignature, "hex");

    // Support both standard payload and timestamp-prefixed payloads
    const candidates = [rawPayloadString];
    if (headerTimestamp !== undefined) {
      candidates.unshift(`${headerTimestamp}.${rawPayloadString}`);
    }

    for (const candidate of candidates) {
      const hmac = crypto.createHmac(algorithm, secret);
      hmac.update(candidate);
      const expected = hmac.digest("hex");
      const expectedBuffer = Buffer.from(expected, "hex");

      if (
        expectedBuffer.length === signatureBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
      ) {
        return { isValid: true };
      }
    }

    return {
      isValid: false,
      errorCode: "INVALID_SIGNATURE",
      message: "Webhook cryptographic signature did not match expected value.",
    };
  } catch (err: any) {
    return {
      isValid: false,
      errorCode: "INVALID_SIGNATURE",
      message: `Signature verification failed: ${err.message}`,
    };
  }
}

/**
 * Validates webhook signature. Returns boolean for direct backward compatibility.
 */
export function verifyWebhookSignature(
  options: WebhookValidationOptions,
): boolean {
  return verifyWebhookSignatureDetailed(options).isValid;
}

/**
 * Computes an HMAC signature for an outbound webhook payload with timestamp binding.
 */
export function signWebhookPayload(
  secret: string,
  payload: string | Buffer | Record<string, unknown>,
  timestamp?: number | string,
  algorithm: "sha256" | "sha1" = "sha256",
): { signature: string; headerValue: string; timestamp: number } {
  const ts =
    typeof timestamp === "number"
      ? timestamp
      : timestamp
        ? Date.parse(String(timestamp))
        : Date.now();
  const rawPayload = Buffer.isBuffer(payload)
    ? payload.toString("utf8")
    : typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

  const signedContent = `${ts}.${rawPayload}`;
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(signedContent);
  const signatureHex = hmac.digest("hex");

  return {
    signature: signatureHex,
    headerValue: `t=${ts},v1=${signatureHex}`,
    timestamp: ts,
  };
}
