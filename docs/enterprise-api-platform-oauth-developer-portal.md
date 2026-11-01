# FlowForge Enterprise API Platform, OAuth 2.0 Client Credentials & Developer Portal

## 1. Executive Summary

FlowForge provides a production-grade Enterprise API Platform designed for seamless programmatic integration, robust machine-to-machine automation, and developer-first extensibility. The platform architecture incorporates modern API standards, including:

- Dual credential management: Granular API Keys (live and sandbox test keys) and RFC 6749 OAuth 2.0 Client Credentials Grant.
- Granular permission-mapped scopes for least-privilege automation.
- Cryptographically verifiable webhook event notifications with SSRF defenses.
- End-to-end idempotency protection with conflict detection and automated replay.
- High-performance rate limiting and quota enforcement with standard HTTP headers.
- Integrated, self-hosted Developer Portal and OpenAPI 3.1.0 specifications.

---

## 2. API Architecture & Request Lifecycle

### 2.1 Uniform API Surface & Envelopes

All programmatic endpoints reside under `/api/v1/` and follow strict REST conventions. Every response uses a standardized envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 100
  }
}
```

Error responses adhere to standard error envelopes:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Missing required API scope: workflows:write",
    "details": {
      "requiredPermission": "workflow:write",
      "grantedScopes": ["workflows:read"]
    }
  }
}
```

### 2.2 Traceability & Correlation Headers

Every incoming API request is stamped with end-to-end tracing headers:

- `X-Correlation-Id`: Inbound distributed tracing identifier (or auto-generated UUID).
- `X-Request-Id`: Distinct request execution identifier.
- `Idempotent-Replayed: true`: Present when returning a previously cached response via an idempotency key.

---

## 3. Authentication Mechanisms

FlowForge supports three complementary authentication paradigms depending on the consuming client:

### 3.1 User Sessions

Interactive web UI sessions use HTTP-only, secure, `SameSite=Strict` cookies authenticated via session tokens stored in PostgreSQL.

### 3.2 Enterprise API Keys

API keys are ideal for long-lived automation scripts, CI/CD workers, and internal microservices.

- **Key Formats & Sandbox Separation**:
  - Live production keys: `ff_live_<48-hex-characters>`
  - Sandbox test keys: `ff_test_<48-hex-characters>` (allows testing integrations without impacting production metrics)
- **Security & Storage**:
  - Keys are generated with 24 bytes of cryptographically secure entropy (`crypto.randomBytes(24).toString("hex")`).
  - Raw secret keys are displayed **only once** upon generation or rotation and are never stored in plaintext.
  - Hashed using SHA-256 for rapid, timing-safe lookup (`apiStore.apiKeys` index / Prisma database).
  - Truncated display prefix: `ff_live_abcd...1234` for secure dashboard auditing.
- **Workspace Scoping**:
  - Keys can optionally be bound to a specific workspace (`workspaceId`), automatically restricting access to workflows and resources within that workspace.
- **Seamless Secret Rotation**:
  - Zero-downtime key rotation via `POST /api/v1/organizations/:organizationId/api-keys/:keyId/rotate`.
  - Supports configurable `gracePeriodSeconds` (default: 3600s, max: 604800s / 7 days).
  - During the grace period, both the old key and new key are accepted simultaneously.

### 3.3 OAuth 2.0 Machine-to-Machine Client Credentials (RFC 6749)

For enterprise zero-trust architectures and third-party systems that require ephemeral tokens rather than static keys:

- **Client Registration**:
  - Clients are registered via `POST /api/v1/organizations/:organizationId/oauth/clients`.
  - Generates `clientId` (`ff_client_<uuid>`) and confidential `clientSecret` (`ff_sec_<48-hex>`).
  - Raw client secret is displayed only once; database stores only the SHA-256 hash.
- **Token Exchange (`POST /api/v1/oauth/token`)**:
  - Standard RFC 6749 `grant_type=client_credentials`.
  - Supports both HTTP Basic Authentication (`Authorization: Basic base64(clientId:clientSecret)`) and request body parameters (`client_id` and `client_secret`).
  - Issues signed, ephemeral Bearer access tokens with format `ff_oat_<payload>.<hmacSignature>`.
  - Default token lifespan: 3600 seconds (1 hour).
