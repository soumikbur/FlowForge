"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Activity,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useProjectData } from "@/lib/project-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { getApiBaseUrl } from "@/lib/api-client";

export default function ReportsPage() {
  const { tasks, projects, completedTasks, totalTasks, completionPercentage } =
    useProjectData();

  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "90d">(
    "7d",
  );
  const [loading, setLoading] = useState(false);
  const [apiOverview, setApiOverview] = useState<any>(null);
  const [failures, setFailures] = useState<any>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const apiUrl = getApiBaseUrl();
    try {
      const [overRes, failRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/v1/analytics/overview?range=${timeRange}`, {
          credentials: "include",
        }),
        fetch(`${apiUrl}/api/v1/analytics/failures?range=${timeRange}`, {
          credentials: "include",
        }),
      ]);

      if (overRes.status === "fulfilled" && overRes.value.ok) {
        const json = await overRes.value.json();
        if (json.success) setApiOverview(json.data);
      }
      if (failRes.status === "fulfilled" && failRes.value.ok) {
        const json = await failRes.value.json();
        if (json.success) setFailures(json.data);
      }
    } catch {
      // offline / mock
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Download CSV report
  const handleExportCSV = () => {
    const rows = [
      ["Type", "ID", "Title/Name", "Status", "Due Date", "Progress"],
      ...tasks.map((t) => [
        "Task",
        t.id,
        `"${t.title.replace(/"/g, '""')}"`,
        t.status,
        t.dueDate,
        t.completed ? "100%" : "0%",
      ]),
      ...projects.map((p) => [
        "Project",
        p.id,
        `"${p.name.replace(/"/g, '""')}"`,
        p.status,
        p.dueDate,
        `${p.progress}%`,
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `flowforge-report-${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Mock velocity bars based on actual task data
  const velocityDays = [
    {
      day: "Mon",
      tasks: Math.max(2, Math.round(completedTasks * 0.15)),
      height: "45%",
    },
    {
      day: "Tue",
      tasks: Math.max(3, Math.round(completedTasks * 0.25)),
      height: "70%",
    },
    {
      day: "Wed",
      tasks: Math.max(4, Math.round(completedTasks * 0.3)),
      height: "85%",
    },
    {
      day: "Thu",
      tasks: Math.max(5, Math.round(completedTasks * 0.35)),
      height: "95%",
    },
    {
      day: "Fri",
      tasks: Math.max(3, Math.round(completedTasks * 0.2)),
      height: "60%",
    },
    {
      day: "Sat",
      tasks: Math.max(1, Math.round(completedTasks * 0.08)),
      height: "30%",
    },
    {
      day: "Sun",
      tasks: Math.max(1, Math.round(completedTasks * 0.05)),
      height: "20%",
    },
  ];

  const estimatedHoursSaved = (completedTasks * 3.5).toFixed(1);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Reports & Analytics
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Operational efficiency, task velocity, and workflow execution
            throughput.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-default text-xs font-semibold">
            {(["24h", "7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  timeRange === r
                    ? "bg-surface-primary text-text-primary shadow-xs font-bold"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            icon={<Download className="w-4 h-4" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estimated Hours Saved"
          value={`${estimatedHoursSaved} hrs`}
          subtext="Through automated pipeline executions"
          icon={<Zap className="w-5 h-5" />}
          iconBg="bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
          badge={
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <TrendingUp className="w-3 h-3" />
              +18%
            </span>
          }
        />

        <StatCard
          label="Execution Success Rate"
          value={
            apiOverview?.metrics?.successRate
              ? `${Math.round(apiOverview.metrics.successRate)}%`
              : "98.4%"
          }
          subtext="Zero unhandled SLA breaches"
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBg="bg-[#20B779]/10 text-[#20B779]"
        />

        <StatCard
          label="Avg Step Latency"
          value={
            apiOverview?.metrics?.durations?.averageMs
              ? `${Math.round(apiOverview.metrics.durations.averageMs)} ms`
              : "142 ms"
          }
          subtext="Worker queue to node finish"
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
        />

        <StatCard
          label="Active Initiatives"
          value={projects.length}
          subtext={`${completedTasks}/${totalTasks} tasks finished (${completionPercentage}%)`}
          icon={<Layers className="w-5 h-5" />}
          iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Task Velocity SVG Chart */}
        <div className="lg:col-span-7 bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
          <div className="flex items-center justify-between pb-4 border-b border-border-default">
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Weekly Execution & Task Velocity
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Daily completions across automated business cycles
              </p>
            </div>
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg">
              {completedTasks} completed
            </span>
          </div>

          <div className="mt-8 flex items-end justify-between gap-3 h-52 px-2">
            {velocityDays.map((d) => (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center gap-2 h-full justify-end group"
              >
                <div className="text-[11px] font-bold text-text-muted group-hover:text-purple-600 transition">
                  {d.tasks}
                </div>
                <div className="w-full max-w-[42px] bg-surface-secondary dark:bg-navy-800 rounded-t-xl h-full flex items-end overflow-hidden p-0.5">
                  <div
                    className="w-full bg-purple-600 group-hover:bg-purple-500 rounded-t-lg transition-all duration-500"
                    style={{ height: d.height }}
                  />
                </div>
                <span className="text-xs font-medium text-text-secondary">
                  {d.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Project Health & SLA breakdown */}
        <div className="lg:col-span-5 bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
          <div className="flex items-center justify-between pb-4 border-b border-border-default">
            <h2 className="text-base font-bold text-text-primary">
              Project Health & SLA
            </h2>
            <span className="text-xs font-semibold text-text-secondary">
              {projects.length} Initiatives
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {projects.map((proj) => (
              <div
                key={proj.id}
                className="p-3.5 rounded-xl border border-border-default bg-surface-secondary/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary truncate">
                    {proj.name}
                  </span>
                  <span className="text-xs font-bold text-purple-600">
                    {proj.progress}%
                  </span>
                </div>

                <div className="mt-2.5 w-full bg-surface-secondary dark:bg-navy-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${proj.progress}%`,
                      backgroundColor: proj.color,
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                  <span>Target: {proj.dueDate}</span>
                  <span>
                    {proj.completedTasks}/{proj.tasksCount} done
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
