# FlowForge Platform — Environment Variable Reference Matrix

This reference documents all configuration parameters supported by the FlowForge platform, their validation rules, security classifications, and environment requirements.

---

## 1. Master Environment Configuration Matrix

| Variable Name          | Purpose & Description                                                     |                   Required / Optional                   | Applicable Environments | Sensitive Secret? | Browser Exposed? | Safe Example / Format                                   |
| :--------------------- | :------------------------------------------------------------------------ | :-----------------------------------------------------: | :---------------------: | :---------------: | :--------------: | :------------------------------------------------------ |
| `NODE_ENV`             | Application runtime mode (`development`, `test`, `staging`, `production`) |                      **Required**                       |           All           |        No         |        No        | `production`                                            |
| `PORT`                 | API server listen port (TCP)                                              |               Optional (default: `4000`)                |           All           |        No         |        No        | `4000` (integer 1024–65535)                             |
| `WORKER_PORT`          | Background worker health & metrics port                                   |               Optional (default: `4001`)                |           All           |        No         |        No        | `4001` (cannot match `PORT`)                            |
| `API_URL`              | Canonical public HTTP/HTTPS URL for API                                   | **Required in Prod** (default: `http://localhost:4000`) |           All           |        No         |        No        | `https://api.flowforge.dev`                             |
| `WEB_URL`              | Canonical public URL for Web UI (used for CORS)                           | **Required in Prod** (default: `http://localhost:3000`) |           All           |        No         |        No        | `https://app.flowforge.dev`                             |
| `DATABASE_URL`         | PostgreSQL connection string                                              |                      **Required**                       |           All           |      **YES**      |      **NO**      | `postgresql://user:pass@host:5432/dbname?schema=public` |
| `DATABASE_POOL_MIN`    | Minimum database pool connection count                                    |                 Optional (default: `2`)                 |      Staging, Prod      |        No         |        No        | `5`                                                     |
| `DATABASE_POOL_MAX`    | Maximum database pool connection count                                    |                Optional (default: `20`)                 |      Staging, Prod      |        No         |        No        | `25`                                                    |
| `REDIS_URL`            | Redis server connection string                                            |                      **Required**                       |           All           |      **YES**      |      **NO**      | `redis://redis.internal:6379` or `rediss://...`         |
| `SESSION_SECRET`       | Secret key for signing HTTP session cookies                               |                  **Required in Prod**                   |      Staging, Prod      |      **YES**      |      **NO**      | Min 32 random characters (`openssl rand -base64 32`)    |
| `ENCRYPTION_KEY`       | AES-256-GCM symmetric key for connector credentials                       |                  **Required in Prod**                   |      Staging, Prod      |      **YES**      |      **NO**      | Exactly 64 hex characters (`openssl rand -hex 32`)      |
| `JWT_SECRET`           | Secret for signing internal service tokens                                |                  **Required in Prod**                   |      Staging, Prod      |      **YES**      |      **NO**      | Min 32 random characters                                |
| `RATE_LIMIT_WINDOW_MS` | Sliding window in ms for API rate limiting                                |               Optional (default: `60000`)               |           All           |        No         |        No        | `60000` (positive integer)                              |
| `RATE_LIMIT_MAX`       | Maximum allowed requests per window                                       |                Optional (default: `100`)                |           All           |        No         |        No        | `100` (positive integer)                                |
| `LOG_LEVEL`            | Logging verbosity (`debug`, `info`, `warn`, `error`)                      |               Optional (default: `info`)                |           All           |        No         |        No        | `info`                                                  |
| `NEXT_PUBLIC_API_URL`  | API endpoint URL consumed by client-side browser bundle                   |                   **Required in Web**                   |      Staging, Prod      |        No         |     **YES**      | `https://api.flowforge.dev`                             |

---

## 2. Environment Invariants & Enforcement Rules

### 2.1 Production & Staging Invariants

When `NODE_ENV=production` or `NODE_ENV=staging`, the centralized configuration validator (`@flowforge/config`) enforces strict constraints before accepting incoming traffic:

1. **Cryptographic Invariants:**
   - `SESSION_SECRET` must be at least 32 characters long and cannot match default development placeholders (`flowforge-dev-session-secret-min-16-chars` or containing `change-in-production`).
   - `ENCRYPTION_KEY` must be a valid 64-character hexadecimal string representing 256 bits (32 bytes) of entropy.
2. **Connection Protocol Invariants:**
   - `DATABASE_URL` must use `postgresql://` or `postgres://` protocol. SQLite/file paths (`file:`) are strictly rejected.
   - `REDIS_URL` must use `redis://` or `rediss://` protocol.
3. **Port Invariants:**
   - `PORT` and `WORKER_PORT` must be distinct integers between 1 and 65535.

### 2.2 Development & Test Invariants

When `NODE_ENV=development` or `NODE_ENV=test`:

- Safe in-memory and local defaults are supplied automatically.
- Unit and integration tests can execute in isolated environments without external credentials.

---

## 3. Browser vs. Server Variable Boundary

> [!CAUTION]
> In Next.js, **ONLY** environment variables explicitly prefixed with `NEXT_PUBLIC_` are inlined into the client-side JavaScript bundle.  
> Never prefix database credentials, encryption keys, or session secrets with `NEXT_PUBLIC_`.
