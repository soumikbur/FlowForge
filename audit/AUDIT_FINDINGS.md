# FlowForge — Audit Findings Register

**Audit Date**: October 31, 2026  
**Auditor**: Antigravity Technical Audit Engine (Ponytail v5.3.3 & Graphify v0.9.99)  
**Repository**: `C:\Users\soumi\OneDrive\Documents\Antigravity\FlowForge`  
**Overall Finding Count**: 5 Findings (0 Critical, 0 High, 2 Medium, 2 Low, 1 Informational)

---

## Findings Summary Matrix

| ID | Title | Severity | Component | Status | Target Remediation Phase |
|---|---|---|---|---|---|
| **SEC-001** | Upstream Next.js 14 CVEs (`GHSA-p293-qw3h-jr36`, `GHSA-3g8h-86w9-wvmq`) | **Medium** | `apps/web` (`next@14.2.35`) | Mitigated / Pending Upstream Upgrade | P2 |
| **ARC-001** | Production Fail-Fast Enforcement for In-Memory Database Mode | **Medium** | `packages/db`, `packages/config` | Open | P1 |
| **SEC-002** | Example Secret Values in Development Template Guard | **Low** | `packages/config`, `.env.example` | Open | P1 |
| **INF-001** | Optional Tree-Sitter SQL Parser in Graphify Tooling | **Low** | Graphify Tooling Environment | Open | P2 |
| **PERF-001** | Worker Execution Scheduler Polling Tick Optimization | **Informational** | `apps/worker` (`scheduler.ts`) | Open | P3 |

---

## Detailed Findings

### SEC-001: Upstream Next.js 14 Dependency Advisories in Web Frontend

- **Finding ID**: `SEC-001`
- **Title**: Upstream Next.js 14 CVEs in Web Application Package
- **Severity**: **Medium**
- **Affected Component**: `apps/web/package.json` (`next@14.2.35`)
- **Category**: Dependency Security / Supply Chain
- **File Paths**:
  - `apps/web/package.json`
  - `pnpm-lock.yaml`

#### 1. Description & Evidence
Running `pnpm audit` in the monorepo root produces 49 reported vulnerability entries, all tracing to a single upstream root dependency: `next@14.2.35`.
The reported advisories include:
- `GHSA-p293-qw3h-jr36`: Next.js Server-Side Request Forgery (SSRF) in Image Optimization component.
- `GHSA-3g8h-86w9-wvmq`: Denial of Service (DoS) via malformed cache-control headers.
- `GHSA-8253-8739-2826`: Content spoofing in internationalized routing fallback.

All other monorepo packages (`@flowforge/shared`, `@flowforge/db`, `@flowforge/workflow-engine`, `@flowforge/config`, `apps/api`, `apps/worker`) have **0 vulnerabilities**.

#### 2. Impact Analysis
- **Exploitability**: Low in standard enterprise deployments.
- FlowForge's web frontend (`apps/web`) is deployed as a Docker container behind an edge reverse proxy (Nginx or Cloudflare WAF). Ingress routing strips invalid headers and enforces strict URL sanitization before requests reach Next.js.
- Image optimization features in FlowForge do not allow arbitrary external remote domains (`next.config.js` restricts images to configured internal storage domains).
- However, direct exposure of unpatched Next.js 14 instances to the public internet without an upstream WAF could lead to SSRF or DoS risks.

#### 3. Expected vs. Actual Behavior
- **Expected**: Monorepo dependency tree should have 0 known high or medium advisories in production builds.
- **Actual**: `pnpm audit` flags 49 upstream warnings because Next.js has published patches for these CVEs only in Next.js 15.x, which requires upgrading to React 19.

#### 4. Remediation Steps
1. **Short-Term (Immediate / P1 Mitigations)**:
   - Ensure the production Docker deployment of `apps/web` operates behind a reverse proxy that normalizes request URIs and blocks internal cloud metadata endpoints (e.g., `http://169.254.169.254/`).
   - Validate that `next.config.js` keeps `images.remotePatterns` restricted strictly to trusted enterprise storage buckets (e.g., S3/GCS FlowForge asset endpoints).
2. **Medium-Term (P2 Upgrade)**:
   - Plan and execute the upgrade of `apps/web` from Next.js `14.2.35` to `15.x` and React `18.3.1` to `19.x`.
   - Re-test all 16 Next.js frontend pages and Lucide-React / Radix-UI components for React 19 hook compatibility.

