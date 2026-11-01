# AI Workflow Copilot, Intelligent Automation, and Governed AI Execution

## 1. Overview & Architectural Principles

FlowForge integrates an enterprise-grade AI capability layer that assists teams in designing workflows, analyzing execution failures, editing workflows conversationally, and safely formulating expression logic.

The AI Copilot operates under strict zero-trust governance principles:

1. **Never Auto-Publish or Auto-Execute**: Every generated workflow graph is flagged as `isUntrustedDraft: true`. AI cannot publish a live workflow version or initiate production executions directly.
2. **Canonical Engine Validation**: All AI-generated or modified workflows pass through the canonical `validateWorkflowDefinition()` engine before being returned to the user or saved. Invalid graphs are rejected with granular diagnostics.
3. **Structured Visual Diffs & Stale-Draft Detection**: AI-assisted modifications compute deep graph diffs using `compareWorkflowDefinitions()`, allowing users to review changes (added/removed/modified nodes and edges) and preventing concurrent edit collisions via base content hash verification.
4. **Read-Only Failure Analysis**: Execution failure root cause analysis is strictly read-only. It inspects execution records and step logs without mutating execution status, triggering retries, or modifying production state.
5. **Prompt Injection & Code Execution Defense**: Inputs are bounded (maximum 2,000 characters), sanitized, scanned for prompt injection heuristics, and stripped of sensitive authentication tokens. Expression assistance enforces safe condition syntax and strictly forbids arbitrary code execution primitives (`eval`, `process`, `require`, `Function`).
6. **Usage Metering & Monthly Token Quota Enforcement**: AI requests (`AI_REQUEST`) and token consumption (`AI_TOKEN`) are tracked within the organization's billing period. Monthly token budgets prevent unexpected cost overruns.
7. **Tamper-Evident Audit Logging**: All AI operations (`ai.config.updated`, `ai.workflow.generated`, `ai.workflow.edited`, `ai.workflow.explained`, `ai.failure.analyzed`, `ai.expression.assisted`) are recorded with SHA-256 hash chaining.

---

## 2. Architecture & Service Boundaries

```
┌────────────────────────────────────────────────────────┐
│                   FlowForge Client                     │
└───────────────────────────┬────────────────────────────┘
                            │ REST API (Bearer / Session)
                            ▼
┌────────────────────────────────────────────────────────┐
│             apps/api (Express Router)                  │
│       /api/v1/organizations/:organizationId/ai         │
│   • requireAuth • RBAC (ai:read / ai:generate / ai:admin)│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                      AiService                         │
│   • Prompt Injection & Secret Redaction Filters        │
│   • Monthly Token Budget Checker (UsageRecord)         │
│   • Stale-Draft Base Hash Validator                    │
│   • Entitlement & Usage Recorder                       │
│   • Tamper-Evident Audit Logger                        │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     AIProvider Interface  │ │    Workflow Engine        │
│ • MockAIProvider          │ │ • validateWorkflowDef()   │
│ • (OpenAI / Gemini / Anth)│ │ • compareWorkflowDef()    │
│                           │ │ • evaluateCondition()     │
│                           │ │ • computeContentHash()    │
└───────────────────────────┘ └───────────────────────────┘
```

---

## 3. Supported AI Operations & Endpoints

| Method | Endpoint             | Required Permission | Description                                                    |
| ------ | -------------------- | ------------------- | -------------------------------------------------------------- |
| `GET`  | `/config`            | `ai:read`           | Retrieve organization AI settings (API key redacted)           |
| `PUT`  | `/config`            | `ai:admin`          | Update provider, model, token budget, and allowed roles        |
| `POST` | `/test`              | `ai:admin`          | Test provider connectivity and measure round-trip latency      |
| `POST` | `/generate-workflow` | `ai:generate`       | Generate draft workflow from natural-language instructions     |
| `POST` | `/edit-workflow`     | `ai:generate`       | Apply conversational modifications to existing workflow draft  |
| `POST` | `/explain-workflow`  | `ai:read`           | Structural breakdown of triggers, branches, and security risks |
| `POST` | `/analyze-failure`   | `ai:read`           | Read-only root cause failure analysis of execution runs        |
| `POST` | `/assist-expression` | `ai:read`           | Formulate and validate safe condition expressions              |

---

## 4. Credential Governance & Provider Abstraction

Organization AI configurations are stored in the `ai_configurations` database table with the following defaults:

- `provider`: `"MOCK"` (supports `"OPENAI"`, `"GEMINI"`, `"ANTHROPIC"`, `"CUSTOM"`)
- `model`: `"flowforge-copilot-v1"`
- `temperature`: `0.7` (bounded between 0.0 and 2.0)
- `maxTokens`: `2048` (bounded between 100 and 16,384)
- `timeoutSeconds`: `30` (bounded between 1 and 120 seconds)
- `monthlyTokenBudget`: `500,000` tokens per billing cycle
- `allowedRoles`: `["OWNER", "ADMIN", "MEMBER"]`

API keys are encrypted and always redacted in API responses (e.g. `sk-****5678`).

---

## 5. Safety, Defenses & Prompt Injection Mitigations

1. **Length Validation**: Prompts must be between 5 and 2,000 characters.
2. **Pattern Scanning**: Prompts matching jailbreak heuristics (e.g. `ignore all previous instructions`, `system prompt override`, `act as system`) are rejected immediately with `400 PROMPT_INJECTION_DETECTED`.
3. **Secret Scrubbing**: Bearer tokens, private keys, and authorization headers are scrubbed from prompts before transmission to model providers.
4. **Code Execution Guardrails**: Expression assistance strictly rejects unsafe keywords (`eval`, `process`, `require`, `Function`, `global`, `window`).

---

## 6. Usage Metering & Quota Enforcement

Every AI operation records metrics against the organization's current billing cycle:

- `AI_REQUEST`: Incremented by 1 per completed interaction.
- `AI_TOKEN`: Incremented by model token usage.

When the cumulative monthly tokens reach the configured `monthlyTokenBudget`, subsequent generation requests are rejected with HTTP 429 `AI_BUDGET_EXCEEDED`, safeguarding against runaway cloud billing.

---

## 7. Known Limitations & Operational Considerations

1. **Provider Availability**: In offline or air-gapped environments, FlowForge defaults to `MockAIProvider`, which delivers deterministic template and graph generation. External providers require outbound network access to cloud endpoints.
2. **Non-Executable Drafts**: Copilot output must be reviewed, saved, and formally published via the workflow builder UI before execution.
