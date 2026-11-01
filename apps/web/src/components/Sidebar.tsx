"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Layers,
  LayoutDashboard,
  Workflow,
  BookOpen,
  PlayCircle,
  CheckSquare,
  Search,
  BarChart3,
  ShieldCheck,
  Gauge,
  Code2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ChevronDown,
  Building2,
  Activity,
  CheckCircle2,
  X,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: string | number;
  }>;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname || "";
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    // Graceful fallback when rendered outside AppRouter context
  }
  const [activeWorkspace, setActiveWorkspace] = useState("Acme Production");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  // Safe client-side navigation handler that guarantees zero browser download fallback
  const handleNavigation = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    // Preserve standard browser behavior for multi-window / multi-tab shortcuts (Ctrl, Cmd, Shift)
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      return;
    }
    // Prevent any browser default link behavior (such as Alt+Click download target or browser download fallback)
    e.preventDefault();
    onCloseMobile();
    if (router) {
      router.push(href);
    }
  };

  const navGroups: NavGroup[] = [
    {
      label: "Automation",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Workflows", href: "/workflows", icon: Workflow },
        { label: "Templates", href: "/templates", icon: BookOpen },
        { label: "Executions", href: "/executions", icon: PlayCircle },
        { label: "Approvals", href: "/approvals", icon: CheckSquare },
      ],
    },
    {
      label: "Intelligence",
      items: [
        { label: "Unified Search", href: "/search", icon: Search },
        { label: "Analytics", href: "/analytics", icon: BarChart3 },
      ],
    },
    {
      label: "Governance",
      items: [
        { label: "Policies", href: "/policies", icon: ShieldCheck },
        { label: "Quotas & Rates", href: "/quotas", icon: Gauge },
      ],
    },
    {
      label: "Platform",
      items: [
        { label: "Developer & API", href: "/settings/developer", icon: Code2 },
        { label: "Organization", href: "/settings", icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        aria-label="Application Rail"
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-slate-900 dark:bg-slate-950 border-r border-slate-800 dark:border-slate-800/80 text-slate-300 transition-all duration-200 select-none ${
          collapsed ? "w-16" : "w-64"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-950/40">
          <Link
            href="/dashboard"
            prefetch={false}
            onClick={(e) => handleNavigation(e, "/dashboard")}
            className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md p-1"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white text-base tracking-tight leading-none flex items-center gap-1.5">
                  FlowForge
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    Control Plane
                  </span>
                </span>
                <span className="text-[11px] text-slate-400 truncate mt-0.5">
                  Enterprise Automation
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Switcher */}
        {!collapsed && (
          <div className="p-3 border-b border-slate-800/60">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{activeWorkspace}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {workspaceMenuOpen && (
                <div className="absolute left-0 right-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 text-xs text-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkspace("Acme Production");
                      setWorkspaceMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700/80 flex items-center justify-between"
                  >
                    <span>Acme Production</span>
                    {activeWorkspace === "Acme Production" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkspace("Staging & Validation");
                      setWorkspaceMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700/80 flex items-center justify-between"
                  >
                    <span>Staging & Validation</span>
                    {activeWorkspace === "Staging & Validation" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : item.href === "/settings"
                        ? pathname === "/settings"
                        : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={(e) => handleNavigation(e, item.href)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? "bg-indigo-600/15 text-indigo-400 font-semibold border-l-2 border-indigo-500 pl-[10px]"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-400"}`}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-indigo-500/20 text-indigo-300">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Health Telemetry Status Indicator */}
        {!collapsed && (
          <div className="mx-3 mb-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-300 text-[11px]">
                  System Operational
                </span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                100%
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>API :4000</span>
              <span className="text-emerald-400 font-medium">HEALTHY</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Worker :4001</span>
              <span className="text-emerald-400 font-medium">ACTIVE</span>
            </div>
          </div>
        )}

        {/* Footer / User Profile & Collapse Toggle */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-2">
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                FF
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  Admin User
                </span>
                <span className="text-[10px] text-indigo-400 font-medium">
                  Organization Owner
                </span>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 mx-auto rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              FF
            </div>
          )}

          <div className="flex items-center gap-1">
            {!collapsed && (
              <Link
                href="/login"
                prefetch={false}
                onClick={(e) => handleNavigation(e, "/login")}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition"
              >
                <LogOut className="w-4 h-4" />
              </Link>
            )}

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition"
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
