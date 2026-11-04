"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, ChevronRight, Plus, Bell, X } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/Button";

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

  const [searchQuery, setSearchQuery] = useState("");

  const handleNavigation = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (router) {
      router.push(href);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && router) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
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
    <header className="h-16 border-b border-border-default dark:border-slate-800 bg-surface-primary/95 dark:bg-slate-900/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 transition-colors duration-150">
      {/* Left: Mobile Hamburger & Breadcrumb Navigation */}
      <div className="flex items-center gap-3.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open mobile navigation"
          className="md:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-xl transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-text-secondary font-medium truncate"
        >
          <Link
            href="/dashboard"
            prefetch={false}
            onClick={(e) => handleNavigation(e, "/dashboard")}
            className="text-text-muted hover:text-text-primary transition"
          >
            FlowForge
          </Link>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.href}>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                {isLast ? (
                  <span className="font-semibold text-text-primary truncate">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    prefetch={false}
                    onClick={(e) => handleNavigation(e, crumb.href)}
                    className="text-text-muted hover:text-text-primary transition truncate"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right Controls: Global Search, Notification, Avatar */}
      <div className="flex items-center gap-3">
        {/* Global Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden sm:block relative"
        >
          <Link
            href="/search"
            prefetch={false}
            onClick={(e) => handleNavigation(e, "/search")}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-[#6738E8] transition"
            title="Unified Search"
          >
            <Search className="w-4 h-4" />
          </Link>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, projects, workflows..."
            className="w-56 md:w-64 bg-surface-secondary/70 border border-border-default rounded-xl pl-9.5 pr-3.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#6738E8]/20 focus:border-[#6738E8] transition-all"
          />
        </form>

        {/* Theme Toggle Button */}
        <ThemeToggle />

        {/* Notification Bell with real dropdown */}
        <NotificationBell />

        {/* User Avatar */}
        <Link
          href="/settings"
          prefetch={false}
          onClick={(e) => handleNavigation(e, "/settings")}
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6738E8] to-[#8156F2] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs hover:opacity-95 transition"
          title="John Doe (Product Lead)"
        >
          JD
        </Link>
      </div>
    </header>
  );
}