- **Token Verification**:
  - Authenticated via constant-time HMAC-SHA256 signature verification.
  - Automatically verifies expiration (`exp`) and active status of the client application.
  - Zero-database-hit token validation with full organization and scope context embedded in the signed payload.

---

## 4. Granular Scopes & Permission Mapping

FlowForge maps standard plural OAuth/API key scopes to fine-grained internal RBAC permissions:

| Granular Scope     | Internal Permission   | Description                                            |
| :----------------- | :-------------------- | :----------------------------------------------------- |
| `workflows:read`   | `workflow:read`       | Read workflow definitions, graphs, and versions        |
| `workflows:write`  | `workflow:write`      | Create, update, publish, or delete workflows           |
| `executions:read`  | `execution:read`      | View execution history, logs, and step outputs         |
| `executions:write` | `execution:create`    | Trigger workflow runs and execute workflows            |
| `approvals:read`   | `approval:read`       | Inspect pending human approval tasks                   |
| `approvals:write`  | `approval:decide`     | Approve or reject pending execution gates              |
| `connectors:read`  | `connector:read`      | Inspect installed connectors and schema configurations |
| `connectors:write` | `connector:write`     | Create or update connector credentials and endpoints   |
| `usage:read`       | `analytics:read`      | Retrieve usage statistics and execution metrics        |
| `webhooks:read`    | `workflow:read`       | Inspect outbound webhook configurations                |
| `webhooks:write`   | `workflow:write`      | Create, update, or rotate webhook subscriptions        |
| `apikeys:read`     | `organization:read`   | List API keys and registered OAuth clients             |
| `apikeys:write`    | `organization:update` | Create, rotate, or revoke API keys and OAuth clients   |

Any token or key lacking the required scope is rejected immediately with `403 FORBIDDEN` and error code `PERMISSION_DENIED`.

---

## 5. End-to-End Idempotency Engine

Mutating API operations (`POST`, `PUT`, `PATCH`, `DELETE`) support the standard `Idempotency-Key` (or `X-Idempotency-Key`) header:

1. **Payload Hashing**:
   - Computes a SHA-256 hash of the incoming request body and HTTP path.
2. **Conflict Detection**:
   - If a request is received with an existing idempotency key but a **different payload**, the engine returns `409 IDEMPOTENCY_MISMATCH`.
3. **In-Flight Locking**:
   - Concurrent requests with identical idempotency keys yield `409 IDEMPOTENCY_IN_FLIGHT` with retry recommendations.
4. **Transparent Replay**:
   - Once completed, identical repeated requests return the cached response with HTTP header `Idempotent-Replayed: true` and status `200 OK` (with `meta.idempotent = true`).
5. **Retention & TTL**:
   - Idempotency records are durably maintained for 24 hours.

---

## 6. Rate Limiting & Usage Governance

Rate limiting protects against runaway scripts, API abuse, and denial-of-service:

- **Algorithm**: Sliding window token bucket enforced per client principal and per organization.
- **Default Tier Limits**:
  - Standard API traffic: 60 requests / minute per key.
  - Sensitive endpoints (token generation, key rotation): 10 requests / minute.
- **Rate Limit Headers**:
  - `X-RateLimit-Limit`: Maximum requests permitted in window.
  - `X-RateLimit-Remaining`: Remaining allowance in current window.
  - `X-RateLimit-Reset`: Unix timestamp when quota resets.
- **Exceeding Limits**:
  - Returns `429 Too Many Requests` with `Retry-After: <seconds>` and error code `RATE_LIMIT_EXCEEDED`.

---

## 7. Webhook Subscriptions & Secure Delivery

Outbound webhook event notifications allow external services to react in real-time to workflow lifecycle events (`workflow.started`, `workflow.completed`, `workflow.failed`, `approval.requested`).

### 7.1 Cryptographic Signatures

All outbound webhook deliveries include cryptographic signatures preventing tampering and replay attacks:

