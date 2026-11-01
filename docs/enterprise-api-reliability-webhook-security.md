# Enterprise API Reliability, Webhook Security, and Developer Experience

## 1. Executive Summary

FlowForge provides an enterprise-grade API reliability and webhook security subsystem designed to ensure predictable, secure, and discoverable system integration. This architectural layer provides:

1. **Standardized API Contract & Envelope**: Every response adheres to a strict canonical JSON structure with correlation IDs (`X-Correlation-Id`, `X-Request-Id`), explicit `retryable` booleans, standardized error codes, documentation anchors, and zero credential/stack trace leakage.
2. **API Versioning & RFC 8594 Sunset Lifecycle**: Version discovery (`GET /api/v1/version`), deprecation registry (`GET /api/v1/deprecations`), RFC 8594 standard response headers (`Deprecation`, `Sunset`, `Link`), and header-based version negotiation (`Accept-Version`, `FlowForge-Version`).
3. **Multi-Tenant Rate Limiting**: Tier-specific limits (`auth`: 60/min, `execute`: 120/min, `search`: 60/min, `default`: 300/min) with `X-RateLimit-*` and `Retry-After` headers ensuring fair utilization and preventing noisy-neighbor starvation.
4. **Hardened Idempotency Middleware**: Cryptographic SHA-256 payload hashing, concurrent in-flight locking (HTTP 409 `IDEMPOTENCY_IN_FLIGHT`, `retryable: true`), payload mismatch detection (HTTP 409 `IDEMPOTENCY_MISMATCH`, `retryable: false`), and cached replay (`Idempotent-Replayed: true`).
5. **Inbound Webhook Security & Zero-Downtime Secret Rotation**: HMAC-SHA256 signature verification, 300-second timestamp drift tolerance, signature replay prevention cache, 2MB payload size limits, and dual-secret rotation grace periods.
6. **Outbound Webhook Delivery, SSRF Defense & Dead-Letter Queue (DLQ)**: Private/loopback/cloud-metadata blocking, DNS rebinding mitigation, exponential backoff with jitter, dead-letter state machine (`DEAD_LETTERED`), and tenant-isolated DLQ replay APIs (`POST /api/v1/webhooks/deliveries/:id/replay`).
7. **Developer Experience & Typed SDK**: Full developer portal (`/settings/developer`), interactive verification code generator (Node.js, Python, cURL), typed `FlowForgeClient` SDK with auto-idempotency and backoff retries, and comprehensive reliability telemetry (`/api/v1/metrics/reliability`).

---

## 2. Standardized API Error Contract

