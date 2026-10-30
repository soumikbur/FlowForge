"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  PlayCircle,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Workflow,
  Shield,
  BookOpen,
} from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  // Do not display navbar on login page
  if (pathname === "/login") return null;

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Workflows", href: "/workflows", icon: Workflow },
    { label: "Templates", href: "/templates", icon: BookOpen },
    { label: "Executions", href: "/executions", icon: PlayCircle },
    { label: "Approval Inbox", href: "/approvals", icon: CheckSquare },
    { label: "Settings", href: "/settings", icon: Shield },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-bold text-xl text-teal-400"
            >
              <Layers className="w-6 h-6 text-teal-400" />
              <span>FlowForge</span>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                      active
                        ? "bg-slate-800 text-teal-400"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
              Acme Operations
            </span>
            <Link
              href="/login"
              className="text-slate-400 hover:text-white p-2 rounded-md transition"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
