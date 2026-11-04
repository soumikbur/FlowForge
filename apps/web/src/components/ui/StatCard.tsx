import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: number;
    label?: string;
    positiveIsGood?: boolean;
  };
  icon?: React.ReactNode;
  iconBg?: string;
  className?: string;
  badge?: React.ReactNode;
  accentColor?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  trend,
  icon,
  iconBg = "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  className = "",
  badge,
  accentColor,
}: StatCardProps) {
  const isPositive = trend && trend.value >= 0;
  const positiveIsGood = trend?.positiveIsGood ?? true;
  const isGood = isPositive ? positiveIsGood : !positiveIsGood;

  return (
    <div
      className={`bg-surface-primary rounded-2xl border border-border-default p-5 shadow-card hover:shadow-elevated transition-all duration-200 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span
          className="text-2xl font-bold tracking-tight text-text-primary"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {value}
        </span>
        {badge ? (
          badge
        ) : trend ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
              isGood
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {trend.value}%
            </span>
          </span>
        ) : null}
      </div>

      {subtext && (
        <p className="mt-2 text-[12px] text-text-muted truncate">{subtext}</p>
      )}
    </div>
  );
}