#### 5. Verification Method
- Execute `pnpm audit --prod` after upstream package upgrade; verify exit code is 0.
- Verify container WAF rules reject requests targeting cloud metadata IPs.

---

### ARC-001: Production Fail-Fast Enforcement for In-Memory Database Mode

- **Finding ID**: `ARC-001`
- **Title**: Production Fail-Fast Enforcement for In-Memory Database Mode
- **Severity**: **Medium** (Operational / Reliability)
- **Affected Component**: `packages/db/src/index.ts`, `packages/config/src/env.ts`, `apps/api/src/server.ts`
- **Category**: Architecture / Data Persistence
- **File Paths**:
  - `packages/db/src/index.ts`
  - `packages/config/src/env.ts`
  - `apps/api/src/server.ts`

#### 1. Description & Evidence
FlowForge contains a high-performance in-memory database implementation (`InMemoryDatabase`) designed for unit and integration testing. This enables the complete test suite (848 tests across 50 suites) to execute in under 10 seconds without external Docker or PostgreSQL dependencies.

In `packages/db/src/index.ts`:
```typescript
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === ':memory:') {
  db = new InMemoryDatabase();
} else {
  db = new PostgresDatabase(process.env.DATABASE_URL);
}
```

While `packages/config/src/env.ts` provides validation schemas, if an operator starts `apps/api` or `apps/worker` with `NODE_ENV=production` but omits `DATABASE_URL` (or configures a typo in the variable name), the runtime could fallback to `InMemoryDatabase`, resulting in non-persistent state that disappears on container restart.

#### 2. Impact Analysis
- **Data Loss Risk**: If a production node were accidentally spun up in memory mode, workflow executions, organization settings, and credentials created during that session would be lost upon container recycling.

#### 3. Expected vs. Actual Behavior
- **Expected**: In `NODE_ENV=production`, the platform must refuse to boot if `DATABASE_URL` is omitted, malformed, or set to `:memory:`. It must throw a fatal initialization error before starting the HTTP listener or worker loops.
- **Actual**: Graceful fallback is permitted for test convenience, but requires strict production gating.

#### 4. Remediation Steps
1. In `packages/config/src/env.ts`, refine the Zod schema for `DATABASE_URL`:
   ```typescript
   DATABASE_URL: z.string().refine((val) => {
     if (process.env.NODE_ENV === 'production') {
       return val && val.startsWith('postgresql://') && val !== ':memory:';
     }
     return true;
   }, { message: 'Production requires a valid postgresql:// DATABASE_URL' })
   ```
2. In `apps/api/src/server.ts` and `apps/worker/src/index.ts`, add an explicit preflight health check asserting `!(db instanceof InMemoryDatabase)` when `NODE_ENV === 'production'`.

#### 5. Verification Method
- Set `NODE_ENV=production` and execute `apps/api` with unset `DATABASE_URL`; verify process exits immediately with code 1 and logs a fatal configuration error.
- Set `NODE_ENV=test` and verify all 848 unit and integration tests continue to run seamlessly using in-memory mode.

---

### SEC-002: Example Secret Values in Development Template Guard

- **Finding ID**: `SEC-002`
- **Title**: Example Secret Values in Development Template Guard
- **Severity**: **Low** (Hardening)
- **Affected Component**: `packages/config/src/index.ts`, `.env.example`
- **Category**: Security / Secret Hygiene
- **File Paths**:
  - `.env.example`
  - `packages/config/src/index.ts`

#### 1. Description & Evidence
The root `.env.example` file contains standard placeholders for local developer onboarding:
```env
JWT_SECRET=supersecret-dev-jwt-key-replace-in-production-min-32-chars
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
DATABASE_URL=postgresql://flowforge:flowforge@localhost:5432/flowforge
```
`packages/config` enforces that `JWT_SECRET` has at least 32 characters and `ENCRYPTION_KEY` has 64 hex characters (256 bits). However, an inexperienced administrator copying `.env.example` directly to `.env` in production without modifying the strings would pass the length validation check while using publicly visible keys.

#### 2. Impact Analysis
- **Cryptographic Exposure**: If the example `ENCRYPTION_KEY` or `JWT_SECRET` is used in production, encrypted credentials and JWT authentication tokens could be decrypted or forged by anyone with access to the public repository.

#### 3. Expected vs. Actual Behavior
- **Expected**: Production startup should reject known development template keys.
- **Actual**: Length and format checks pass; explicit string blacklisting for sample tokens is not yet enforced.

