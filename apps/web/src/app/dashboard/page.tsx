"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Workflow,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Server,
  Activity,
  Layers,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Gauge,
  Filter,
  Check,
  X,
  ExternalLink,
  Zap,
} from "lucide-react";

interface TimeWindow {
  range: string;
  from: string;
  to: string;
}

interface OverviewMetrics {
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  running: number;
  waitingApproval: number;
  waitingDelay: number;
  successRate: number;
  failureRate: number;
  retryCount: number;
  retryRate: number;
  timeoutCount: number;
  durations: {
    averageMs: number;
    medianMs: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
  };
  byTriggerType: Record<string, number>;
  byStatus: Record<string, number>;
  byEnvironment: Record<string, number>;
}

interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
  executionCount: number;
  successfulCount: number;
  failedCount: number;
  successRate: number;
  failureRate: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  retryCount: number;
  lastExecutedAt?: string;
  lastFailedAt?: string;
  commonFailureCategory: string;
}

interface NodePerformance {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executionCount: number;
  failureCount: number;
  failureRate: number;
  retryCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  percentageOfTotalDuration: number;
  isBottleneck: boolean;
}

interface OperationalTelemetry {
  timestamp: string;
  queue: {
    queuedJobs: number;
    runningJobs: number;
    waitingApprovalJobs: number;
    waitingDelayJobs: number;
    totalInFlight: number;
  };
  scheduler: {
    activeSchedules: number;
    overdueCount: number;
    maxLagSeconds: number;
    status: string;
  };
  delays: {
    pendingDelays: number;
    overdueCount: number;
    maxLagSeconds: number;
  };
  worker: {
    status: string;
    heartbeatTimestamp: string;
  };
  alertsCount: number;
}

interface OperationalAlert {
  id: string;
  ruleType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED";
  title: string;
  message: string;
  triggeredAt: string;
  dedupKey?: string;
}

interface FailureReport {
  totalFailures: number;
  categories: Record<string, number>;
  topFailingNodes: Record<string, number>;
  recentFailures: Array<{
    executionId: string;
    workflowId: string;
    workflowName: string;
    category: string;
    sanitizedMessage: string;
    failedNodeId?: string;
    occurredAt: string;
    retryCount: number;
  }>;
}

interface TimeBucket {
  timestamp: string;
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  avgDurationMs: number;
}

