import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  PauseCircle,
  FileText,
  Info,
} from "lucide-react";

export type BadgeStatus =
  | "ACTIVE"
  | "SUCCEEDED"
  | "APPROVED"
  | "FAILED"
  | "REJECTED"
  | "ERROR"
  | "WAITING_APPROVAL"
  | "PENDING"
  | "WARNING"
  | "RUNNING"
  | "PROCESSING"
  | "WAITING_DELAY"
  | "CANCELLED"
  | "ARCHIVED"
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
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  let dotColor = "bg-slate-500";
  let IconComponent: React.ComponentType<{ className?: string }> = Info;

  switch (normalized) {
    case "ACTIVE":
    case "SUCCEEDED":
    case "APPROVED":
    case "READY":
    case "DELIVERED":
    case "HEALTHY":
      colorClasses =
        "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60";
      dotColor = "bg-emerald-500";
      IconComponent = CheckCircle2;
      break;

    case "FAILED":
    case "REJECTED":
    case "ERROR":
    case "DEAD_LETTERED":
    case "FAILED_PERMANENTLY":
    case "CRITICAL":
      colorClasses =
        "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60";
      dotColor = "bg-rose-500";
      IconComponent = XCircle;
      break;

    case "WAITING_APPROVAL":
    case "PENDING":
    case "WARNING":
    case "RETRY_SCHEDULED":
    case "RETRYING":
      colorClasses =
        "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60";
      dotColor = "bg-amber-500";
      IconComponent = AlertTriangle;
      break;

    case "RUNNING":
    case "PROCESSING":
    case "IN_PROGRESS":
      colorClasses =
        "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60";
      dotColor = "bg-indigo-500";
      IconComponent = RefreshCw;
      break;

    case "WAITING_DELAY":
      colorClasses =
        "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/60";
      dotColor = "bg-sky-500";
      IconComponent = Clock;
      break;

    case "CANCELLED":
    case "ARCHIVED":
    case "DISABLED":
      colorClasses =
        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
      dotColor = "bg-slate-400";
      IconComponent = PauseCircle;
      break;

    case "DRAFT":
      colorClasses =
        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700";
      dotColor = "bg-slate-400";
      IconComponent = FileText;
      break;

    default:
      colorClasses =
        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
      dotColor = "bg-slate-400";
      IconComponent = Info;
      break;
  }

  const displayLabel = label || status.replace(/_/g, " ");
  const isSpinning = normalized === "RUNNING" || normalized === "PROCESSING";

  const sizeClasses =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5 gap-1 font-medium"
      : size === "sm"
        ? "text-[11px] px-2 py-0.5 gap-1 font-medium"
        : "text-xs px-2.5 py-1 gap-1.5 font-medium";

  return (
    <span
      className={`inline-flex items-center border rounded-full select-none ${colorClasses} ${sizeClasses} ${className}`}
      role="status"
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${isSpinning ? "animate-ping" : ""}`}
          aria-hidden="true"
        />
      )}
      {showIcon && !showDot && (
        <IconComponent
          className={`w-3.5 h-3.5 shrink-0 ${isSpinning ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
