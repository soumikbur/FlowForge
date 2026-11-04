"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Exclude login and full-screen auth routes from layout
  if (pathname === "/login") {
    return (
      <main className="min-h-screen bg-[#121424] text-white">{children}</main>
    );
  }

  // Full height builder view
  const isBuilder = pathname.includes("/builder");

  return (
    <div className="min-h-screen bg-app-bg flex flex-col font-sans text-text-primary transition-colors duration-150">
      {/* Redesigned Fixed Navigation Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main Structural Column */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ${
          collapsed ? "md:pl-18" : "md:pl-[260px]"
        }`}
      >
        {/* Sticky Top Application Bar */}
        <TopBar
          collapsed={collapsed}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        {/* Dynamic Page Content Region */}
        <main
          id="main-content"
          tabIndex={-1}
          className={`flex-1 flex flex-col outline-none ${
            isBuilder
              ? "h-[calc(100vh-4rem)] overflow-hidden"
              : "p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
