import crypto from "crypto";

const DEFAULT_SECRET =
  process.env.APP_ENCRYPTION_KEY ||
  "flowforge-production-master-secret-key-32b!";

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts arbitrary credential data or secrets with AES-256-GCM authenticated encryption.
 * Output format: `iv:authTag:ciphertext` in hex.
 */
export function encryptCredentialData(
  data: Record<string, unknown> | string,
  secretKey: string = DEFAULT_SECRET,
): string {
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  const key = deriveKey(secretKey);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts AES-256-GCM encrypted credential payload.
 * Throws an error if authentication tag mismatches or data was tampered.
 */
export function decryptCredentialData(
  encryptedPayload: string,
  secretKey: string = DEFAULT_SECRET,
): Record<string, unknown> | string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted payload format. Expected iv:authTag:ciphertext.",
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = deriveKey(secretKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}
