import crypto from "crypto";

export interface WebhookValidationOptions {
  payload: string | Buffer;
  signature?: string;
  secret?: string;
  algorithm?: "sha256" | "sha1";
}

export function verifyWebhookSignature(
  options: WebhookValidationOptions,
): boolean {
  const { payload, signature, secret, algorithm = "sha256" } = options;

  if (!secret) {
    // If no secret configured for this webhook, allow unverified payload
    return true;
  }

  if (!signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(payload);
    const expected = hmac.digest("hex");

    const cleanSignature = signature.replace(/^(sha256=|sha1=)/i, "").trim();

    const expectedBuffer = Buffer.from(expected, "hex");
    const signatureBuffer = Buffer.from(cleanSignature, "hex");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
