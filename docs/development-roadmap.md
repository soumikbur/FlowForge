# FlowForge Development Roadmap

- **Phase 0: Architecture & Environment Audit (Completed)**
  - Confirmed directory isolation in `FlowForge`.
  - Audited local toolchain (Node 24, npm 11, pnpm 12, Git 2.56, Docker host limitations).
  - Authored foundational specifications (`architecture.md`, `database-schema.md`, `workflow-specification.md`, `execution-state-machine.md`, `api-contracts.md`, `security.md`, `testing.md`).

- **Phase 1: Project Foundation & Database Layer (Completed)**
  - Configured pnpm workspaces with strict TypeScript settings (`tsconfig.base.json`).
  - Implemented `@flowforge/config` with Zod environment validation.
  - Implemented `@flowforge/shared` with Zod domain schemas, AST nodes, execution states, and API envelopes.
  - Implemented `@flowforge/database` with PostgreSQL Prisma schema, versioned migration DDL (`migration.sql`), and tenant isolation helpers.
  - Implemented non-cascade deletion invariant (`ON DELETE RESTRICT`) preventing execution history loss on workflow removal.
  - Implemented initial API foundation in `apps/api` with structured logging, `X-Correlation-Id` propagation, `/health` liveness, and `/ready` dependency checks.
  - Established Docker Compose specification for PostgreSQL 16 and Redis 7.
  - Created automated test suites in Vitest: 56/56 passing tests across unit, integration, and security layers.
  - Verified ESLint, Prettier, and TypeScript compilation across all 10 workspace packages.

- **Phase 2: Authentication, Authorization & Tenant Security (Next Phase)**
  - Cookie session management, CSRF protection, rate limiting, and RBAC middleware.

- **Phase 3: Workflow Management & Publishing REST API**
  - Workflow draft CRUD, graph publishing, version sequencing, and version snapshotting.

- **Phase 4: Frontend Foundation & Navigation**
  - Next.js UI shell, responsive navigation, and authentication flows.

- **Phase 5: Visual Workflow Builder**
  - React Flow interactive canvas, custom node palette, and property configuration drawer.

- **Phase 6: Workflow Execution Engine & State Machine**
  - Distributed execution orchestrator, step planner, condition evaluator, and retry policies.

- **Phase 7: Background Worker & Recovery**
  - BullMQ job processor, failure recovery, worker interruption handling, and heartbeat monitoring.

- **Phase 8: Human Approvals & Decision Inbox**
  - Approval inbox, audit trail, concurrency handling, and execution resumption.

- **Phase 9: Integrations Subsystem**
  - SSRF-safe HTTP action, webhooks with HMAC signatures, email delivery, and cron scheduler.

- **Phase 10: Production Verification & Deployment**
  - End-to-end containerized verification and operational documentation.
