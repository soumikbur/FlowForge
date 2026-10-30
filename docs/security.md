# FlowForge Security Architecture & Threat Model

## 1. Authentication & Session Hygiene
- **Password Hashing**: Uses `bcrypt` (or `argon2id`) with high work factor.
- **Session Tokens**: Cryptographically random 256-bit entropy tokens stored in database with explicit `expiresAt`.
- **Cookie Security**: `HttpOnly`, `SameSite=Lax` (or `Strict`), `Secure` enabled in production.
- **CSRF Defense**: Double-submit cookie or custom header validation (`X-Requested-With` / Bearer token fallback for API consumers).
- **Brute Force Protection**: In-memory and Redis-backed rate limiting on `/api/v1/auth/*` endpoints.

## 2. Multi-Tenant Organization Isolation
- **Organization Boundary**: All database queries for workflows, versions, executions, approvals, credentials, and audit logs MUST include `where: { organizationId }`.
- **Tenant Middleware**: Resolves active organization from session context and asserts user membership role.
- **Cross-Tenant Prevention**: Explicit integration and security unit tests assert that Organization A cannot inspect, execute, or mutate entities belonging to Organization B.

## 3. Server-Side Request Forgery (SSRF) Prevention
- Outbound HTTP action nodes executed by the workflow engine and integrations must never target private IP ranges:
  - Loopback (`127.0.0.0/8`, `::1`)
  - Link-local (`169.254.0.0/16`)
  - RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Cloud metadata endpoints (e.g., `169.254.169.254`)
- DNS resolution checks and redirect URL re-validation prevent DNS rebinding attacks.

## 4. Workflow Code & Expression Sandboxing
- Expressions in `CONDITION` nodes are parsed using a safe abstract syntax tree evaluator or restricted expression engine without access to `process`, `require`, `fs`, `eval`, or global prototypes.

## 5. Secret Protection & Audit Logging
- Integration credentials (API keys, SMTP passwords) are symmetrically encrypted at rest (AES-256-GCM) with an environment encryption key.
- Secrets are masked from logs, execution histories, and API responses.
- Administrative actions (role changes, credential updates, workflow publications, approval decisions) are permanently recorded in `AuditLog`.