```http
X-FlowForge-Signature: t=1698765432,v1=a1b2c3d4e5f6...
X-FlowForge-Event: workflow.completed
X-FlowForge-Delivery: del_987654321
```

The signature is computed as:
$$\text{HMAC-SHA256}(\text{webhookSecret}, \text{timestamp} + "." + \text{rawJsonBody})$$

### 7.2 SSRF Protection & Private IP Defense

The webhook dispatcher evaluates all target URLs:

- Blocks private IPv4 address spaces (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- Blocks link-local, carrier-grade NAT, and cloud metadata endpoints (`169.254.169.254`).
- Blocks IPv6 loopback (`::1`) and unique local addresses (`fc00::/7`).
- Enforces strict HTTPS requirements in production mode.

### 7.3 Delivery Lifecycle & Secret Rotation

- Zero-downtime webhook secret rotation with previous secret grace periods.
- Durable delivery logs recording status code, latency, attempt count, and payload preview.
- Exponential backoff retry policy for transient 5xx HTTP responses.

---

## 8. Developer Portal & OpenAPI 3.1.0 Specification

FlowForge includes an interactive Developer Portal accessible directly through the API server:

- `GET /api/v1/docs`: Clean, responsive HTML Developer Portal documentation with interactive code snippets (cURL, Python, TypeScript) and authentication guides.
- `GET /api/v1/docs/openapi.json`: Up-to-date OpenAPI 3.1.0 specification in JSON format.
- `GET /api/v1/docs/openapi.yaml`: OpenAPI 3.1.0 specification in YAML format.
- Repository OpenAPI spec: Maintained at `docs/openapi.yaml`.

Security schemes defined in the specification:

- `apiKeyAuth`: Header `X-API-Key` or `Authorization: Bearer ff_live_...`
- `oauth2ClientCredentials`: OAuth 2.0 Token URL `/api/v1/oauth/token` with granular scopes.

---

## 9. Verification & Test Evidence

The Enterprise API Platform subsystem is validated by a dedicated integration test suite (`tests/integration/enterprise-api-platform-oauth.test.ts`) covering 25 comprehensive scenarios:

1. **API Key Lifecycle & Rotation**:
   - Creation of live (`ff_live_...`) and test sandbox (`ff_test_...`) keys.
   - Dual-key acceptance during rotation grace period.
   - Revocation and invalidation of expired keys.
   - Truncated display and raw secret redaction.
   - Workspace-scoped key enforcement.
2. **OAuth 2.0 Client Credentials Grant (RFC 6749)**:
   - Client registration, listing, updating, and deletion.
   - Client secret rotation with single raw secret disclosure.
   - Token issuance via Basic Auth and request body parameters.
   - Scope reduction and validation.
   - Disabling OAuth clients and rejecting revoked tokens.
3. **Granular Scope Enforcement**:
   - Successful access when matching permission scope is present (`workflows:read`).
   - `403 FORBIDDEN` when scope is missing or mismatched (`workflows:write` missing on POST).
4. **Idempotency Protection**:
   - Replay of identical POST requests returning cached responses with `Idempotent-Replayed: true`.
   - `409 IDEMPOTENCY_MISMATCH` when payload changes.
5. **Rate Limiting & Correlation**:
   - Rapid burst enforcement returning `429 RATE_LIMIT_EXCEEDED` and `Retry-After`.
   - Propagation of `X-Correlation-Id` and `X-Request-Id`.
6. **Webhooks & SSRF Defense**:
   - Webhook creation, listing, signature generation, secret rotation, and private IP blocking.
7. **Developer Portal & OpenAPI**:
   - HTML portal rendering, OpenAPI JSON, and OpenAPI YAML retrieval.
8. **Multi-Tenant Isolation**:
   - Cross-organization API key and OAuth token access rejection.

### Test Results Summary

- `tests/integration/enterprise-api-platform-oauth.test.ts`: **25 / 25 passed**
- Full monorepo integration suite: **568 / 568 passed (36 / 36 test files)**
- TypeScript typecheck: **0 errors**
- ESLint linting: **0 errors, 0 warnings**
- Next.js 14 production build: **Clean compile**
