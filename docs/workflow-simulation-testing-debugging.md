# FlowForge Workflow Simulation, Test Automation, and Stepwise Debugging

## 1. Executive Summary

FlowForge provides a multi-tenant, enterprise-grade workflow testing and safe simulation framework that empowers developers and business operations teams to validate workflow logic, test integrations safely, debug edge cases, detect regressions, and enforce pre-release quality gates without production side-effects.

---

## 2. Core Architectural Pillars

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Workflow Testing Framework                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Static Validation  │ Validates graph topology, node schemas & limits│
│ 2. Pure Simulation    │ Synthetic data traversal, deterministic branch │
│ 3. Mocked Integration │ Test fixtures & doubles for HTTP, email, etc.  │
│ 4. Isolated Sandbox   │ Authorized non-production sandbox execution    │
├────────────────────────────────────────────────────────────────────────┤
│                       Execution & Safety Controls                      │
├────────────────────────────────────────────────────────────────────────┤
│ • Zero Network Access during Simulation & Mocked testing               │
│ • Automatic Secret & Token Redaction in payloads ([REDACTED])          │
│ • Stepwise Interactive Debugging with 15-minute TTL sessions           │
│ • Deterministic Regression Diffs across workflow versions              │
│ • Pre-Release Publishing Gates blocking unvalidated deployments        │
└────────────────────────────────────────────────────────────────────────┘
```

### Testing Modes

1. **`STATIC_VALIDATION`**:
   - Performs complete graph topology, schema, cycle, and limit validation without initiating node execution.
   - Halts immediately with zero runtime side effects.
2. **`SIMULATION`** (Default):
   - Deterministically traverses the workflow graph using synthetic inputs.
   - Evaluates conditional branches, loops, and variable interpolations without external network calls, email dispatches, or outbox domain event publications.
   - Replaces external connectors with deterministic synthetic doubles.
3. **`MOCKED_INTEGRATION`**:
   - Replaces external dependencies with configurable `TestFixture` records or inline response doubles.
   - Matches fixtures by connector type, operation, URL substring, or status code.
4. **`ISOLATED_REAL_INTEGRATION`**:
   - Governed non-production execution against external sandboxes.
   - Protected by role escalation guards: strictly requires both `authorizedForRealIntegration: true` and `OWNER` or `ADMIN` role privileges.

---

## 3. Test Cases & Assertions

Automated test cases are stored per-workflow with configurable inputs and assertion rules:

| Assertion Type          | Evaluation Logic                                                           | Target          |
| :---------------------- | :------------------------------------------------------------------------- | :-------------- |
| `NODE_EXECUTED`         | Asserts that a specific node was executed in the traversal path            | `nodeId`        |
| `NODE_SKIPPED`          | Asserts that a node was unreachable or skipped by conditional branching    | `nodeId`        |
| `BRANCH_TAKEN`          | Verifies that a condition node took the expected handle (`true`/`false`)   | `nodeId`        |
| `OUTPUT_EQUALS`         | Asserts that a resolved JSON path in the output matches the expected value | `path`          |
| `OUTPUT_MATCHES_SCHEMA` | Validates output payload against a JSON schema                             | `schema`        |
| `ERROR_RAISED`          | Asserts that a step failed or raised an expected error code                | `nodeId`        |
| `CONNECTOR_CALLED`      | Asserts that a mocked connector double was invoked                         | `connectorType` |
| `BUDGET_RESPECTED`      | Asserts total duration and step count remain within defined quotas         | Max limit       |
| `POLICY_BLOCKED`        | Asserts that a governance policy prevented an operation                    | Policy ID       |
| `APPROVAL_REQUESTED`    | Asserts that a workflow reached a human approval checkpoint                | `nodeId`        |

---

## 4. Stepwise Debugging & Breakpoints

Interactive debugging enables pinpoint root-cause analysis:

- **Session Lifecycle**: Created with `POST /api/v1/workflows/:id/debug/session` with an automatic 15-minute TTL to prevent zombie resource leaks.
- **Breakpoints**: Execution automatically pauses when entering any node listed in `breakpoints: string[]`.
- **Single-Stepping**: `POST /api/v1/workflows/:id/debug/session/:sessionId/step` advances execution by one node, updating `currentStepIndex` and returning the node result.
- **Resumption**: `POST /api/v1/workflows/:id/debug/session/:sessionId/resume` runs remaining nodes to completion or the next breakpoint.
- **Cancellation**: `DELETE /api/v1/workflows/:id/debug/session/:sessionId` clears memory state immediately.

---

## 5. Regression Detection & Version Comparison

The regression comparison engine executes identical synthetic inputs against both the working draft and an immutable historical version (or two published versions):

- **Path Comparison**: Computes `basePath`, `targetPath`, `common`, `baseOnly`, and `targetOnly` node sequences.
- **Output Divergence**: Diffs node outputs across common nodes.
- **Regression Detection**: Flags unexpected branch divergence, new failure codes, or removed capabilities (`hasRegressions: boolean`).

---

## 6. Pre-Release Publishing Gates

Organizations enforce publishing quality standards via `PublishingGateConfig`:

- **Static Validation**: Rejects publication if graph validation fails.
- **Test Suite Pass Requirement**: Rejects publication if any test case in the workflow suite fails or if pass rate is below threshold.
- **Regression Check**: Rejects publication if breaking path deviations or removed nodes are detected.
- **Policy Check**: Evaluates organizational policy-as-code before release.
- **Bypass**: Administrators can supply `force: true` to override non-critical gates during emergency incidents.

---

## 7. REST API Endpoints

### Workflow Simulation & Testing

| Method   | Endpoint                                         | Permission          | Description                                    |
| :------- | :----------------------------------------------- | :------------------ | :--------------------------------------------- |
| `POST`   | `/api/v1/workflows/:id/simulate`                 | `workflow:simulate` | Executes deterministic workflow simulation     |
| `POST`   | `/api/v1/workflows/:id/tests`                    | `workflow:test`     | Creates a reusable workflow test case          |
| `GET`    | `/api/v1/workflows/:id/tests`                    | `workflow:read`     | Lists all test cases for workflow              |
| `GET`    | `/api/v1/workflows/:id/tests/:testId`            | `workflow:read`     | Retrieves details of a specific test case      |
| `PATCH`  | `/api/v1/workflows/:id/tests/:testId`            | `workflow:test`     | Updates test case configuration                |
| `DELETE` | `/api/v1/workflows/:id/tests/:testId`            | `workflow:test`     | Deletes a workflow test case                   |
| `POST`   | `/api/v1/workflows/:id/tests/:testId/run`        | `workflow:test`     | Executes a single test case with assertions    |
| `POST`   | `/api/v1/workflows/:id/tests/run-all`            | `workflow:test`     | Executes full test suite for workflow          |
| `POST`   | `/api/v1/workflows/:id/compare`                  | `workflow:test`     | Compares execution paths across versions       |
| `POST`   | `/api/v1/workflows/:id/debug/session`            | `workflow:simulate` | Initializes stepwise debugging session         |
| `POST`   | `/api/v1/workflows/:id/debug/session/:id/step`   | `workflow:simulate` | Steps execution forward by one node            |
| `POST`   | `/api/v1/workflows/:id/debug/session/:id/resume` | `workflow:simulate` | Resumes debug execution to completion          |
| `DELETE` | `/api/v1/workflows/:id/debug/session/:id`        | `workflow:simulate` | Cancels active debug session                   |
| `GET`    | `/api/v1/workflows/:id/gate-status`              | `workflow:read`     | Evaluates current pre-release publishing gates |
| `GET`    | `/api/v1/workflows/:id/gate-config`              | `workflow:read`     | Retrieves publishing gate configuration        |
| `PUT`    | `/api/v1/workflows/:id/gate-config`              | `workflow:write`    | Updates publishing gate policies               |

### Global Testing & Fixtures

| Method   | Endpoint                             | Permission      | Description                                         |
| :------- | :----------------------------------- | :-------------- | :-------------------------------------------------- |
| `POST`   | `/api/v1/testing/fixtures`           | `workflow:test` | Creates reusable integration test fixture           |
| `GET`    | `/api/v1/testing/fixtures`           | `workflow:read` | Lists tenant test fixtures                          |
| `DELETE` | `/api/v1/testing/fixtures/:id`       | `workflow:test` | Deletes test fixture                                |
| `POST`   | `/api/v1/testing/contracts/validate` | `workflow:test` | Validates connector payloads without external calls |

---

## 8. Frontend Lab UI

Accessible at `/workflows/:id/test`:

- **Simulation Runner**: Synthetic JSON payload editor, mode selector, execution trace, and node inspector with sensitive credential badge indicator.
- **Interactive Debugger**: Breakpoint indicators, Step Next, Resume, and Cancel controls with step counter.
- **Test Suite Manager**: Test case cards, assertion pass/fail checklist with expected vs. actual diffs, and Run All button.
- **Regression Explorer**: Side-by-side branch comparison and regression alert badge.
- **Publishing Gate Checklist**: Real-time pass/fail indicators for static graph validation, test suite, regression drift, and policy compliance.
