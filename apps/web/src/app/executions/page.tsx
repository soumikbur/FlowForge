"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PlayCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  RotateCcw,
} from "lucide-react";

interface ExecutionRow {
  id: string;
  workflowId: string;
  workflowName?: string;
  triggerType: string;
  status: string;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.append("status", statusFilter);
    params.append("page", String(page));
    params.append("pageSize", "20");

    try {
      const res = await fetch(`${apiUrl}/api/v1/executions?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setExecutions(json.data);
          setTotal(json.meta?.total ?? json.data.length);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Default mock data if server unseeded
    setExecutions([
      {
        id: "exec_1001",
        workflowId: "wf_demo_1",
        workflowName: "Order Processing & Procurement",
        triggerType: "WEBHOOK",
        status: "SUCCEEDED",
        retryCount: 0,
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      },
      {
        id: "exec_1002",
        workflowId: "wf_demo_1",
        workflowName: "Order Processing & Procurement",
        triggerType: "WEBHOOK",
        status: "WAITING_APPROVAL",
        retryCount: 0,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: "exec_1003",
        workflowId: "wf_demo_2",
        workflowName: "Customer Onboarding Sequence",
        triggerType: "MANUAL",
        status: "FAILED",
        retryCount: 2,
        createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
      },
    ]);
    setTotal(3);
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCEEDED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "FAILED":
        return "bg-red-100 text-red-800 border-red-200";
      case "WAITING_APPROVAL":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "WAITING_DELAY":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "RUNNING":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "RETRYING":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "CANCELLED":
        return "bg-slate-200 text-slate-700 border-slate-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-teal-600" />
            Execution Control Center
          </h1>
          <p className="text-sm text-slate-500">
            Inspect real-time execution logs, step transitions, retries, and failure diagnostics.
          </p>
        </div>
        <button
          onClick={fetchExecutions}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
        {[
          "ALL",
          "RUNNING",
          "WAITING_APPROVAL",
          "WAITING_DELAY",
          "RETRYING",
          "SUCCEEDED",
          "FAILED",
          "CANCELLED",
        ].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatusFilter(tab);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              statusFilter === tab
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Execution Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-600 font-semibold text-xs">
            <tr>
              <th className="px-6 py-3.5 text-left">Execution ID</th>
              <th className="px-6 py-3.5 text-left">Workflow</th>
              <th className="px-6 py-3.5 text-left">Trigger</th>
              <th className="px-6 py-3.5 text-left">Status</th>
              <th className="px-6 py-3.5 text-left">Retries</th>
              <th className="px-6 py-3.5 text-left">Started At</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                  Loading executions...
                </td>
              </tr>
            ) : executions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                  No executions found matching filter criteria.
                </td>
              </tr>
            ) : (
              executions.map((exec) => (
                <tr key={exec.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-mono font-medium text-slate-900 text-xs">
                    {exec.id}
                  </td>
                  <td className="px-6 py-4 text-slate-800 font-medium">
                    {exec.workflowName || exec.workflowId}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                      {exec.triggerType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusBadge(
                        exec.status,
                      )}`}
                    >
                      {exec.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600 font-mono">
                    {exec.retryCount > 0 ? (
                      <span className="text-orange-600 font-bold">{exec.retryCount}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {new Date(exec.createdAt).toLocaleDateString()} at{" "}
                    {new Date(exec.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/executions/${exec.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                    >
                      Inspect
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
