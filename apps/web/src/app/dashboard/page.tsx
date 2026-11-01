"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api-client";
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
  Gauge,
  Plus,
  ExternalLink,
  Zap,
  Cpu,
  X,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

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
  const [selectedRange, setSelectedRange] = useState<
    "1h" | "24h" | "7d" | "30d"
  >("24h");
  const [loading, setLoading] = useState(true);

  // Data states
  const [overview, setOverview] = useState<{
    timeWindow: TimeWindow;
    metrics: OverviewMetrics;
    trends: {
      totalExecutionsChangePercent: number;
      successRateChangePercent: number;
    };
  } | null>(null);

  const [trendsData, setTrendsData] = useState<TimeBucket[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [failures, setFailures] = useState<FailureReport | null>(null);
  const [operational, setOperational] = useState<OperationalTelemetry | null>(
    null,
  );
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);

  // Node drilldown modal state
  const [selectedWfNodes, setSelectedWfNodes] = useState<{
    workflowName: string;
    nodes: NodePerformance[];
    bottlenecks: NodePerformance[];
  } | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);

  const apiUrl = getApiBaseUrl();

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
      const alertRes = await fetch(
        `${apiUrl}/api/v1/analytics/alerts?status=ACTIVE`,
        {
          credentials: "include",
        },
      );
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

  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/analytics/alerts/${alertId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            resolutionNote: "Resolved via Control Plane dashboard",
          }),
        },
      );
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch {}
  };

  const handleInspectNodes = async (
    workflowId: string,
    workflowName: string,
  ) => {
    setNodesLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/analytics/workflows/${workflowId}/nodes`,
        {
          credentials: "include",
        },
      );
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
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Control Plane Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Operations Control Plane
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              Live Telemetry
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time execution throughput, queue latencies, failure
            classification, and bottleneck analysis.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Time Window Buttons */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/90 dark:border-slate-800 text-xs font-semibold">
            {(["1h", "24h", "7d", "30d"] as const).map((rng) => (
              <button
                key={rng}
                onClick={() => setSelectedRange(rng)}
                className={`px-3 py-1 rounded-md transition-all ${
                  selectedRange === rng
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-bold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
                }`}
              >
                {rng.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchDashboardData()}
            className="p-2 border border-slate-300/80 bg-white dark:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:bg-slate-800/50 transition shadow-xs focus-ring"
            title="Refresh analytics telemetry"
            aria-label="Refresh analytics data"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`}
            />
          </button>

          <Link href="/workflows">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              New Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Operational Alerts Banner */}
      {alerts.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>
                {alerts.length} Active Operational Incident Alert
                {alerts.length > 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-[11px] text-amber-800 font-semibold bg-amber-200/60 px-2 py-0.5 rounded-full">
              Action Required
            </span>
          </div>

          <div className="divide-y divide-amber-200/60">
            {alerts.map((alt) => (
              <div
                key={alt.id}
                className="py-2 flex items-center justify-between text-xs text-amber-900 gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 text-[10px] uppercase font-bold">
                      {alt.severity}
                    </span>
                    <span className="truncate">{alt.title}</span>
                  </div>
                  <p className="text-amber-800 text-[11px] line-clamp-1">
                    {alt.message}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => handleResolveAlert(alt.id)}
                  className="bg-white dark:bg-slate-900 hover:bg-amber-100 text-amber-900 border-amber-300 shrink-0"
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary KPI Metric Cards (Control Plane Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Runs"
          value={metrics?.total ?? 0}
          subtext={`Executions in ${selectedRange}`}
          icon={<PlayCircle className="w-4 h-4" />}
          iconBg="bg-indigo-50 text-indigo-600"
          trend={
            overview?.trends
              ? { value: overview.trends.totalExecutionsChangePercent }
              : undefined
          }
        />

        <StatCard
          label="Success Rate"
          value={`${metrics?.successRate ?? 100}%`}
          subtext={`${metrics?.successful ?? 0} terminal successful`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          iconBg="bg-emerald-50 text-emerald-600"
          badge={
            <Badge
              status={
                (metrics?.successRate ?? 100) >= 95 ? "SUCCEEDED" : "WARNING"
              }
              label={
                (metrics?.successRate ?? 100) >= 95 ? "Optimal" : "Degraded"
              }
              size="xs"
              showDot
            />
          }
        />

        <StatCard
          label="Failure Rate"
          value={`${metrics?.failureRate ?? 0}%`}
          subtext={`${metrics?.failed ?? 0} runs failed (${metrics?.retryCount ?? 0} retries)`}
          icon={<XCircle className="w-4 h-4" />}
          iconBg="bg-rose-50 text-rose-600"
          badge={
            (metrics?.failed ?? 0) > 0 ? (
              <Badge
                status="FAILED"
                label={`${metrics?.failed} failed`}
                size="xs"
              />
            ) : (
              <Badge status="SUCCEEDED" label="Zero failures" size="xs" />
            )
          }
        />

        <StatCard
          label="Median Duration"
          value={
            metrics?.durations
              ? `${(metrics.durations.medianMs / 1000).toFixed(2)}s`
              : "0s"
          }
          subtext={`P95: ${metrics?.durations ? `${(metrics.durations.p95Ms / 1000).toFixed(2)}s` : "0s"} • Avg: ${metrics?.durations ? `${(metrics.durations.averageMs / 1000).toFixed(2)}s` : "0s"}`}
          icon={<Clock className="w-4 h-4" />}
          iconBg="bg-blue-50 text-blue-600"
        />

        <StatCard
          label="In-Flight Load"
          value={
            (metrics?.running ?? 0) +
            (metrics?.waitingApproval ?? 0) +
            (metrics?.waitingDelay ?? 0)
          }
          subtext={`${metrics?.running ?? 0} running • ${metrics?.waitingApproval ?? 0} waiting`}
          icon={<Gauge className="w-4 h-4" />}
          iconBg="bg-amber-50 text-amber-600"
          badge={
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {metrics?.running ?? 0} active
            </span>
          }
        />
      </div>

      {/* Main Execution Trend Visualization & Subsystem Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Execution Trends Time Series */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Execution Throughput & Completion Ratio</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Time-series distribution across terminal execution states
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Success</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                <span>Failed</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />
                <span>Cancelled</span>
              </span>
            </div>
          </div>

          {trendsData.length > 0 ? (
            <div className="space-y-2">
              <div className="h-44 flex items-end gap-1 pt-6 border-b border-slate-100 dark:border-slate-800">
                {trendsData.map((b) => {
                  const maxInSeries = Math.max(
                    1,
                    ...trendsData.map((t) => t.total),
                  );
                  const heightPct = Math.min(
                    100,
                    Math.max(8, (b.total / maxInSeries) * 100),
                  );

                  const succPct =
                    b.total > 0 ? (b.successful / b.total) * 100 : 0;
                  const failPct = b.total > 0 ? (b.failed / b.total) * 100 : 0;
                  const cancPct =
                    b.total > 0 ? (b.cancelled / b.total) * 100 : 0;

                  const dateObj = new Date(b.timestamp);
                  const timeLabel =
                    selectedRange === "30d" || selectedRange === "7d"
                      ? dateObj.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : dateObj.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                  return (
                    <div
                      key={b.timestamp}
                      className="flex-1 flex flex-col items-center group relative h-full justify-end"
                    >
                      {/* Hover Tooltip */}
                      <div className="absolute -top-12 hidden group-hover:flex flex-col items-center z-20 bg-slate-900 text-white text-[10px] px-2.5 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap">
                        <span className="font-semibold">
                          {timeLabel}: {b.total} runs
                        </span>
                        <span className="text-emerald-400">
                          {b.successful} succeeded ({succPct.toFixed(0)}%)
                        </span>
                      </div>

                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full max-w-[24px] rounded-t flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-800 group-hover:opacity-90 transition-opacity"
                      >
                        <div
                          style={{ height: `${cancPct}%` }}
                          className="bg-slate-300 w-full"
                        />
                        <div
                          style={{ height: `${failPct}%` }}
                          className="bg-rose-500 w-full"
                        />
                        <div
                          style={{ height: `${succPct}%` }}
                          className="bg-emerald-500 w-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-14 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
              No execution telemetry recorded in this time range.
            </div>
          )}
        </div>

        {/* Right (1 col): Subsystem Telemetry & Queue Latencies */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-600" />
              <span>Engine Infrastructure Health</span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                Queue Depth
              </span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {operational?.queue.queuedJobs ?? 0}
              </p>
              <p className="text-[10px] text-slate-400">
                {operational?.queue.runningJobs ?? 0} in runner
              </p>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                Scheduler Lag
              </span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {operational?.scheduler.maxLagSeconds ?? 0}s
              </p>
              <p className="text-[10px] text-emerald-600 font-medium">
                {operational?.scheduler.status ?? "HEALTHY"}
              </p>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                Pending Delays
              </span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {operational?.delays.pendingDelays ?? 0}
              </p>
              <p className="text-[10px] text-slate-400">
                {operational?.delays.overdueCount ?? 0} overdue
              </p>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                Approvals
              </span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {operational?.queue.waitingApprovalJobs ?? 0}
              </p>
              <p className="text-[10px] text-slate-400">
                Awaiting human sign-off
              </p>
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px]">
              Heartbeat:{" "}
              {new Date(
                operational?.timestamp || Date.now(),
              ).toLocaleTimeString()}
            </span>
            <Link
              href="/approvals"
              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 text-xs"
            >
              <span>Approval Inbox</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Failure Classification & Recent Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Structured Failure Taxonomy */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Failure Taxonomy & Categories</span>
            </h2>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {failures?.totalFailures ?? 0} Recorded Incident
              {failures?.totalFailures === 1 ? "" : "s"}
            </span>
          </div>

          {failures?.categories &&
          Object.keys(failures.categories).length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(failures.categories).map(([cat, count]) => (
                <div
                  key={cat}
                  className="px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200/80 text-xs font-medium text-rose-800 flex items-center gap-2"
                >
                  <span className="font-semibold">{cat}</span>
                  <span className="bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100">
              ✓ Zero failure categorizations detected in this time range.
            </div>
          )}

          {failures?.recentFailures && failures.recentFailures.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Recent Failed Executions (Sanitized)
              </h3>
              <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {failures.recentFailures.map((rf) => (
                  <div
                    key={rf.executionId}
                    className="py-2.5 flex items-start justify-between text-xs hover:bg-slate-50 dark:bg-slate-800/50 transition"
                  >
                    <div className="space-y-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {rf.workflowName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          {rf.category}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate">
                        {rf.sanitizedMessage}
                      </p>
                    </div>
                    <Link
                      href={`/executions/${rf.executionId}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold shrink-0"
                    >
                      <span>Inspect</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick Operational Shortcuts & Management */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>Platform Quick Actions</span>
            </h2>
            <span className="text-xs text-slate-400">Active Node Clusters</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <Link
              href="/workflows"
              prefetch={false}
              className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 hover:bg-indigo-50/30 transition group flex flex-col justify-between"
            >
              <Workflow className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-105 transition-transform" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Manage Workflows
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Configure triggers and draft revisions
                </span>
              </div>
            </Link>

            <Link
              href="/executions"
              prefetch={false}
              className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 hover:bg-indigo-50/30 transition group flex flex-col justify-between"
            >
              <PlayCircle className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-105 transition-transform" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Execution Logs
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Inspect payload and step timelines
                </span>
              </div>
            </Link>

            <Link
              href="/templates"
              prefetch={false}
              className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 hover:bg-indigo-50/30 transition group flex flex-col justify-between"
            >
              <Layers className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-105 transition-transform" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Templates Library
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pre-built business orchestration
                </span>
              </div>
            </Link>

            <Link
              href="/settings/developer"
              prefetch={false}
              className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 hover:bg-indigo-50/30 transition group flex flex-col justify-between"
            >
              <Zap className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-105 transition-transform" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Developer & APIs
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  OAuth credentials and webhooks
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Workflow Performance & Bottleneck Analysis Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden space-y-3">
        <div className="p-5 border-b border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span>Workflow Operational Performance & Step Bottlenecks</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Durations, throughput percentiles, and node-level latency analysis
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full self-start sm:self-auto">
            {workflows.length} Registered Workflows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <caption className="sr-only">
              Workflow operational summary table
            </caption>
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Workflow Name
                </th>
                <th scope="col" className="px-5 py-3">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Runs
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Success Rate
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Avg Duration
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  P95 Duration
                </th>
                <th scope="col" className="px-5 py-3">
                  Top Category
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="hover:text-indigo-600 transition"
                    >
                      {wf.name}
                    </Link>
                  </td>

                  <td className="px-5 py-3.5">
                    <Badge status={wf.status} size="xs" />
                  </td>

                  <td className="px-5 py-3.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                    {wf.executionCount}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`font-semibold ${
                        wf.successRate >= 90
                          ? "text-emerald-600"
                          : wf.successRate >= 75
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {wf.successRate}%
                    </span>
                  </td>

                  <td className="px-5 py-3.5 text-right font-mono text-[11px]">
                    {(wf.avgDurationMs / 1000).toFixed(2)}s
                  </td>

                  <td className="px-5 py-3.5 text-right font-mono text-[11px]">
                    {(wf.p95DurationMs / 1000).toFixed(2)}s
                  </td>

                  <td className="px-5 py-3.5">
                    {wf.commonFailureCategory !== "NONE" ? (
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">
                        {wf.commonFailureCategory}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">None</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleInspectNodes(wf.id, wf.name)}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold focus-ring rounded p-1"
                    >
                      <span>Inspect Nodes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {workflows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    No workflows registered. Create your first workflow to see
                    operational metrics.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NODE PERFORMANCE & BOTTLENECK MODAL */}
      {selectedWfNodes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span>Node Performance: {selectedWfNodes.workflowName}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Step latency distribution & bottleneck identification
                </p>
              </div>
              <button
                onClick={() => setSelectedWfNodes(null)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-lg hover:bg-slate-100 dark:bg-slate-800"
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
                  The following node(s) consume over 40% of cumulative execution
                  duration or experience elevated failure rates:
                </p>
                <ul className="list-disc pl-5 font-semibold space-y-0.5">
                  {selectedWfNodes.bottlenecks.map((bn) => (
                    <li key={bn.nodeId}>
                      {bn.nodeName} ({bn.nodeType}) —{" "}
                      {bn.percentageOfTotalDuration}% of runtime (P95:{" "}
                      {(bn.p95DurationMs / 1000).toFixed(2)}s)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Detailed Node Telemetry Breakdown
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Node</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Runs</th>
                      <th className="px-4 py-2.5 text-right">Failures</th>
                      <th className="px-4 py-2.5 text-right">Avg Duration</th>
                      <th className="px-4 py-2.5 text-right">P95</th>
                      <th className="px-4 py-2.5 text-right">% Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedWfNodes.nodes.map((n) => (
                      <tr
                        key={n.nodeId}
                        className={
                          n.isBottleneck
                            ? "bg-amber-50/50"
                            : "hover:bg-slate-50 dark:bg-slate-800/50"
                        }
                      >
                        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                          {n.nodeName}
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {n.nodeType}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {n.executionCount}
                        </td>
                        <td className="px-4 py-2 text-right text-rose-600 font-semibold">
                          {n.failureCount}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {(n.avgDurationMs / 1000).toFixed(2)}s
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {(n.p95DurationMs / 1000).toFixed(2)}s
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {n.percentageOfTotalDuration}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedWfNodes(null)}
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
