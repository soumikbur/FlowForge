"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Clock,
  AlertCircle,
  ShieldAlert,
  PlayCircle,
  Users,
  CheckSquare,
} from "lucide-react";
import { NotificationResponse, NotificationCategory } from "@flowforge/shared";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationResponse[]>(
    [],
  );
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, filter]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function fetchUnreadCount() {
    try {
      const res = await fetch("/api/v1/notifications/unread-count");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setUnreadCount(json.data.unreadCount);
        }
      }
    } catch {
      // In mock/test environments
    }
  }

  async function loadNotifications() {
    try {
      setLoading(true);
      const query = filter === "unread" ? "?isRead=false" : "";
      const res = await fetch(`/api/v1/notifications${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setNotifications(json.data);
        }
      }
    } catch {
      // In mock/test environments
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string, currentRead: boolean) {
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: !currentRead }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: !currentRead } : n)),
        );
        fetchUnreadCount();
      }
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    try {
      const res = await fetch("/api/v1/notifications/read-all", {
        method: "POST",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  }

  function getCategoryIcon(cat: NotificationCategory) {
    switch (cat) {
      case "WORKFLOW":
        return <PlayCircle className="w-4 h-4 text-indigo-600" />;
      case "APPROVAL":
        return <CheckSquare className="w-4 h-4 text-amber-600" />;
      case "COLLABORATION":
        return <Users className="w-4 h-4 text-blue-600" />;
      case "SECURITY":
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-500" />;
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title="Notifications"
        aria-label="Open notifications center"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-indigo-600 rounded-full shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden text-slate-900 dark:text-slate-100">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 px-2 py-0.2 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                filter === "all"
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                filter === "unread"
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              Unread only
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No notifications
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  You are completely caught up!
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-xs flex items-start gap-2.5 transition ${
                    n.isRead
                      ? "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      : "bg-indigo-50/30 dark:bg-indigo-950/30 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/50"
                  }`}
                >
                  <div className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shrink-0 shadow-2xs">
                    {getCategoryIcon(n.category)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed line-clamp-2">
                      {n.message}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      {n.linkUrl ? (
                        <Link
                          href={n.linkUrl}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold"
                        >
                          <span>View resource</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span />
                      )}

                      <button
                        onClick={() => markAsRead(n.id, n.isRead)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium"
                      >
                        <Check className="w-3 h-3" />
                        <span>{n.isRead ? "Mark unread" : "Mark read"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
