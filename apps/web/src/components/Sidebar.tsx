"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Workflow,
  Users,
  BarChart3,
  Settings,
  BookOpen,
  PlayCircle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ChevronDown,
  Building2,
  CheckCircle2,
  X,
  Sun,
  Moon,
  Zap,
  Search,
  Gauge,
  Code,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
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

  const { resolvedTheme, toggleTheme } = useTheme();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("Acme Production");

  // Guaranteed safe client navigation handler
  const handleNavigation = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      return;
    }
    e.preventDefault();
    onCloseMobile();
    if (router) {
      router.push(href);
    }
  };

  // Primary 7 Navigation Items as requested in Master Prompt
  const primaryNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Workflows", href: "/workflows", icon: Workflow },
    { label: "Team", href: "/team", icon: Users },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  // Secondary platform items preserving complete existing workflow capabilities
  const secondaryNavItems = [
    { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
    { label: "Executions", href: "/executions", icon: PlayCircle },
    { label: "Templates", href: "/templates", icon: BookOpen },
    { label: "Policies", href: "/policies", icon: ShieldCheck },
    { label: "Unified Search", href: "/search", icon: Search },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Quotas & Rates", href: "/quotas", icon: Gauge },
    { label: "Developer & API", href: "/settings/developer", icon: Code },
  ];

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-900/70 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Fixed Vertical Navigation Sidebar */}
      <aside
        aria-label="Application Sidebar"
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-[#191B32] border-r border-[#232644] text-[#A3A8C2] transition-all duration-200 select-none ${
          collapsed ? "w-18" : "w-[260px]"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Top Brand Section */}
        <div className="h-20 flex items-center justify-between px-5 border-b border-[#232644]">
          <Link
            href="/dashboard"
            prefetch={false}
            onClick={(e) => handleNavigation(e, "/dashboard")}
            className="flex items-center gap-3 focus:outline-none rounded-xl"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6738E8] to-[#8156F2] flex items-center justify-center text-white shadow-glow shrink-0">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white text-lg tracking-tight leading-none flex items-center gap-1.5">
                  FlowForge
                </span>
                <span className="text-[11px] text-[#747A96] tracking-wide mt-1 font-medium">
                  Automate · Build · Grow
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            className="md:hidden p-1.5 text-[#747A96] hover:text-white rounded-lg"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Switcher */}
        {!collapsed && (
          <div className="p-3.5 border-b border-[#232644]/70">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-white bg-[#20233F] hover:bg-[#282B4E] border border-[#2A2E4E] rounded-xl transition focus:outline-none"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-[#8156F2] shrink-0" />
                  <span className="truncate">{activeWorkspace}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#747A96] shrink-0" />
              </button>

              {workspaceMenuOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-50 bg-[#1D203A] border border-[#2E335B] rounded-xl shadow-xl py-1 text-xs text-white">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkspace("Acme Production");
                      setWorkspaceMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#282C50] flex items-center justify-between"
                  >
                    <span>Acme Production</span>
                    {activeWorkspace === "Acme Production" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#20B779]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkspace("Staging & Validation");
                      setWorkspaceMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#282C50] flex items-center justify-between"
                  >
                    <span>Staging & Validation</span>
                    {activeWorkspace === "Staging & Validation" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#20B779]" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vertical Navigation Area */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main Items */}
          <div className="space-y-1">
            {!collapsed && (
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#747A96] mb-2">
                Main Menu
              </div>
            )}
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : item.href === "/settings"
                    ? pathname.startsWith("/settings")
                    : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={(e) => handleNavigation(e, item.href)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#6738E8] text-white shadow-xs font-semibold"
                      : "text-[#A3A8C2] hover:text-white hover:bg-[#20233F]"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon
                    className={`w-4.5 h-4.5 shrink-0 ${
                      isActive ? "text-white" : "text-[#747A96]"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Platform / Workflow Features */}
          <div className="space-y-1">
            {!collapsed && (
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#747A96] mb-2">
                Platform
              </div>
            )}
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={(e) => handleNavigation(e, item.href)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-[#6738E8]/20 text-[#8156F2] font-semibold border-l-2 border-[#6738E8]"
                      : "text-[#747A96] hover:text-[#A3A8C2] hover:bg-[#20233F]/70"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? "text-[#8156F2]" : "text-[#747A96]"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom Section: Theme Toggle & User Profile */}
        <div className="p-3.5 border-t border-[#232644] bg-[#15172C] flex flex-col gap-3">
          {/* Theme Toggle Button */}
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#1E213D] hover:bg-[#25294A] text-xs font-medium text-[#A3A8C2] hover:text-white transition"
              aria-label="Toggle light or dark theme"
            >
              <span className="flex items-center gap-2">
                {resolvedTheme === "dark" ? (
                  <Moon className="w-4 h-4 text-[#8156F2]" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
                <span>
                  {resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
                </span>
              </span>
              <span className="text-[10px] uppercase font-bold text-[#747A96] px-1.5 py-0.5 rounded bg-[#15172C]">
                {resolvedTheme}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleTheme}
              title="Toggle theme"
              className="w-10 h-10 mx-auto rounded-xl bg-[#1E213D] flex items-center justify-center text-[#A3A8C2] hover:text-white"
            >
              {resolvedTheme === "dark" ? (
                <Moon className="w-4 h-4 text-[#8156F2]" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>
          )}

          {/* User Profile Bar */}
          <div className="relative">
            {!collapsed ? (
              <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[#1E213D] transition">
                <div
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6738E8] to-[#8156F2] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                    JD
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-white truncate">
                      John Doe
                    </span>
                    <span className="text-[11px] text-[#747A96] truncate">
                      Product Lead
                    </span>
                  </div>
                </div>
                <Link
                  href="/login"
                  prefetch={false}
                  onClick={(e) => handleNavigation(e, "/login")}
                  className="p-1.5 text-[#747A96] hover:text-[#EB5757] hover:bg-[#25294A] rounded-lg transition"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#6738E8] to-[#8156F2] text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                  title="John Doe (Product Lead)"
                >
                  JD
                </div>
                <Link
                  href="/login"
                  prefetch={false}
                  onClick={(e) => handleNavigation(e, "/login")}
                  className="p-1.5 text-[#747A96] hover:text-[#EB5757] rounded-lg transition"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Link>
              </div>
            )}

            {/* Profile Dropdown Menu */}
            {profileMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[#1D203A] border border-[#2E335B] rounded-xl shadow-2xl py-1.5 text-xs text-white animate-in fade-in-0 duration-150">
                <div className="px-3 py-1.5 border-b border-[#2A2E4E] mb-1">
                  <p className="font-semibold">John Doe</p>
                  <p className="text-[11px] text-[#747A96]">
                    john@flowforge.dev
                  </p>
                </div>
                <Link
                  href="/settings"
                  prefetch={false}
                  onClick={(e) => {
                    setProfileMenuOpen(false);
                    handleNavigation(e, "/settings");
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#282C50] flex items-center gap-2 text-[#A3A8C2] hover:text-white"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Account Settings</span>
                </Link>
                <Link
                  href="/login"
                  prefetch={false}
                  onClick={(e) => {
                    setProfileMenuOpen(false);
                    handleNavigation(e, "/login");
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#282C50] flex items-center gap-2 text-[#EB5757]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
