# FlowForge — Business Workflow Automation Platform

FlowForge is a resilient, multi-tenant business workflow automation platform built with modern TypeScript across both backend services and frontend applications.

It enables organizations to automate repetitive operational processes through a visual workflow editor, durable execution engine, human-in-the-loop approvals, scheduled tasks, webhook triggers, and external API integrations.

---

## Architecture Overview

```
FlowForge/
|-- apps/
|   |-- web/             # Next.js App router, Tailwind CSS, React Flow visual editor
|   |-- api/             # Express REST API, session authentication, RBAC, webhooks
|   |-- worker/          # Resilient background execution worker, timeout & retry handling
|
|-- packages/
|   |-- database/        # Prisma schema, multi-tenant abstractions, migrations
|   |-- shared/          # Universal Zod schemas, domain types, API contracts, RBAC
|   |-- workflow-engine/ # Pure graph validation, topological sort, conditions & state machine
|   |-- integrations/    # SSRF-guarded HTTP client, webhooks, email delivery, scheduler
|   |-- config/          # Environment configuration loader with Zod validation
|   |-- test-utils/      # In-memory database store, fixtures & mock utilities
|
|-- tests/
|   |-- unit/            # Shared contracts, database invariants, infrastructure tests
|   |-- integration/     # End-to-end API and workflow execution tests
|   |-- security/        # Tenant isolation & SSRF penetration tests
|
|-- docs/                # Architecture, DB schema, API contracts, state machine specs
|-- docker-compose.yml   # Multi-container orchestration (Postgres, Redis, API, Worker, Web)
```

---

## Core Capabilities

1. **Visual Workflow Builder**: Interactive drag-and-drop workflow canvas powered by React Flow with custom node handlers (`TRIGGER`, `CONDITION`, `HTTP_REQUEST`, `EMAIL`, `APPROVAL`, `DELAY`, `END`).
2. **Durable Execution Engine**: State-machine driven workflow execution (`QUEUED`, `RUNNING`, `WAITING_APPROVAL`, `WAITING_DELAY`, `RETRYING`, `SUCCEEDED`, `FAILED`, `CANCELLED`).
3. **Human Approval Inbox**: Approvers can inspect execution context, submit approvals or rejections with audit comments, and resume waiting workflows.
4. **Security & Isolation**: Multi-tenant database partitioning, bcrypt session authentication, role-based access control (`OWNER`, `ADMIN`, `MEMBER`), and SSRF guards blocking private subnets and metadata IPs.
5. **Resilient Integrations**: Safe HTTP actions with bounded exponential retries, webhook signature verification (HMAC SHA-256), and idempotent email dispatch.

---

## Quickstart & Local Setup

### 1. Prerequisites

- **Node.js**: v20+ (tested on Node.js v24.19.0)
- **pnpm**: v9+ (tested on pnpm v12.16.1)
- **Docker & Docker Compose** (optional for containerized PostgreSQL and Redis)

### 2. Installation

```bash
# Install all monorepo dependencies
pnpm install
```

### 3. Running Automated Tests & Quality Checks

```bash
# Run all unit, integration, and security tests (56 tests)
pnpm test

# Run unit tests only
pnpm test:unit

# Run API and workflow integration tests
pnpm test:integration

# Run security and tenant isolation tests
pnpm test:security

# Type checking across all workspaces
pnpm typecheck

# Code formatting check & linting
pnpm format
pnpm lint
```

### 4. Running the Development Environment

```bash
# Start all services concurrently (Web, API, Worker)
pnpm dev

# Or start services individually:
pnpm dev:api       # Express API server on port 4000
pnpm dev:worker    # Background worker service on port 4001
pnpm dev:web       # Next.js web application on port 3000
```

- Web Application: [http://localhost:3000](http://localhost:3000)
- REST API Server: [http://localhost:4000](http://localhost:4000)
- Process Liveness Check: [http://localhost:4000/health](http://localhost:4000/health)
- Dependency Readiness Check: [http://localhost:4000/ready](http://localhost:4000/ready)
- Worker Healthcheck: [http://localhost:4001/health](http://localhost:4001/health)

### 5. Running with Docker Compose

```bash
# Start PostgreSQL 16 and Redis 7 in background
pnpm db:up

# Stop databases safely
pnpm db:down

# Start entire containerized stack
docker compose up --build -d
```

---

## Verification & Test Results

- **Unit & Contract Tests**: 27 tests passing (`tests/unit/shared-contracts.test.ts`, `tests/unit/database-entities.test.ts`, `tests/unit/infrastructure.test.ts`, `packages/workflow-engine`, `packages/integrations`).
- **Integration Tests**: 11 tests passing (`tests/integration/api-auth.test.ts`, `tests/integration/workflow-execution.test.ts`).
- **Security Tests**: 5 tests passing (`tests/security/tenant-isolation.test.ts`).
- **Total**: 56/56 passing tests across 8 test suites.
