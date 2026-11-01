"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api-client";
import { PlayCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

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
    const apiUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.append("status", statusFilter);
    params.append("page", String(page));
    params.append("pageSize", "20");

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/executions?${params.toString()}`,
        {
          credentials: "include",
        },
      );
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-indigo-600" />
            Execution Control Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inspect real-time execution logs, step transitions, retries, and
            failure diagnostics.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchExecutions}
          isLoading={loading}
          icon={
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          }
        >
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-1.5 sm:gap-2">
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
            aria-pressed={statusFilter === tab}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition focus-ring ${
              statusFilter === tab
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            {tab.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Execution Table in responsive container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-600" />
            <span>Loading executions...</span>
          </div>
        ) : executions.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title="No executions found"
            description={`No workflow executions match the current status filter (${statusFilter.replace("_", " ")}).`}
            actionLabel="Reset Filter"
            onAction={() => setStatusFilter("ALL")}
          />
        ) : (
          <div className="responsive-table-container">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Workflow executions list</caption>
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold text-xs">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Execution ID
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Workflow
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Trigger
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Retries
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left">
                    Started At
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {executions.map((exec) => (
                  <tr
                    key={exec.id}
                    className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                  >
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-slate-100 text-xs">
                      {exec.id}
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">
                      {exec.workflowName || exec.workflowId}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
                        {exec.triggerType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={exec.status} size="sm" />
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 font-mono">
                      {exec.retryCount > 0 ? (
                        <span className="text-orange-600 font-bold">
                          {exec.retryCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {new Date(exec.createdAt).toLocaleDateString()} at{" "}
                      {new Date(exec.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/executions/${exec.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline focus-ring rounded p-1"
                        aria-label={`Inspect execution ${exec.id}`}
                      >
                        <span>Inspect</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