All API error responses follow the FlowForge canonical envelope:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again after 30 seconds.",
    "details": {
      "retryAfterSeconds": 30
    },
    "requestId": "req_8df83cb1",
    "retryable": true,
    "docUrl": "https://docs.flowforge.dev/errors#RATE_LIMIT_EXCEEDED"
  }
}
```

### Deterministic `retryable` Semantics

- `retryable: true`: Returned exclusively for transient, capacity, or synchronization constraints (HTTP 429 `RATE_LIMIT_EXCEEDED`, HTTP 503 `SERVICE_UNAVAILABLE`, HTTP 409 `IDEMPOTENCY_IN_FLIGHT`).
- `retryable: false`: Returned for deterministic client faults (HTTP 400 validation, HTTP 401 unauthorized, HTTP 403 forbidden, HTTP 404 not found, HTTP 409 `IDEMPOTENCY_MISMATCH`, HTTP 413 `PAYLOAD_TOO_LARGE`).

---

## 3. API Versioning & RFC 8594 Deprecation Lifecycle

FlowForge implements RFC 8594 standard deprecation headers across all legacy endpoints:

```http
HTTP/1.1 202 Accepted
Deprecation: @1735689600
Sunset: Fri, 01 Jan 2027 00:00:00 GMT
Link: </api/v1/workflows/:id/execute>; rel="successor-version"
X-API-Version: v1
```

### Discovery Endpoints

- `GET /api/v1/version`: Returns active semver, major version, minimum supported version, and release metadata.
- `GET /api/v1/deprecations`: Programmatic catalog of active deprecations, target sunset dates, successor routes, and migration documentation.
- `Accept-Version` / `FlowForge-Version` Header: Negotiates API major version. Unsupported versions reject with HTTP 406 `UNSUPPORTED_API_VERSION`.

---

## 4. Inbound Webhook Security Architecture

### Cryptographic Signature Verification

Inbound webhooks require an HMAC-SHA256 signature passed in `X-Signature-256` or formatted as `t=<timestamp>,v1=<signature>`.

1. **Timestamp Drift Tolerance**: Validated within a 300-second window (`maxAgeSeconds = 300`). Payloads outside this window are rejected with HTTP 401 `TIMESTAMP_EXPIRED`.
2. **Replay Attack Defense**: Recently verified signatures are cached in a sliding 300-second window. Any identical cryptographic signature received twice within this window is rejected with HTTP 409 `WEBHOOK_REPLAY_DETECTED`.
3. **Zero-Downtime Secret Rotation**: Rotating a webhook secret (`POST /api/v1/webhooks/:id/rotate-secret`) generates a new primary secret while preserving the previous key in `secondarySigningSecret`. Signatures matching either key are accepted during the rotation grace period.

---

## 5. Outbound Webhooks, SSRF Defense & DLQ State Machine

### SSRF Protection

Outbound webhook destinations are pre-validated and executed via `executeSafeHttpRequest`:

- **Prohibited Networks**: 127.0.0.0/8 (Loopback), 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918 Private), 169.254.169.254 (Cloud Instance Metadata), `*.internal`, `*.localhost`.
- **DNS Rebinding Prevention**: Resolved destination IPs are checked against prohibited ranges before socket establishment.
- **Redirect Security**: HTTP redirects are constrained with `redirect: "error"` to prevent open redirection into private infrastructure.

### Delivery State Machine

```
[PENDING] ---> [PROCESSING] ---> [SUCCEEDED / DELIVERED]
                     |
                     v (Transient failure)
             [RETRY_SCHEDULED] (Exponential backoff + jitter)
                     |
                     +---> (Max attempts 5 reached) ---> [DEAD_LETTERED]
                     |
                     +---> (SSRF / Unrecoverable)   ---> [FAILED_PERMANENTLY]
```

### Dead-Letter Queue (DLQ) Management

- `GET /api/v1/webhooks/deliveries/dead-letter`: Queries dead-lettered events scoped strictly to the calling organization.
- `POST /api/v1/webhooks/deliveries/:id/replay`: Resets attempts to 0, immediately dispatches the outbound delivery, and records a security audit log.

---

## 6. Typed SDK & Verification Helpers

The platform provides `@flowforge/shared` with first-class SDK utilities:

```typescript
import { FlowForgeClient, verifyWebhookSignature } from "@flowforge/shared";

// 1. Initializing Typed Client with Auto-Idempotency and Exponential Retry
const client = new FlowForgeClient({
  baseUrl: "https://api.flowforge.dev",
  apiKey: "ff_live_my_api_key",
  organizationId: "org_12345",
  maxRetries: 3,
});

// Mutating requests automatically inject Idempotency-Key
const execution = await client.post("/api/v1/workflows/wf_xyz/execute", {
  orderId: "ord_5521",
});

// 2. Webhook Signature Verification
const isValid = verifyWebhookSignature({
  payload: rawRequestBody,
  signature: req.headers["x-signature-256"],
  secret: process.env.FLOWFORGE_WEBHOOK_SECRET,
  timestamp: req.headers["x-webhook-timestamp"],
});
```

---

## 7. Observability & Telemetry

Real-time reliability telemetry is exposed at `GET /api/v1/metrics/reliability`:

- Request counts partitioned by functional category (`auth`, `execute`, `search`, `default`).
- Throttled rate limit counter (`rateLimited`).
- Idempotency telemetry (`cacheHits`, `inFlightConflicts`, `mismatches`).
- Inbound webhook counts (`verified`, `invalidSignatures`, `expiredTimestamps`, `replaysDetected`).
- Outbound webhook counts (`delivered`, `retriesScheduled`, `permanentFailures`, `deadLettered`, `replayed`, `activeDeadLetterCount`).
