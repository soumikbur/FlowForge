import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  isPrivateOrBlockedDestination,
  verifyWebhookSignature,
  defaultEmailService,
  isValidCron,
  shouldRunCronNow,
} from "../src/index.js";

describe("SSRF Protection", () => {
  it("blocks localhost, metadata IP and private ranges", () => {
    expect(isPrivateOrBlockedDestination("http://localhost:8080")).toBe(true);
    expect(isPrivateOrBlockedDestination("http://127.0.0.1:3000")).toBe(true);
    expect(
      isPrivateOrBlockedDestination("http://169.254.169.254/latest/meta-data/"),
    ).toBe(true);
    expect(isPrivateOrBlockedDestination("http://10.0.0.1/admin")).toBe(true);
    expect(isPrivateOrBlockedDestination("http://192.168.1.1/router")).toBe(
      true,
    );
    expect(isPrivateOrBlockedDestination("http://172.16.0.5/api")).toBe(true);
    expect(isPrivateOrBlockedDestination("http://[::1]/")).toBe(true);
  });

  it("allows valid public external domains", () => {
    expect(isPrivateOrBlockedDestination("https://api.github.com/users")).toBe(
      false,
    );
    expect(isPrivateOrBlockedDestination("https://httpbin.org/get")).toBe(
      false,
    );
  });
});

describe("Webhook Signature Verification", () => {
  const secret = "super-secret-key";
  const payload = JSON.stringify({ event: "order.created", amount: 500 });
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  it("validates authentic signatures", () => {
    const isValid = verifyWebhookSignature({
      payload,
      signature: `sha256=${hmac}`,
      secret,
    });
    expect(isValid).toBe(true);
  });

  it("rejects tampered signatures", () => {
    const isValid = verifyWebhookSignature({
      payload,
      signature:
        "sha256=invalidhexsignature0123456789abcdef0123456789abcdef0123456789abcdef",
      secret,
    });
    expect(isValid).toBe(false);
  });
});

describe("Email Delivery & Idempotency", () => {
  it("prevents duplicate message sends using idempotency key", async () => {
    const key = `key_${Date.now()}`;
    const first = await defaultEmailService.sendEmail({
      idempotencyKey: key,
      to: "customer@example.com",
      subject: "Order Confirmed",
    });
    expect(first.delivered).toBe(true);
    expect(first.isDuplicate).toBeFalsy();

    const second = await defaultEmailService.sendEmail({
      idempotencyKey: key,
      to: "customer@example.com",
      subject: "Order Confirmed",
    });
    expect(second.isDuplicate).toBe(true);
    expect(second.messageId).toBe(first.messageId);
  });
});

describe("Scheduler / Cron", () => {
  it("validates standard cron expressions", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("*/5 * * * *")).toBe(true);
    expect(isValidCron("invalid-cron")).toBe(false);
  });
});
