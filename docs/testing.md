# FlowForge Testing & Quality Strategy

## 1. Testing Pyramid & Tooling

- **Unit & Graph Engine Tests**: `vitest` for fast isolated execution of graph algorithms, condition evaluation, state transitions, schema validations, and database invariants.
- **Shared Contracts Tests** (`tests/unit/shared-contracts.test.ts`): Asserts valid/invalid workflow graphs, node types, missing IDs, malformed edges, invalid execution states, and error envelopes.
- **Database Invariant Tests** (`tests/unit/database-entities.test.ts`): Validates user creation, email uniqueness/normalization, organization slug uniqueness, membership compound uniqueness, workflow draft persistence, version uniqueness, immutable execution binding, tenant isolation, and non-cascade deletion invariants.
- **Infrastructure Tests** (`tests/unit/infrastructure.test.ts`): Asserts environment-variable validation with Zod, process liveness (`/health`), dependency readiness (`/ready`), correlation ID injection (`X-Correlation-Id`), and 404 error envelope consistency.
- **API Integration Tests** (`tests/integration/`): Tests session authentication, registration, login rejection, workflow draft updates, publishing immutable versions, manual and webhook execution triggers, and human approval suspension and resumption.
- **Security Tests** (`tests/security/tenant-isolation.test.ts`): Automated attack suite verifying multi-tenant isolation, cross-tenant leak/mutation rejection, SSRF blocking of private subnets and cloud metadata IPs, and webhook signature verification.

## 2. Test Execution Commands

```bash
# Run all tests
pnpm test

# Run unit and contract tests
pnpm test:unit

# Run API and workflow integration tests
pnpm test:integration

# Run security and tenant isolation tests
pnpm test:security

# Run code formatting check
pnpm format

# Run ESLint validation
pnpm lint

# Run strict TypeScript checks across all workspaces
pnpm typecheck
```

## 3. Workflow Engine Unit & Graph Tests

Workflow engine validation and deterministic execution planning are tested via:

```bash
# Run all workflow-engine package unit tests
pnpm --filter @flowforge/workflow-engine test
```

Key suites:

- `packages/workflow-engine/test/workflow-engine.test.ts`: Graph validation, cycle detection, expression evaluation, template interpolation, state machine transitions, and next-node resolution.
- `packages/workflow-engine/test/workflow-engine-phase4.test.ts`: Resource limits, self-connection blocking, terminal outgoing edge rejection, missing terminal paths, unary/binary condition evaluation (`EXISTS`, `IS_EMPTY`, `CONTAINS`), prototype pollution protection, and deterministic execution plan generation.
