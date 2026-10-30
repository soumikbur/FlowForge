# FlowForge Architecture

## 1. System Overview

FlowForge is a resilient, multi-tenant business workflow automation platform built with modern TypeScript across both backend services and frontend applications.

```mermaid
graph TD
    User([Web User]) --> Web[Next.js Web Application]
    External[External Systems / Webhooks] --> API[Express REST API]
    Web --> API

    API --> DB[(PostgreSQL Primary)]
    API --> Queue[(Redis / BullMQ)]

    Queue --> Worker[Worker Application]
    Worker --> Engine[Workflow Engine Package]
    Worker --> DB
    Worker --> Integrations[Integrations Package]
    Integrations --> ExternalAPIs[External Services / SMTP / HTTP]
```

## 2. Monorepo Structure & Boundaries

The codebase is structured as a pnpm monorepo with distinct separation of concerns:

- `apps/web`: Next.js frontend with Tailwind CSS and React Flow for visual workflow editing, execution monitoring, approval inbox, and dashboard.
- `apps/api`: Node.js Express API providing authenticated REST endpoints for workflows, versions, executions, approvals, credentials, and webhooks.
- `apps/worker`: BullMQ background worker executing discrete workflow tasks, handling retries, polling delays, and resilient state recovery.
- `packages/database`: Prisma schema, migrations, connection pooling, and multi-tenant repository abstractions.
- `packages/shared`: Universal domain types, Zod schemas, error definitions, and constants shared across client and server.
- `packages/workflow-engine`: Core pure engine logic (graph validation, topological sort, DAG cycle detection, condition evaluation, and execution state transitions). Has zero dependencies on HTTP or UI frameworks.
- `packages/integrations`: Connectors for Webhooks, outgoing HTTP requests, email notifications, and scheduled triggers with SSRF protections and timeout controls.
- `packages/config`: Common configuration, environment variable loaders, and logger definitions.
- `packages/test-utils`: Test fixtures, mock servers, and testing helpers.

## 3. Storage & Resilience Guarantees

- **PostgreSQL as Source of Truth**: All workflow definitions, immutable versions, executions, and step states are durably stored in PostgreSQL. Redis is strictly used as an execution transport and job queue; execution history never relies on Redis persistence.
- **Worker Recovery & Idempotency**: Jobs are assigned deterministic execution and step IDs. Worker crashes during step execution are detected by heartbeat timeouts and re-evaluated using idempotent step transitions.
- **Immutable Versions**: When a workflow is published, its definition snapshot is stored as an immutable `WorkflowVersion`. Running executions bind to a specific version and remain unaffected by subsequent workflow drafts.

## 4. Host Environment Audit & Fallbacks

- Host: Windows 10/11 x64, Node.js v24.19.0, npm 11.17.0, pnpm 12.16.1.
- Docker daemon is not running natively on this Windows workstation.
- Containerized configurations (`Dockerfile`, `docker-compose.yml`) are fully provided for standard containerized deployment.
- Local execution & test suites leverage Prisma with SQLite/PGlite or configurable PostgreSQL URL and simulated/in-memory queue fallbacks when external daemons are absent.
