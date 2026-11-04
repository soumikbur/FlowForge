import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Info,
} from "lucide-react";

export type BadgeStatus =
  | "COMPLETED"
  | "ACTIVE"
  | "SUCCEEDED"
  | "APPROVED"
  | "IN_PROGRESS"
  | "RUNNING"
  | "PROCESSING"
  | "PENDING"
  | "WAITING"
  | "WAITING_APPROVAL"
  | "OVERDUE"
  | "FAILED"
  | "REJECTED"
  | "ERROR"
  | "CANCELLED"
  | "DRAFT"
  | "INFO"
  | "NEUTRAL";

interface BadgeProps {
  status: BadgeStatus | string;
  label?: string;
  showIcon?: boolean;
  showDot?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function Badge({
  status,
  label,
  showIcon = true,
  showDot = false,
  size = "md",
  className = "",
}: BadgeProps) {
  const normalized = status.toUpperCase().replace(/\s+/g, "_");

  let colorClasses =
    "bg-surface-secondary text-text-secondary border-border-default";
  let dotColor = "bg-text-muted";
  let IconComponent: React.ComponentType<{ className?: string }> = Info;

  switch (normalized) {
    case "COMPLETED":
    case "ACTIVE":
    case "SUCCEEDED":
    case "APPROVED":
    case "HEALTHY":
      colorClasses = "bg-[#20B779]/10 text-[#20B779] border-[#20B779]/30";
      dotColor = "bg-[#20B779]";
      IconComponent = CheckCircle2;
      break;

    case "OVERDUE":
    case "FAILED":
    case "REJECTED":
    case "ERROR":
    case "CRITICAL":
      colorClasses = "bg-[#EB5757]/10 text-[#EB5757] border-[#EB5757]/30";
      dotColor = "bg-[#EB5757]";
      IconComponent = XCircle;
      break;

    case "IN_PROGRESS":
    case "RUNNING":
    case "PROCESSING":
    case "RETRYING":
      colorClasses = "bg-[#F3A72F]/10 text-[#F3A72F] border-[#F3A72F]/30";
      dotColor = "bg-[#F3A72F]";
      IconComponent = RefreshCw;
      break;

    case "PENDING":
    case "WAITING":
    case "WAITING_APPROVAL":
    case "WARNING":
      colorClasses =
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      dotColor = "bg-amber-500";
      IconComponent = Clock;
      break;

    case "DRAFT":
    case "NEUTRAL":
    case "INFO":
    default:
      colorClasses =
        "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
      dotColor = "bg-[#6738E8]";
      IconComponent = Info;
      break;
  }

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2 py-0.5 text-[11px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-1.5 font-medium",
  };

  const displayLabel = label || status.replace(/_/g, " ");

  return (
    <span
      role="status"
      className={`inline-flex items-center rounded-lg border font-medium transition-colors select-none ${sizeClasses[size]} ${colorClasses} ${className}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`}
          aria-hidden="true"
        />
      )}
      {showIcon && !showDot && (
        <IconComponent className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
