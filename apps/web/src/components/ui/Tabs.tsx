import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pill";
  className?: string;
  size?: "sm" | "md";
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className = "",
  size = "md",
}: TabsProps) {
  if (variant === "pill") {
    return (
      <div
        className={`inline-flex items-center gap-1 bg-surface-secondary p-1 rounded-xl border border-border-default ${className}`}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-all ${
                size === "sm"
                  ? "px-2.5 py-1 text-xs"
                  : "px-3.5 py-1.5 text-xs sm:text-sm"
              } ${
                isActive
                  ? "bg-surface-primary text-[#6738E8] dark:text-[#8156F2] shadow-xs font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              } ${tab.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-[#6738E8]/15 text-[#6738E8] dark:text-[#8156F2]"
                      : "bg-surface-hover text-text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`flex border-b border-border-default overflow-x-auto ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              size === "sm"
                ? "px-3 py-2 text-xs"
                : "px-4 py-2.5 text-xs sm:text-sm"
            } ${
              isActive
                ? "border-[#6738E8] text-[#6738E8] dark:text-[#8156F2] font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-strong"
            } ${tab.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === "number" && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive
                    ? "bg-[#6738E8]/15 text-[#6738E8] dark:text-[#8156F2]"
                    : "bg-surface-secondary text-text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
