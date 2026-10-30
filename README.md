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
- **Docker & Docker Compose** (optional for containerized deployment)

### 2. Installation
```bash
# Install all monorepo dependencies
pnpm install
```

### 3. Running Automated Tests
```bash
# Run all unit, integration, and security tests
pnpm test

# Run specific test suites
pnpm test:unit
pnpm test:integration
pnpm test:security
```

### 4. Running the Development Environment
```bash
# Start API, Worker, and Web frontend concurrently
pnpm dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)
- REST API Server: [http://localhost:4000](http://localhost:4000)
- Worker Healthcheck: [http://localhost:4001/health](http://localhost:4001/health)

### 5. Running with Docker Compose
```bash
docker compose up --build -d
```

---

## Verification & Test Results
- **Unit Tests**: Verified graph cycle detection, unreachable node checks, condition evaluations, and state transitions.
- **Integration Tests**: Verified user registration, login session flow, workflow publishing, execution trigger, human approval suspension, and execution resumption.
- **Security Tests**: Verified tenant isolation (cross-tenant access rejected with 404) and SSRF protections blocking loopback, RFC 1918, and cloud metadata targets.
