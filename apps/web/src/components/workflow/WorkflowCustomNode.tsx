import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
  AlertCircle,
  Plug,
} from "lucide-react";
import { getNodeRegistryItem } from "../../lib/node-registry";
import { NodeType } from "@flowforge/shared";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
  Plug,
};

export const WorkflowCustomNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = (data.type || "END") as NodeType;
  const registryItem = getNodeRegistryItem(nodeType);
  const IconComponent = ICON_MAP[registryItem.icon] || Flag;
  const hasError = Boolean(data.error);

  return (
    <div
      className={`min-w-[220px] max-w-[280px] bg-white rounded-lg border-2 shadow-sm transition-all duration-150 ${
        selected
          ? "border-teal-500 ring-2 ring-teal-500/30 shadow-md"
          : hasError
            ? "border-red-400 shadow-red-100"
            : registryItem.colors.border
      }`}
    >
      {/* Top Input Handle */}
      {registryItem.hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-slate-400 hover:!bg-teal-500 border-2 !border-white transition-colors"
        />
      )}

      {/* Card Header */}
      <div className={`px-3 py-2 border-b flex items-center justify-between ${registryItem.colors.bg}`}>
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-white shadow-xs">
            <IconComponent className={`w-3.5 h-3.5 ${registryItem.colors.text}`} />
          </div>
          <span className="text-xs font-bold tracking-tight text-slate-800 truncate max-w-[140px]">
            {data.name || registryItem.label}
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${registryItem.colors.badge}`}>
          {registryItem.category}
        </span>
      </div>

      {/* Card Body / Config Preview */}
      <div className="p-2.5 text-xs text-slate-600 space-y-1">
        {nodeType === "TRIGGER" && (
          <p className="font-mono text-[11px] text-emerald-700 truncate">
            Type: {data.config?.triggerType || "MANUAL"}
          </p>
        )}
        {nodeType === "CONDITION" && (
          <p className="font-mono text-[11px] text-amber-700 truncate">
            if: {data.config?.expression || "true"}
          </p>
        )}
        {nodeType === "HTTP_REQUEST" && (
          <p className="font-mono text-[11px] text-sky-700 truncate">
            {data.config?.method || "GET"} {data.config?.url || "https://..."}
          </p>
        )}
        {nodeType === "EMAIL" && (
          <p className="text-[11px] text-purple-700 truncate">
            To: {data.config?.to || "unassigned"}
          </p>
        )}
        {nodeType === "APPROVAL" && (
          <p className="text-[11px] text-indigo-700 truncate">
            Role: {data.config?.requiredRole || "ADMIN"}
          </p>
        )}
        {nodeType === "DELAY" && (
          <p className="text-[11px] text-orange-700 truncate">
            Wait: {data.config?.durationSeconds || 60}s
          </p>
        )}
        {nodeType === "END" && (
          <p className="text-[11px] text-slate-500 italic">
            Terminal leaf node
          </p>
        )}

        {hasError && (
          <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium pt-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">{data.error}</span>
          </div>
        )}
      </div>

      {/* Output Handles */}
      {nodeType === "CONDITION" ? (
        <div className="flex justify-between px-4 pb-1 pt-0 text-[10px] font-bold">
          <div className="relative">
            <span className="text-emerald-600">True</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              className="!w-3 !h-3 !bg-emerald-500 border-2 !border-white hover:!bg-emerald-600"
            />
          </div>
          <div className="relative">
            <span className="text-amber-600">False</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="!w-3 !h-3 !bg-amber-500 border-2 !border-white hover:!bg-amber-600"
            />
          </div>
        </div>
      ) : (
        registryItem.outputs.length > 0 && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !bg-slate-400 hover:!bg-teal-500 border-2 !border-white transition-colors"
          />
        )
      )}
    </div>
  );
});

WorkflowCustomNode.displayName = "WorkflowCustomNode";

