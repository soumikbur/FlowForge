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


## 5. Workflow Engine Package Boundaries

`packages/workflow-engine` serves as the standalone core of FlowForge:
- **Zero Framework Coupling**: Operates independently of Next.js, Express, PostgreSQL, and BullMQ.
- **Pure Functional Core**: Graph validation (`validateWorkflowDefinition`), cycle detection (DFS with recursion stack), topological sorting (Kahn's algorithm with deterministic tie-breaking), and condition evaluation operate on pure in-memory data structures without network or database I/O.
- **Node Registry & Handler Contracts**: Defines strongly-typed handler interfaces (`NodeHandler`, `ExecutionContext`, `StepExecutionResult`) and metadata registries used by the API for validation and by the worker for step execution.

## 6. Workflow Lifecycle, Versioning & Multi-Environment Promotion Architecture

```mermaid
flowchart LR
    Draft[Draft Workflow Definition] -->|Graph Validation & Hashing| Publish[Publish Version]
    Publish -->|Auto-deploy| DevEnv[(Development)]
    DevEnv -->|Promote with Idempotency Guard| StagingEnv[(Staging)]
    StagingEnv -->|Elevated RBAC Promotion: Admin/Owner| ProdEnv[(Production)]
    ProdEnv -->|Emergency Rollback| PrevVer[Previous Version Restored]
    
    subgraph Trigger Resolution
        Webhooks[Inbound Webhooks] -->|Resolves Active Version| ProdEnv
        Schedules[Cron Schedules] -->|Resolves Active Version| ProdEnv
        Manual[Manual Builder Trigger] -->|Resolves Active Version| DevEnv
    end
```

### 6.1 Canonical Content Hashing
To guarantee reproducible identity and detect true semantic modifications without false positives caused by UI canvas layout changes:
- `canonicalizeWorkflowDefinition`: Normalizes node orders by identifier, filters out transient UI layout coordinates (`position`), sorts node configuration keys alphabetically, and standardizes edge fields (`id`, `source`, `target`, `sourceHandle`, `targetHandle`).
- `computeWorkflowContentHash`: Produces a deterministic `SHA-256` hexadecimal digest of the canonical string representation.
- Prevents duplicate publishing when draft contents have not semantically changed (`409 UNCHANGED_CONTENT`).
- Re-verifies content integrity prior to environment promotion (`422 HASH_VERIFICATION_FAILED`).

### 6.2 Immutable Version Guarantee
- Published `WorkflowVersion` entities are strictly append-only.
- Direct mutations (`PUT`, `PATCH`, `DELETE`) on published versions are unconditionally rejected (`405 VERSION_IMMUTABLE`).
- Draft rollbacks / historical version restorations operate by copying the historical snapshot into the draft workspace (`draftRevision = currentRevision + 1`), preserving complete audit trails.

### 6.3 Multi-Environment Promotion & Rollback Mechanics
- Environments supported: `development`, `staging`, `production`.
- Deployments tracked via `WorkflowDeployment` with statuses `ACTIVE`, `SUPERSEDED`, and `ROLLED_BACK`.
- **Production Safeguards**: Non-admin members (`MEMBER`) are restricted from deploying or rolling back production (`403 PRODUCTION_DEPLOY_UNAUTHORIZED`); `ADMIN` and `OWNER` privileges are enforced.
- **Rollback Guarantee**: Restores traffic to a prior immutable version without deleting deployment logs or altering in-flight workflow executions. Running executions remain bound to the version snapshot recorded at trigger acceptance time.
