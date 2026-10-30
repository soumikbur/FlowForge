# FlowForge Workflow Graph JSON Specification

## 1. Specification Overview

A workflow definition is represented as a directed acyclic graph (with controlled branch joins) adhering strictly to standard JSON schemas.

```json
{
  "id": "wf_12345",
  "name": "Order Processing & Approval",
  "description": "Validates orders, checks threshold, requests manager approval if > $10,000",
  "trigger": {
    "type": "WEBHOOK",
    "config": {
      "path": "/orders",
      "method": "POST"
    }
  },
  "nodes": [
    {
      "id": "node_trigger",
      "type": "TRIGGER",
      "name": "Order Webhook Trigger",
      "config": {
        "triggerType": "WEBHOOK"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "node_check_value",
      "type": "CONDITION",
      "name": "Check Order Value",
      "config": {
        "expression": "trigger.payload.orderValue > 10000"
      },
      "position": { "x": 100, "y": 250 }
    },
    {
      "id": "node_approval",
      "type": "APPROVAL",
      "name": "Manager Approval",
      "config": {
        "timeoutSeconds": 86400,
        "approverRole": "ADMIN",
        "description": "High value order approval needed"
      },
      "position": { "x": 300, "y": 400 }
    },
    {
      "id": "node_send_email",
      "type": "EMAIL",
      "name": "Notify Customer",
      "config": {
        "to": "trigger.payload.customerEmail",
        "subject": "Order Received",
        "template": "Your order #{{trigger.payload.orderId}} is being processed."
      },
      "position": { "x": -100, "y": 400 }
    },
    {
      "id": "node_end",
      "type": "END",
      "name": "Workflow Complete",
      "config": {},
      "position": { "x": 100, "y": 600 }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_trigger",
      "target": "node_check_value"
    },
    {
      "id": "edge_2_true",
      "source": "node_check_value",
      "sourceHandle": "true",
      "target": "node_approval"
    },
    {
      "id": "edge_2_false",
      "source": "node_check_value",
      "sourceHandle": "false",
      "target": "node_send_email"
    },
    {
      "id": "edge_3",
      "source": "node_approval",
      "target": "node_end"
    },
    {
      "id": "edge_4",
      "source": "node_send_email",
      "target": "node_end"
    }
  ]
}
```

## 2. Supported Node Types & Semantics

| Node Type      | Category          | Required Inputs                                           | Outgoing Handles                  | Execution Behavior                                           |
| -------------- | ----------------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `TRIGGER`      | Trigger           | Trigger configuration (webhook, manual, schedule)         | `default`                         | Emits trigger payload into execution context                 |
| `CONDITION`    | Logic             | JavaScript/JSON expression (e.g., `data.amount > 500`)    | `true`, `false`                   | Evaluates condition and directs flow to corresponding handle |
| `HTTP_REQUEST` | Action            | URL, method (GET/POST/PUT/DELETE), headers, body, timeout | `default`, `error`                | Dispatches outbound HTTP request with SSRF guard             |
| `EMAIL`        | Action            | To, subject, template body                                | `default`, `error`                | Transmits templated email notification                       |
| `APPROVAL`     | Human-in-the-loop | Approver role/user, title, timeout                        | `approved`, `rejected`, `timeout` | Suspends execution in `WAITING_APPROVAL` until actor decides |
| `DELAY`        | Logic             | Duration (seconds/minutes)                                | `default`                         | Suspends execution in `WAITING_DELAY` until timer expires    |
| `END`          | Terminal          | Optional summary / return payload                         | None                              | Concludes execution path successfully                        |

## 3. Graph Validation Rules

1. Must contain exactly one `TRIGGER` node with no incoming edges.
2. Every node must be reachable from the `TRIGGER` node.
3. Every directed path from `TRIGGER` must terminate at an `END` node or dead-end leaf explicitly permitted.
4. Cycles are prohibited unless specifically tagged with bounded iteration counters.
5. All edge `source` and `target` references must correspond to existing node IDs.
6. Conditional nodes must have edges emanating from both `true` and `false` handles (or explicitly handled default fallbacks).


## 4. Execution Planning & Branch Semantics

The standalone workflow engine builds a deterministic `WorkflowExecutionPlan` prior to execution runtime:
- **Topological Ordering**: Deterministic sequence derived via in-degree analysis with alphabetical node ID tie-breaking.
- **Branch Independence**: Mutually exclusive conditional branches (e.g., `true` vs `false`) are preserved as separate `ExecutionPath`s. Topological analysis never causes parallel or mutually exclusive branches to execute sequentially.
- **Handle Routing**: At runtime, step handlers select the active outgoing handle (e.g., `selectedHandle: 'true'` or `'false'`). Only edges matching the selected handle advance execution.

## 5. Engine Safety & Resource Limits

| Limit | Maximum Bound | Purpose |
| :--- | :--- | :--- |
| `MAX_NODES` | 500 nodes | Prevents memory exhaustion on graph traversal |
| `MAX_EDGES` | 1,000 edges | Bounds adjacency matrix and cycle analysis |
| `MAX_EXPRESSION_LENGTH` | 1,000 characters | Prevents regex and parser denial of service |
| `MAX_PATH_DEPTH` | 10 levels | Prevents prototype traversal and stack exhaustion |
| `MAX_DIAGNOSTICS` | 100 diagnostics | Caps error payload sizes emitted across APIs |