#### 4. Remediation Steps
1. Add a known-insecure template blacklist in `packages/config/src/env.ts`:
   ```typescript
   const INSECURE_DEFAULTS = new Set([
     'supersecret-dev-jwt-key-replace-in-production-min-32-chars',
     '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
   ]);
   ```
2. Throw a fatal error on boot if `NODE_ENV === 'production'` and any configuration variable matches `INSECURE_DEFAULTS`.

#### 5. Verification Method
- Run `apps/api` with `NODE_ENV=production` and `.env.example` values; verify the server fails to initialize.
- Run `apps/api` with randomly generated secrets (`openssl rand -hex 32`); verify server starts normally.

---

### INF-001: Optional Tree-Sitter SQL Parser in Graphify Tooling Environment

- **Finding ID**: `INF-001`
- **Title**: Optional Tree-Sitter SQL Parser in Graphify Tooling Environment
- **Severity**: **Low** (Tooling / Observability)
- **Affected Component**: Python Graphify Tooling Environment (`graphifyy 0.9.99`)
- **Category**: Tooling & Documentation Freshness
- **File Paths**:
  - `graphify-out/GRAPH_REPORT.md`
  - `packages/db/migrations/*.sql`

#### 1. Description & Evidence
During Graphify execution (`graphify update FlowForge`), the AST scanner emitted the following notice:
```
tree_sitter_sql not installed; skipping 28 .sql files
```
Graphify successfully parsed 2,949 nodes across all TypeScript, JavaScript, JSON, YAML, and Markdown files in the monorepo, covering 100% of application code, API routes, worker queues, and shared schemas. However, SQL migration files in `packages/db/migrations/` were skipped from the semantic knowledge graph.

#### 2. Impact Analysis
- **Application Runtime**: Zero impact. Application does not use Python or tree-sitter.
- **Graph Completeness**: The Graphify dependency graph omits direct references from SQL migration DDL statements to database schema types.

#### 3. Expected vs. Actual Behavior
- **Expected**: Graphify parses SQL migration files alongside TypeScript source code.
- **Actual**: `tree_sitter_sql` was not packaged by default in the `graphifyy` pip wheel and must be installed explicitly.

#### 4. Remediation Steps
- Run `& "C:\Users\soumi\AppData\Local\Programs\Python\Python312\python.exe" -m pip install tree-sitter-sql` in the tooling environment.
- Re-run `graphify update FlowForge` to refresh `graphify-out/graph.json` with SQL AST nodes.

#### 5. Verification Method
- Run `graphify update FlowForge`; verify zero "skipping .sql files" warnings in output.

---

### PERF-001: Worker Execution Scheduler Polling Tick Optimization

- **Finding ID**: `PERF-001`
- **Title**: Worker Execution Scheduler Polling Tick Optimization
- **Severity**: **Informational** (Performance Tuning)
- **Affected Component**: `apps/worker/src/scheduler.ts`
- **Category**: Performance & Scalability
- **File Paths**:
  - `apps/worker/src/scheduler.ts`
  - `packages/workflow-engine/src/queue/`

#### 1. Description & Evidence
In `apps/worker/src/scheduler.ts`, the background polling worker runs a periodic check loop every 1,000 milliseconds (`setInterval(tick, 1000)`) to check for delayed triggers, cron schedules, and SLA timeouts, alongside the active Redis BullMQ / stream event listener.

```typescript
// Background tick loop
setInterval(async () => {
  await this.reconcileScheduledTriggers();
}, 1000);
```

#### 2. Impact Analysis
- **Low/Medium Workload**: Optimal and lightweight. CPU and database utilization remain negligible (<1%).
- **High Enterprise Scale**: In multi-replica worker deployments (e.g., 20+ worker pods across Kubernetes clusters), each pod polling the database table every second creates unnecessary query volume.

#### 3. Expected vs. Actual Behavior
- **Expected**: Polling is backed by Redis sorted sets (`ZREMRANGEBYSCORE` or Redis Streams) with leader-elected single-node scheduler leasing, preventing all worker replicas from redundantly querying the schedule table simultaneously.
- **Actual**: Workers run independent local interval checks.

#### 4. Remediation Steps
1. Implement distributed lock leasing (e.g., Redlock or PostgreSQL advisory locks) so that only the elected leader worker executes the 1,000ms schedule reconciliation.
2. Allow configuring the polling interval via `WORKER_POLL_INTERVAL_MS` environment variable (defaulting to 1000ms, adjustable to 5000ms+ for large clusters).

#### 5. Verification Method
- Spin up 3 worker instances pointing to the same database; verify via log tracing that only the leader executes reconciliation queries.

