# FlowForge Testing & Quality Strategy

## 1. Testing Pyramid & Tools
- **Unit & Graph Engine Tests**: `vitest` for fast isolated execution of graph algorithms, condition evaluation, state transitions, and schema validations.
- **API Integration Tests**: `supertest` / `vitest` executing HTTP requests against Express routes with real database transactions and mock queues.
- **Worker & State Machine Tests**: Verification of step execution, retry exponential backoff, worker recovery, and approval resumption.
- **Security Tests**: Automated attack suite checking SSRF vectors, cross-tenant data leaks, expression injection, and unauthenticated access.
- **End-to-End (E2E) Tests**: `playwright` simulating browser actions for workflow visual editing, publish flows, approval decisions, and execution timelines.

## 2. Test Execution Commands
- Unit tests: `pnpm test:unit`
- Integration tests: `pnpm test:integration`
- Security tests: `pnpm test:security`
- E2E tests: `pnpm test:e2e`
- All tests: `pnpm test`
