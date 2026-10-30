import React from "react";
import { Node } from "reactflow";
import {
  X,
  Trash2,
  Settings,
  AlertCircle,
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
} from "lucide-react";
import { getNodeRegistryItem } from "../../lib/node-registry";
import { NodeType, Role } from "@flowforge/shared";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
};

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (id: string, name: string, config: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
  nodeErrors?: string[];
  readOnly?: boolean;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onClose,
  nodeErrors = [],
  readOnly = false,
}) => {
  if (!selectedNode) return null;

  const nodeType = (selectedNode.data?.type || "END") as NodeType;
  const registryItem = getNodeRegistryItem(nodeType);
  const Icon = ICON_MAP[registryItem.icon] || Flag;

  const currentName = selectedNode.data?.name || registryItem.label;
  const currentConfig = selectedNode.data?.config || {};

  const handleNameChange = (name: string) => {
    onUpdateNode(selectedNode.id, name, currentConfig);
  };

  const handleConfigChange = (key: string, value: unknown) => {
    const updated = { ...currentConfig, [key]: value };
    onUpdateNode(selectedNode.id, currentName, updated);
  };

  return (
    <div className="w-88 bg-white border-l border-slate-200 flex flex-col h-full shadow-lg z-20 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-white shadow-xs border border-slate-200">
            <Icon className={`w-4 h-4 ${registryItem.colors.text}`} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-900">Configure Node</h2>
            <p className="text-[10px] text-slate-500 font-mono">{selectedNode.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              onClick={() => onDeleteNode(selectedNode.id)}
              title="Delete Node"
              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close Panel"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Validation Errors for Node */}
      {nodeErrors.length > 0 && (
        <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>Node Configuration Issues</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
            {nodeErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Body Form Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Node Name */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Display Label
          </label>
          <input
            type="text"
            value={currentName}
            disabled={readOnly}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
          />
        </div>

        {/* TRIGGER Config */}
        {nodeType === "TRIGGER" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Trigger Type
              </label>
              <select
                value={currentConfig.triggerType || "MANUAL"}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("triggerType", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              >
                <option value="MANUAL">Manual Execution</option>
                <option value="WEBHOOK">Inbound Webhook</option>
                <option value="SCHEDULE">Cron Schedule</option>
              </select>
            </div>

            {currentConfig.triggerType === "WEBHOOK" && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Webhook Path
                </label>
                <input
                  type="text"
                  placeholder="/orders"
                  value={currentConfig.webhookPath || ""}
                  disabled={readOnly}
                  onChange={(e) => handleConfigChange("webhookPath", e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Webhook path invoked via POST /api/v1/webhooks/:workflowId. Inbound payloads are verified server-side.
                </p>
              </div>
            )}

            {currentConfig.triggerType === "SCHEDULE" && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  placeholder="0 9 * * 1-5"
                  value={currentConfig.cronExpression || ""}
                  disabled={readOnly}
                  onChange={(e) => handleConfigChange("cronExpression", e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Standard 5-part cron syntax (e.g. daily at 9am: 0 9 * * *).
                </p>
              </div>
            )}
          </div>
        )}

        {/* CONDITION Config */}
        {nodeType === "CONDITION" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Condition Expression
              </label>
              <textarea
                rows={3}
                placeholder="trigger.payload.orderValue > 10000"
                value={currentConfig.expression || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("expression", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Javascript/boolean expression evaluated against context data. Connect True and False output handles.
              </p>
            </div>
          </div>
        )}

        {/* HTTP_REQUEST Config */}
        {nodeType === "HTTP_REQUEST" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Method
                </label>
                <select
                  value={currentConfig.method || "GET"}
                  disabled={readOnly}
                  onChange={(e) => handleConfigChange("method", e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-semibold text-xs"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  value={currentConfig.timeoutMs ?? 10000}
                  disabled={readOnly}
                  onChange={(e) => handleConfigChange("timeoutMs", Number(e.target.value))}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                URL Endpoint
              </label>
              <input
                type="url"
                placeholder="https://api.service.com/webhook"
                value={currentConfig.url || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("url", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                Protected against SSRF. Private/loopback IPs are blocked server-side.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Request Body (JSON)
              </label>
              <textarea
                rows={3}
                placeholder='{"orderId": "{{trigger.payload.id}}"}'
                value={currentConfig.body || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("body", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
              />
            </div>
          </div>
        )}

        {/* EMAIL Config */}
        {nodeType === "EMAIL" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Recipient (To)
              </label>
              <input
                type="text"
                placeholder="customer@example.com"
                value={currentConfig.to || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("to", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                placeholder="Order Confirmation: {{trigger.payload.orderId}}"
                value={currentConfig.subject || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("subject", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Template Body
              </label>
              <textarea
                rows={4}
                placeholder="Hello {{trigger.payload.customerName}},\n\nYour order has been received."
                value={currentConfig.template || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("template", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
              />
            </div>
          </div>
        )}

        {/* APPROVAL Config */}
        {nodeType === "APPROVAL" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Approval Title
              </label>
              <input
                type="text"
                placeholder="Manager Approval for High-Value Order"
                value={currentConfig.title || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("title", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Required Role
              </label>
              <select
                value={currentConfig.requiredRole || "ADMIN"}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("requiredRole", e.target.value as Role)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-semibold"
              >
                <option value="MEMBER">Member or higher</option>
                <option value="ADMIN">Admin or higher</option>
                <option value="OWNER">Owner only</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={currentConfig.timeoutSeconds ?? 86400}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("timeoutSeconds", Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                Default: 86400s (24h). Pauses execution until an authorized user acts.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Instructions / Description
              </label>
              <textarea
                rows={2}
                placeholder="Verify customer line items and confirm budget approval."
                value={currentConfig.description || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("description", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
            </div>
          </div>
        )}

        {/* DELAY Config */}
        {nodeType === "DELAY" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Duration (Seconds)
              </label>
              <input
                type="number"
                value={currentConfig.durationSeconds ?? 60}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("durationSeconds", Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Durable timer handled by background BullMQ queue.
              </p>
            </div>
          </div>
        )}

        {/* END Config */}
        {nodeType === "END" && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Summary Expression (Optional)
              </label>
              <input
                type="text"
                placeholder="'Workflow completed for ' + trigger.payload.orderId"
                value={currentConfig.summaryExpression || ""}
                disabled={readOnly}
                onChange={(e) => handleConfigChange("summaryExpression", e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Terminal node. Cannot have outgoing connections.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

