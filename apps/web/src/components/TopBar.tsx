"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, ChevronRight } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  onOpenMobileMenu: () => void;
  collapsed: boolean;
}

export function TopBar({ onOpenMobileMenu, collapsed }: TopBarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname || "";
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    // Graceful fallback when rendered outside AppRouter context
  }

  // Safe client-side navigation handler preventing native download triggers
  const handleNavigation = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      return;
    }
    e.preventDefault();
    if (router) {
      router.push(href);
    }
  };

  // Route to Breadcrumb labels
  const getBreadcrumb = () => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Dashboard", href: "/dashboard" }];

    const breadcrumbs = [];
    let currentHref = "";

    for (const part of parts) {
      currentHref += `/${part}`;
      let label = part.charAt(0).toUpperCase() + part.slice(1);
      if (part === "builder") label = "Canvas Builder";
      if (part === "test") label = "Simulation & Debugger";
      if (part.startsWith("wf_")) label = "Workflow";
      if (part.startsWith("exec_")) label = "Execution";
      breadcrumbs.push({ label, href: currentHref });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumb();

  return (
    <header className="h-14 border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 transition-colors duration-150">
      {/* Left: Mobile hamburger & Contextual Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open mobile navigation"
          className="md:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate"
        >
          <Link
            href="/dashboard"
            prefetch={false}
            onClick={(e) => handleNavigation(e, "/dashboard")}
            className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition font-medium"
          >
            FlowForge
          </Link>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.href}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                {isLast ? (
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    prefetch={false}
                    onClick={(e) => handleNavigation(e, crumb.href)}
                    className="hover:text-slate-700 dark:hover:text-slate-200 transition truncate"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right: Quick Command Search, Telemetry Badge, Theme Toggle, Notifications */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Search Shortcut */}
        <Link
          href="/search"
          prefetch={false}
          onClick={(e) => handleNavigation(e, "/search")}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors focus-ring"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
          <span>Quick Search...</span>
          <kbd className="hidden lg:inline-block px-1.5 py-0.2 text-[10px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-400 dark:text-slate-400 shadow-2xs">
            Ctrl+K
          </kbd>
        </Link>

        {/* Operational Environment Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Control Plane Online</span>
        </div>

        {/* Theme Switcher & Notification Controls */}
        <div className="border-l border-slate-200 dark:border-slate-800 pl-2 sm:pl-3 flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
