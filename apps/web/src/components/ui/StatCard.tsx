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
}

export function StatCard({
  label,
  value,
  subtext,
  trend,
  icon,
  iconBg = "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
  className = "",
  badge,
}: StatCardProps) {
  const isPositive = trend && trend.value >= 0;
  const positiveIsGood = trend?.positiveIsGood ?? true;
  const isGood = isPositive ? positiveIsGood : !positiveIsGood;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all ${className}`}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        {icon && (
          <div className={`p-1.5 rounded-lg ${iconBg} shrink-0`}>{icon}</div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </span>
        {badge ? (
          badge
        ) : trend ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
              isGood
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {trend.value}%
            </span>
          </span>
        ) : null}
      </div>

      {subtext && (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate">
          {subtext}
        </p>
      )}
    </div>
  );
}
