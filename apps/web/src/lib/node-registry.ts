import { NodeType } from "@flowforge/shared";

export type NodeCategory = "Triggers" | "Logic" | "Actions" | "Control";

export interface NodeRegistryItem {
  type: NodeType;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
  hasInput: boolean;
  outputs: Array<{ id?: string; label?: string; isBranch?: boolean }>;
  isSupported: boolean;
  colors: {
    bg: string;
    border: string;
    text: string;
    badge: string;
  };
}

export const NODE_REGISTRY: Record<NodeType, NodeRegistryItem> = {
  TRIGGER: {
    type: "TRIGGER",
    label: "Trigger Event",
    category: "Triggers",
    description:
      "Initiates workflow execution upon manual, webhook, or scheduled events.",
    icon: "Zap",
    defaultConfig: {
      triggerType: "MANUAL",
    },
    hasInput: false,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-emerald-50",
      border: "border-emerald-500",
      text: "text-emerald-900",
      badge: "bg-emerald-100 text-emerald-800",
    },
  },
  CONDITION: {
    type: "CONDITION",
    label: "Condition Rule",
    category: "Logic",
    description:
      "Evaluates an expression and branches execution down True or False paths.",
    icon: "GitBranch",
    defaultConfig: {
      expression: "trigger.payload.amount > 1000",
    },
    hasInput: true,
    outputs: [
      { id: "true", label: "True", isBranch: true },
      { id: "false", label: "False", isBranch: true },
    ],
    isSupported: true,
    colors: {
      bg: "bg-amber-50",
      border: "border-amber-500",
      text: "text-amber-900",
      badge: "bg-amber-100 text-amber-800",
    },
  },
  HTTP_REQUEST: {
    type: "HTTP_REQUEST",
    label: "HTTP Request",
    category: "Actions",
    description:
      "Dispatches an external REST/HTTP request with SSRF guard protection.",
    icon: "Globe",
    defaultConfig: {
      method: "GET",
      url: "https://api.example.com/data",
      timeoutMs: 10000,
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-sky-50",
      border: "border-sky-500",
      text: "text-sky-900",
      badge: "bg-sky-100 text-sky-800",
    },
  },
  EMAIL: {
    type: "EMAIL",
    label: "Send Email",
    category: "Actions",
    description: "Dispatches an idempotent email notification to recipients.",
    icon: "Mail",
    defaultConfig: {
      to: "team@company.com",
      subject: "Workflow Alert: {{trigger.payload.orderId}}",
      template: "Hello, an automated order was processed successfully.",
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-purple-50",
      border: "border-purple-500",
      text: "text-purple-900",
      badge: "bg-purple-100 text-purple-800",
    },
  },
  APPROVAL: {
    type: "APPROVAL",
    label: "Human Approval",
    category: "Actions",
    description:
      "Suspends execution until an authorized human decides to Approve or Reject.",
    icon: "UserCheck",
    defaultConfig: {
      title: "Approval Required",
      description: "Please review and approve or reject this request.",
      requiredRole: "ADMIN",
      timeoutSeconds: 86400,
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-indigo-50",
      border: "border-indigo-500",
      text: "text-indigo-900",
      badge: "bg-indigo-100 text-indigo-800",
    },
  },
  DELAY: {
    type: "DELAY",
    label: "Delay Timer",
    category: "Logic",
    description: "Pauses workflow execution for a durable configured duration.",
    icon: "Hourglass",
    defaultConfig: {
      durationSeconds: 60,
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-orange-50",
      border: "border-orange-500",
      text: "text-orange-900",
      badge: "bg-orange-100 text-orange-800",
    },
  },
  END: {
    type: "END",
    label: "End Terminal",
    category: "Control",
    description:
      "Terminal node marking successful completion of an execution branch.",
    icon: "Flag",
    defaultConfig: {},
    hasInput: true,
    outputs: [],
    isSupported: true,
    colors: {
      bg: "bg-slate-50",
      border: "border-slate-500",
      text: "text-slate-900",
      badge: "bg-slate-200 text-slate-800",
    },
  },
  CONNECTOR_ACTION: {
    type: "CONNECTOR_ACTION",
    label: "Connector Action",
    category: "Actions",
    description:
      "Invokes an external connector operation (HTTP, Email, Slack) via secure connection.",
    icon: "Plug",
    defaultConfig: {
      connectorId: "http-api",
      operationId: "request",
      connectionId: "",
      parameters: {},
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-cyan-50",
      border: "border-cyan-500",
      text: "text-cyan-900",
      badge: "bg-cyan-100 text-cyan-800",
    },
  },
  EXTENSION_NODE: {
    type: "EXTENSION_NODE",
    label: "Custom Node",
    category: "Actions",
    description:
      "Executes a custom node from an installed and approved extension package.",
    icon: "Boxes",
    defaultConfig: {
      extensionId: "",
      nodeType: "",
      version: "1.0.0",
      parameters: {},
    },
    hasInput: true,
    outputs: [{ id: "output" }],
    isSupported: true,
    colors: {
      bg: "bg-indigo-50",
      border: "border-indigo-500",
      text: "text-indigo-900",
      badge: "bg-indigo-100 text-indigo-800",
    },
  },
};

export const PALETTE_CATEGORIES: NodeCategory[] = [
  "Triggers",
  "Logic",
  "Actions",
  "Control",
];

export function getNodeRegistryItem(type: NodeType): NodeRegistryItem {
  return NODE_REGISTRY[type] || NODE_REGISTRY.END;
}
