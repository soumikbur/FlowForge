# Business Process Intelligence, Workflow Optimization, and Predictive Analytics

## 1. Overview & Principles

FlowForge's Business Process Intelligence (BPI) layer transforms raw workflow execution telemetry into verifiable operational insights, identifying bottlenecks, measuring business outcomes, detecting statistical anomalies, and generating actionable optimization guidance.

The intelligence engine operates under strict zero-trust operational principles:

1. **Evidence-Grounded Insights**: No synthetic or fabricated metrics. Every insight and recommendation links directly to verified execution records, step logs, and observed durations.
2. **Conservative Anomaly Gating**: Statistical anomaly detection requires a minimum of 10 historical executions ($\ge 10$ runs) to compute moving baselines and standard deviations ($\sigma$). Small sample sizes ($< 10$) report `INSUFFICIENT_DATA` rather than generating noisy false alarms.
3. **Advisory AI Guidance**: AI-assisted operational insights are flagged as `isAdvisory: true`. AI cannot auto-modify workflows, publish new versions, or trigger unapproved system changes.
4. **Tenant Isolation**: All metric queries, anomaly evaluations, and SLO tracking are strictly bounded by organization and workspace membership.
5. **CSV Formula-Injection Defense**: Exported reports neutralize spreadsheet calculation exploits by prefixing sensitive symbols (`=`, `+`, `-`, `@`, `\t`, `\r`) with a single quote.

---

## 2. Process KPI Definitions & Measurement Formulas

| Category        | Metric                  | Formula / Calculation                                                                                  | Source Events                         |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Reliability** | Success Rate            | $\frac{\text{SUCCEEDED}}{\text{Terminal Executions}} \times 100\%$                                     | `executions.status`                   |
| **Reliability** | Failure Rate            | $\frac{\text{FAILED}}{\text{Terminal Executions}} \times 100\%$                                        | `executions.status`                   |
| **Reliability** | Retry Rate              | $\frac{\text{Retried Executions}}{\text{Total Executions}} \times 100\%$                               | `executions.retryCount > 0`           |
| **Performance** | p50 / p95 / p99 Latency | Linear interpolation of sorted duration values                                                         | `completedAt - startedAt`             |
| **Performance** | Average Queue Wait      | $\frac{\sum (\text{startedAt} - \text{createdAt})}{\text{Count}}$                                      | `executions.startedAt`, `createdAt`   |
| **Performance** | Approval Wait Time      | $\frac{\sum (\text{decidedAt} - \text{createdAt})}{\text{Count}}$                                      | `approvals.decidedAt`, `createdAt`    |
| **Integration** | Connector Latency       | Average and p95 duration per external connector ID                                                     | `steps.completedAt - steps.startedAt` |
| **Business**    | SLA Attainment          | $\frac{\text{Count}(\text{actualTimeMs} \le \text{targetTimeMs})}{\text{Total Outcomes}} \times 100\%$ | `business_outcomes`                   |

---

## 3. Bottleneck Detection Rules & Severity Scoring

Process bottlenecks are evaluated across historical execution windows (default 7 days):

1. **Disproportionate Duration (`NODE_DURATION`)**:
   - _Rule_: Node accounts for $\ge 40\%$ of cumulative workflow execution time AND average duration $> 2,000$ms.
   - _Severity_: `CRITICAL` ($\ge 60\%$), `HIGH` ($\ge 50\%$), `MEDIUM` ($\ge 40\%$).
2. **High Failure Rate (`HIGH_FAILURE_RATE`)**:
   - _Rule_: Node failure rate $\ge 25\%$ across $\ge 3$ executions.
   - _Severity_: `CRITICAL` ($\ge 50\%$), `HIGH` ($\ge 25\%$).
3. **Retry Storms (`RETRY_STORM`)**:
   - _Rule_: Step retries exceed 1.5 retries per execution on average across $\ge 3$ runs.
   - _Severity_: `MEDIUM`.

---

## 4. Statistical Anomaly Detection Methodology

The anomaly detection engine compares observations from the last 24 hours against a historical 30-day baseline:

- **Duration Anomalies**: Flagged when current average duration exceeds the baseline mean by $2.5\sigma$ ($z$-score $\ge 2.5$).
- **Failure Spikes**: Flagged when recent failure rate exceeds 30% and is at least 20 percentage points above historical baseline.
- **Sample Size Gating**: Requires $\ge 8$ baseline executions and $\ge 2$ recent executions. If fewer than 10 total executions exist, detection is safely suppressed.

---

## 5. Workflow Version Comparison & Regression Analysis

The comparison endpoint (`POST /intelligence/compare`) evaluates Version A vs Version B:

- **Deltas Measured**: `successRateDelta` (percentage points), `durationDeltaMs`, `durationChangePercent`, `retryRateDelta`.
- **Regression Thresholds**:
  - Success rate drop $\ge 5\%$.
  - Duration increase $\ge 25\%$ (with delta $> 500$ms).
  - Retry frequency increase $\ge 15\%$.
- When triggered, outputs `isRegressed: true` with explanatory regression notes.

---

## 6. Service-Level Objectives (SLOs) & Error Budgets

Organizations configure workflow reliability and latency objectives:

- **Supported Targets**:
  - `SUCCESS_RATE` (e.g. 99.0% over 168h).
  - `DURATION_P95` (e.g. $\le 3,000$ms over 24h).
  - `QUEUE_WAIT_MAX` (e.g. $\le 1,000$ms).
  - `APPROVAL_WAIT_MAX` (e.g. $\le 86,400$s).
- **Error Budget Formula**:
  $$\text{Remaining Budget \%} = \max\left(0, \frac{\text{Allowed Failure Rate} - \text{Actual Failure Rate}}{\text{Allowed Failure Rate}} \times 100\right)$$
  When actual failure rate reaches or exceeds allowed failure rate, remaining error budget drops to 0% and status becomes `isCompliant: false`.

---

## 7. AI-Assisted Operational Insights & Optimization

- **Evidence Grounding**: Prompts supplied to the AI provider contain only verified telemetry summaries (7-day execution volumes, p95 durations, active bottlenecks, observed anomalies).
- **Advisory Status**: Every AI insight is marked `isAdvisory: true` and presents candidate optimization experiments rather than autonomous modifications.
- **Optimization Recommendations**: Structured recommendations include problem statement, measured evidence, proposed change, expected benefit, trade-offs, and `requiresApproval: true`.

---

## 8. REST API Reference

Mounted under `/api/v1/organizations/:organizationId/intelligence`:

| Method   | Endpoint           | Permission        | Description                                                  |
| -------- | ------------------ | ----------------- | ------------------------------------------------------------ |
| `GET`    | `/metrics`         | `analytics:read`  | Process KPIs, percentiles, queue wait, and connector metrics |
| `GET`    | `/bottlenecks`     | `analytics:read`  | Detected node duration and retry bottlenecks                 |
| `GET`    | `/anomalies`       | `analytics:read`  | Statistical anomalies with confidence ratings                |
| `POST`   | `/compare`         | `analytics:read`  | Compare two workflow versions or time windows                |
| `GET`    | `/outcomes`        | `analytics:read`  | Business outcome summaries and SLA attainment rates          |
| `POST`   | `/outcomes`        | `analytics:write` | Record a business outcome for an execution                   |
| `GET`    | `/slos`            | `analytics:read`  | List and evaluate workflow SLOs and error budgets            |
| `POST`   | `/slos`            | `analytics:write` | Create a new workflow SLO                                    |
| `PUT`    | `/slos/:id`        | `analytics:write` | Update an existing SLO                                       |
| `DELETE` | `/slos/:id`        | `analytics:write` | Delete an existing SLO                                       |
| `GET`    | `/recommendations` | `analytics:read`  | Actionable workflow optimization recommendations             |
| `POST`   | `/insights/ai`     | `analytics:read`  | Request AI-grounded operational insight                      |
| `GET`    | `/export`          | `analytics:read`  | Download intelligence report as CSV or JSON                  |