export default function AnalyticsDashboardPage() {
  const [selectedRange, setSelectedRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [loading, setLoading] = useState(true);

  // Data states
  const [overview, setOverview] = useState<{
    timeWindow: TimeWindow;
    metrics: OverviewMetrics;
    trends: { totalExecutionsChangePercent: number; successRateChangePercent: number };
  } | null>(null);

  const [trendsData, setTrendsData] = useState<TimeBucket[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [failures, setFailures] = useState<FailureReport | null>(null);
  const [operational, setOperational] = useState<OperationalTelemetry | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);

  // Node drilldown modal state
  const [selectedWfNodes, setSelectedWfNodes] = useState<{
    workflowName: string;
    nodes: NodePerformance[];
    bottlenecks: NodePerformance[];
  } | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Overview
      const overviewRes = await fetch(
        `${apiUrl}/api/v1/analytics/overview?range=${selectedRange}`,
        { credentials: "include" },
      );
      if (overviewRes.ok) {
        const json = await overviewRes.json();
        if (json.success) setOverview(json.data);
      }

      // 2. Trends
      const trendsRes = await fetch(
        `${apiUrl}/api/v1/analytics/trends?range=${selectedRange}`,
        { credentials: "include" },
      );
      if (trendsRes.ok) {
        const json = await trendsRes.json();
        if (json.success) setTrendsData(json.data.buckets || []);
      }

      // 3. Workflows Performance
      const wfRes = await fetch(
        `${apiUrl}/api/v1/analytics/workflows?range=${selectedRange}`,
        { credentials: "include" },
      );
      if (wfRes.ok) {
        const json = await wfRes.json();
        if (json.success) setWorkflows(json.data || []);
      }

      // 4. Failures
      const failRes = await fetch(
        `${apiUrl}/api/v1/analytics/failures?range=${selectedRange}`,
        { credentials: "include" },
      );
      if (failRes.ok) {
        const json = await failRes.json();
        if (json.success) setFailures(json.data);
      }

      // 5. Operational
      const opRes = await fetch(`${apiUrl}/api/v1/analytics/operational`, {
        credentials: "include",
      });
      if (opRes.ok) {
        const json = await opRes.json();
        if (json.success) setOperational(json.data);
      }

      // 6. Alerts
      const alertRes = await fetch(`${apiUrl}/api/v1/analytics/alerts?status=ACTIVE`, {
        credentials: "include",
      });
      if (alertRes.ok) {
        const json = await alertRes.json();
        if (json.success) setAlerts(json.data || []);
      }
    } catch {
      // Graceful offline fallback
    } finally {
      setLoading(false);
    }
  }, [apiUrl, selectedRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle manual resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/analytics/alerts/${alertId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolutionNote: "Resolved via dashboard" }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch {}
  };

  // Inspect node performance for a workflow
  const handleInspectNodes = async (workflowId: string, workflowName: string) => {
    setNodesLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/analytics/workflows/${workflowId}/nodes`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSelectedWfNodes({
            workflowName,
            nodes: json.data.nodes || [],
            bottlenecks: json.data.bottlenecks || [],
          });
        }
      }
    } finally {
      setNodesLoading(false);
    }
  };

  const metrics = overview?.metrics;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Top Header & Range Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-600" />
            <span>Analytics & Operational Intelligence</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative workflow execution health, operational telemetry, failure analytics, and bottleneck diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Window Buttons */}
          <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            {(["1h", "24h", "7d", "30d"] as const).map((rng) => (
              <button
                key={rng}
                onClick={() => setSelectedRange(rng)}
                className={`px-3 py-1.5 rounded-md transition ${
                  selectedRange === rng
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {rng.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchDashboardData()}
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Active Operational Alerts Banner */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>{alerts.length} Active Operational Incident Alert{alerts.length > 1 ? "s" : ""}</span>
            </div>
            <span className="text-xs text-amber-700 font-medium">Requires Attention</span>
          </div>

          <div className="divide-y divide-amber-100">
            {alerts.map((alt) => (
              <div key={alt.id} className="py-2 flex items-center justify-between text-xs text-amber-900">
                <div className="space-y-0.5">
                  <div className="font-semibold flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] uppercase font-bold">
                      {alt.severity}
                    </span>
                    <span>{alt.title}</span>
                  </div>
                  <p className="text-amber-800">{alt.message}</p>
                </div>
                <button
                  onClick={() => handleResolveAlert(alt.id)}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded text-amber-800 font-medium transition"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* Total Executions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Total Executions</span>
            <PlayCircle className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{metrics?.total || 0}</span>
            {overview?.trends && (
              <span
                className={`text-xs font-semibold flex items-center ${
                  overview.trends.totalExecutionsChangePercent >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}
              >
                {overview.trends.totalExecutionsChangePercent >= 0 ? "+" : ""}
                {overview.trends.totalExecutionsChangePercent}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Total runs started in {selectedRange}</p>
        </div>

        {/* Success Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-600">{metrics?.successRate || 100}%</span>
            <span className="text-xs text-slate-500">
              {metrics?.successful || 0} success
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Terminal eligible success %</p>
        </div>

        {/* Failure Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Failure Rate</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-red-600">{metrics?.failureRate || 0}%</span>
            <span className="text-xs text-slate-500">
              {metrics?.failed || 0} failed
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Retries: {metrics?.retryCount || 0}</p>
        </div>

        {/* Median Duration */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Median Duration</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">
              {metrics?.durations ? `${(metrics.durations.medianMs / 1000).toFixed(2)}s` : "0s"}
            </span>
            <span className="text-[11px] text-slate-500">
              P95: {metrics?.durations ? `${(metrics.durations.p95Ms / 1000).toFixed(2)}s` : "0s"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Avg: {metrics?.durations ? `${(metrics.durations.averageMs / 1000).toFixed(2)}s` : "0s"}</p>
        </div>

        {/* Active & In-Flight */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Active & Waiting</span>
            <Gauge className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">
              {(metrics?.running || 0) + (metrics?.waitingApproval || 0) + (metrics?.waitingDelay || 0)}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {metrics?.running || 0} running
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {metrics?.waitingApproval || 0} approvals • {metrics?.waitingDelay || 0} delays
          </p>
        </div>
      </div>

      {/* Execution Time-Series Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <span>Execution Volume & Health Trends</span>
            </h2>
            <p className="text-xs text-slate-400">Hourly/daily distribution of completed executions</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500" />
              <span>Succeeded</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-500" />
              <span>Failed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-300" />
              <span>Cancelled</span>
            </div>
          </div>
        </div>

        {trendsData.length > 0 ? (
          <div className="space-y-2">
            <div className="h-40 flex items-end gap-1.5 pt-6 border-b border-slate-100">
              {trendsData.map((b) => {
                const maxInSeries = Math.max(1, ...trendsData.map((t) => t.total));
                const heightPct = Math.min(100, Math.max(8, (b.total / maxInSeries) * 100));

                const succPct = b.total > 0 ? (b.successful / b.total) * 100 : 0;
                const failPct = b.total > 0 ? (b.failed / b.total) * 100 : 0;
                const cancPct = b.total > 0 ? (b.cancelled / b.total) * 100 : 0;

                const dateObj = new Date(b.timestamp);
                const timeLabel =
                  selectedRange === "30d" || selectedRange === "7d"
                    ? dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                return (
                  <div key={b.timestamp} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-12 hidden group-hover:flex flex-col items-center z-20 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow pointer-events-none whitespace-nowrap">
                      <span>{timeLabel}: {b.total} total</span>
                      <span className="text-emerald-400">{b.successful} ok, {b.failed} err</span>
                    </div>

                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[28px] rounded-t flex flex-col overflow-hidden bg-slate-100"
                    >
                      <div style={{ height: `${cancPct}%` }} className="bg-slate-300 w-full" />
                      <div style={{ height: `${failPct}%` }} className="bg-red-500 w-full" />
                      <div style={{ height: `${succPct}%` }} className="bg-emerald-500 w-full" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
            No execution trend data available in this time range.
          </div>
        )}
      </div>

      {/* Two Column Grid: Failure Analysis & Operational Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Structured Failure Analysis */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Structured Failure Classification</span>
            </h2>
            <span className="text-xs font-semibold text-slate-500">
              {failures?.totalFailures || 0} Incident{failures?.totalFailures === 1 ? "" : "s"}
            </span>
          </div>

          {/* Categorized Pills */}
          {failures?.categories && Object.keys(failures.categories).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(failures.categories).map(([cat, count]) => (
                <div
                  key={cat}
                  className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center gap-2"
                >
                  <span className="font-bold">{cat}</span>
                  <span className="bg-red-200 text-red-900 px-1.5 py-0.2 rounded-full text-[10px]">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-100">
              ✓ Zero failures reported in the selected time range.
            </div>
          )}

          {/* Recent Failures List */}
          {failures?.recentFailures && failures.recentFailures.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Recent Failed Executions (Sanitized)
              </h3>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {failures.recentFailures.map((rf) => (
                  <div key={rf.executionId} className="py-2.5 flex items-start justify-between text-xs hover:bg-slate-50 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{rf.workflowName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                          {rf.category}
                        </span>
                      </div>
                      <p className="text-slate-500 font-mono text-[11px] line-clamp-1">
                        {rf.sanitizedMessage}
                      </p>
                    </div>
                    <Link
                      href={`/executions/${rf.executionId}`}
                      className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 shrink-0 font-medium pl-2"
                    >
                      <span>Drill-down</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Operational Infrastructure Monitoring */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-600" />
              <span>Operational Subsystem Health</span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>WORKER ONLINE</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
              <span className="text-xs text-slate-500 font-medium">Queue Backlog</span>
              <p className="text-xl font-bold text-slate-900">{operational?.queue.queuedJobs || 0}</p>
              <p className="text-[11px] text-slate-400">{operational?.queue.runningJobs || 0} in active processing</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
              <span className="text-xs text-slate-500 font-medium">Scheduler Health</span>
              <p className="text-xl font-bold text-slate-900">
                {operational?.scheduler.status || "HEALTHY"}
              </p>
              <p className="text-[11px] text-slate-400">
                {operational?.scheduler.overdueCount || 0} overdue (max {operational?.scheduler.maxLagSeconds || 0}s lag)
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
              <span className="text-xs text-slate-500 font-medium">Pending Delays</span>
              <p className="text-xl font-bold text-slate-900">{operational?.delays.pendingDelays || 0}</p>
              <p className="text-[11px] text-slate-400">
                {operational?.delays.overdueCount || 0} overdue
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
              <span className="text-xs text-slate-500 font-medium">Human Approvals</span>
              <p className="text-xl font-bold text-slate-900">{operational?.queue.waitingApprovalJobs || 0}</p>
              <p className="text-[11px] text-slate-400">Awaiting user decisions</p>
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100">
            <span>Last Heartbeat: {new Date(operational?.timestamp || Date.now()).toLocaleTimeString()}</span>
            <Link href="/approvals" className="text-teal-600 hover:underline flex items-center gap-1">
              <span>View approval inbox</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Workflow Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-teal-600" />
              <span>Workflow Performance & Bottleneck Analysis</span>
            </h2>
            <p className="text-xs text-slate-500">Inspect execution counts, durations, and node bottlenecks</p>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            {workflows.length} Total Workflows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Workflow</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Runs</th>
                <th className="px-6 py-3.5 text-right">Success Rate</th>
                <th className="px-6 py-3.5 text-right">Avg Duration</th>
                <th className="px-6 py-3.5 text-right">P95 Duration</th>
                <th className="px-6 py-3.5">Top Failure</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    <Link href={`/workflows/${wf.id}`} className="hover:text-teal-600 transition">
                      {wf.name}
                    </Link>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        wf.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {wf.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right font-semibold text-slate-900">
                    {wf.executionCount}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <span
                      className={`font-semibold ${
                        wf.successRate >= 90
                          ? "text-emerald-600"
                          : wf.successRate >= 75
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {wf.successRate}%
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right font-mono">
                    {(wf.avgDurationMs / 1000).toFixed(2)}s
                  </td>

                  <td className="px-6 py-4 text-right font-mono">
                    {(wf.p95DurationMs / 1000).toFixed(2)}s
                  </td>

                  <td className="px-6 py-4">
                    {wf.commonFailureCategory !== "NONE" ? (
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                        {wf.commonFailureCategory}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">None</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleInspectNodes(wf.id, wf.name)}
                      className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 font-semibold"
                    >
                      <span>Inspect Nodes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {workflows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    No workflows registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NODE PERFORMANCE & BOTTLENECK MODAL */}
      {selectedWfNodes && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span>Node Performance: {selectedWfNodes.workflowName}</span>
                </h3>
                <p className="text-xs text-slate-500">Step latency distribution & bottleneck identification</p>
              </div>
              <button
                onClick={() => setSelectedWfNodes(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedWfNodes.bottlenecks.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Potential Bottleneck Detected</span>
                </div>
                <p>
                  The following node(s) consume over 40% of cumulative execution duration or experience elevated failure rates:
                </p>
                <ul className="list-disc pl-5">
                  {selectedWfNodes.bottlenecks.map((b) => (
                    <li key={b.nodeId}>
                      <span className="font-semibold">{b.nodeName} ({b.nodeType})</span>: {b.percentageOfTotalDuration}% of runtime, {b.failureRate}% failure rate
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Node</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Executions</th>
                    <th className="px-4 py-3 text-right">Failure Rate</th>
                    <th className="px-4 py-3 text-right">Avg Duration</th>
                    <th className="px-4 py-3 text-right">P95 Duration</th>
                    <th className="px-4 py-3 text-right">Share %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedWfNodes.nodes.map((n) => (
                    <tr key={n.nodeId} className={n.isBottleneck ? "bg-amber-50/40" : ""}>
                      <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-1.5">
                        {n.isBottleneck && (
                          <span title="Bottleneck node" className="text-amber-600">⚠️</span>
                        )}
                        <span>{n.nodeName}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">{n.nodeType}</td>
                      <td className="px-4 py-3 text-right">{n.executionCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={n.failureRate > 0 ? "text-red-600" : "text-emerald-600"}>
                          {n.failureRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{(n.avgDurationMs / 1000).toFixed(2)}s</td>
                      <td className="px-4 py-3 text-right font-mono">{(n.p95DurationMs / 1000).toFixed(2)}s</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">
                        {n.percentageOfTotalDuration}%
                      </td>
                    </tr>
                  ))}
                  {selectedWfNodes.nodes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        No node execution data recorded for this workflow yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedWfNodes(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
