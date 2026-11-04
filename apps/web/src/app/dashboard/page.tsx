"use client";

import React, { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderKanban,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  Activity,
  Calendar,
  ExternalLink,
  User,
  Trash2,
  Check,
  X,
  RefreshCw,
  Server,
  Layers,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input, Textarea } from "@/components/ui/FormField";
import {
  useProjectData,
  TaskItem,
  ProjectItem,
  TeamMemberItem,
} from "@/lib/project-store";
import { getApiBaseUrl } from "@/lib/api-client";

// Operational Telemetry interfaces preserved from existing system
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
  durations: {
    averageMs: number;
    medianMs: number;
    p95Ms: number;
  };
}

interface OperationalTelemetry {
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
  worker: {
    status: string;
    heartbeatTimestamp: string;
  };
  alertsCount: number;
}

interface FailureReport {
  totalFailures: number;
  categories: Record<string, number>;
  recentFailures: Array<{
    executionId: string;
    workflowName: string;
    category: string;
    sanitizedMessage: string;
    occurredAt: string;
  }>;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"workspace" | "telemetry">(
    "workspace",
  );
  const [timeGreeting, setTimeGreeting] = useState("Good Day");

  // Dynamic time greeting
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setTimeGreeting("Good Morning");
    else if (hour >= 12 && hour < 17) setTimeGreeting("Good Afternoon");
    else setTimeGreeting("Good Evening");
  }, []);

  // Reactive Project Store Data
  const {
    tasks,
    projects,
    team,
    totalTasks,
    completedTasks,
    inProgressTasks,
    overdueTasks,
    pendingTasks,
    completionPercentage,
    inProgressPercentage,
    overduePercentage,
    addTask,
    toggleTaskCompletion,
    deleteTask,
    addProject,
    addTeamMember,
  } = useProjectData();

  // Pending percentage calculation
  const pendingPercentage =
    totalTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) : 0;

  // Operational Telemetry states for Tab 2
  const [telemetry, setTelemetry] = useState<OperationalTelemetry | null>(null);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [failures, setFailures] = useState<FailureReport | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  // Modals state
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Form states for New Task
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskProject, setNewTaskProject] = useState(
    projects[0]?.id || "proj-1",
  );
  const [newTaskPriority, setNewTaskPriority] = useState<
    "High" | "Medium" | "Low"
  >("Medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("Nov 20, 2026");
  const [newTaskAssignee, setNewTaskAssignee] = useState(
    team[0]?.name || "John Doe",
  );
  const [newTaskDesc, setNewTaskDesc] = useState("");

  // Form states for New Project
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectDueDate, setNewProjectDueDate] = useState("Dec 15, 2026");
  const [newProjectColor, setNewProjectColor] = useState("#6738E8");

  // Form states for Invite Member
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "Admin" | "Editor" | "Viewer"
  >("Editor");

  // Unique accessible IDs
  const taskTitleId = useId();
  const taskProjectId = useId();
  const taskPriorityId = useId();
  const taskDueDateId = useId();
  const taskAssigneeId = useId();
  const taskDescId = useId();
  const projectNameId = useId();
  const projectDescId = useId();
  const projectDueDateId = useId();
  const memberNameId = useId();
  const memberEmailId = useId();
  const memberRoleId = useId();

  // Load telemetry when telemetry tab is opened
  const fetchTelemetry = useCallback(async () => {
    setTelemetryLoading(true);
    const apiUrl = getApiBaseUrl();
    try {
      const [opRes, metRes, failRes, alertRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/v1/analytics/operational`, {
          credentials: "include",
        }),
        fetch(`${apiUrl}/api/v1/analytics/overview?range=24h`, {
          credentials: "include",
        }),
        fetch(`${apiUrl}/api/v1/analytics/failures?range=24h`, {
          credentials: "include",
        }),
        fetch(`${apiUrl}/api/v1/analytics/alerts?status=ACTIVE`, {
          credentials: "include",
        }),
      ]);

      if (opRes.status === "fulfilled" && opRes.value.ok) {
        const json = await opRes.value.json();
        if (json.success) setTelemetry(json.data);
      }
      if (metRes.status === "fulfilled" && metRes.value.ok) {
        const json = await metRes.value.json();
        if (json.success) setMetrics(json.data.metrics);
      }
      if (failRes.status === "fulfilled" && failRes.value.ok) {
        const json = await failRes.value.json();
        if (json.success) setFailures(json.data);
      }
      if (alertRes.status === "fulfilled" && alertRes.value.ok) {
        const json = await alertRes.value.json();
        if (json.success) setAlerts(json.data || []);
      }
    } catch {
      // Offline or mock
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "telemetry") {
      fetchTelemetry();
    }
  }, [activeTab, fetchTelemetry]);

  // Handle Create Task
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const chosenProj =
      projects.find((p) => p.id === newTaskProject) || projects[0];
    const chosenAssignee =
      team.find((m) => m.name === newTaskAssignee) || team[0];

    addTask({
      title: newTaskTitle.trim(),
      projectId: chosenProj?.id || "proj-1",
      projectName: chosenProj?.name || "General Automation",
      status: "In Progress",
      priority: newTaskPriority,
      dueDate: newTaskDueDate,
      completed: false,
      assignee: {
        name: chosenAssignee?.name || "John Doe",
        email: chosenAssignee?.email || "john@flowforge.dev",
        initials: chosenAssignee?.initials || "JD",
        avatarColor: chosenAssignee?.avatarColor || "#6738E8",
      },
      description: newTaskDesc.trim() || undefined,
    });

    setNewTaskTitle("");
    setNewTaskDesc("");
    setIsNewTaskOpen(false);
  };

  // Handle Create Project
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    addProject({
      name: newProjectName.trim(),
      description: newProjectDesc.trim() || "Automated workflow project",
      owner: "John Doe",
      status: "Active",
      dueDate: newProjectDueDate,
      startDate: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      color: newProjectColor,
    });

    setNewProjectName("");
    setNewProjectDesc("");
    setIsNewProjectOpen(false);
  };

  // Handle Invite Member
  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    const initials = newMemberName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const colors = ["#6738E8", "#20B779", "#F3A72F", "#4285F4", "#EC4899"];
    const avatarColor = colors[team.length % colors.length];

    addTeamMember({
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      role: newMemberRole,
      initials: initials || "TM",
      avatarColor,
      status: "Active",
      permissions: ["View Analytics", "Manage Tasks"],
    });

    setNewMemberName("");
    setNewMemberEmail("");
    setIsInviteOpen(false);
  };

  // Circular Donut Calculation
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (completionPercentage / 100) * circumference;

  return (
    <div className="space-y-7 pb-12">
      {/* 1. Header Greeting & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            {timeGreeting}, John
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Here&apos;s what&apos;s happening across your workflows and project
            tasks today.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Tab View Switcher */}
          <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-default text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("workspace")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "workspace"
                  ? "bg-surface-primary text-text-primary shadow-xs font-bold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Workspace View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("telemetry")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "telemetry"
                  ? "bg-surface-primary text-text-primary shadow-xs font-bold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-purple-600" />
              <span>Operational Telemetry</span>
              {alerts.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsNewProjectOpen(true)}
            icon={<FolderKanban className="w-4 h-4" />}
          >
            New Project
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewTaskOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Task
          </Button>
        </div>
      </div>

      {/* 2. Top 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tasks"
          value={totalTasks}
          subtext="Across active automation projects"
          icon={<CheckSquare className="w-5 h-5" />}
          iconBg="bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
          badge={
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <TrendingUp className="w-3 h-3" />
              +12% this week
            </span>
          }
        />

        <StatCard
          label="Completed"
          value={completedTasks}
          subtext={`${completionPercentage}% overall completion rate`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBg="bg-[#20B779]/10 text-[#20B779]"
          badge={
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#20B779]/10 text-[#20B779]">
              <Check className="w-3 h-3" />
              {completionPercentage}% Done
            </span>
          }
        />

        <StatCard
          label="In Progress"
          value={inProgressTasks}
          subtext="Active in execution or review"
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-[#F3A72F]/10 text-[#F3A72F]"
          badge={
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F3A72F]/10 text-[#F3A72F]">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {inProgressTasks} Active
            </span>
          }
        />

        <StatCard
          label="Overdue"
          value={overdueTasks}
          subtext="Exceeded target completion SLA"
          icon={<AlertTriangle className="w-5 h-5" />}
          iconBg="bg-[#EB5757]/10 text-[#EB5757]"
          badge={
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                overdueTasks > 0
                  ? "bg-[#EB5757]/10 text-[#EB5757]"
                  : "bg-surface-secondary text-text-muted"
              }`}
            >
              {overdueTasks > 0 ? "Requires Action" : "Clear"}
            </span>
          }
        />
      </div>

      {/* 3. Main Workspace Grid */}
      {activeTab === "workspace" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Project Progress Donut + Recent Tasks (approx 7 of 12 columns) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Card A: Project Progress with Circular SVG Donut Chart */}
            <div className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
              <div className="flex items-center justify-between pb-4 border-b border-border-default">
                <div>
                  <h2 className="text-base font-bold text-text-primary">
                    Project Progress
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Task completion distribution across current business cycles
                  </p>
                </div>
                <span className="text-xs font-medium text-text-muted bg-surface-secondary px-2.5 py-1 rounded-lg border border-border-default">
                  Live Sync
                </span>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-8">
                {/* SVG Donut Chart */}
                <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
                  <svg
                    className="w-full h-full -rotate-90"
                    viewBox="0 0 160 160"
                  >
                    {/* Background Circle */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="15"
                      fill="transparent"
                      className="text-surface-secondary dark:text-navy-800"
                    />
                    {/* Active Progress Circle */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      stroke="#6738E8"
                      strokeWidth="15"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  {/* Center percentage label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold text-text-primary tracking-tight">
                      {completionPercentage}%
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary mt-0.5">
                      Completed
                    </span>
                  </div>
                </div>

                {/* Legend and Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 w-full sm:max-w-xs">
                  {/* Completed */}
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-[#20B779] shrink-0" />
                    <div>
                      <div className="text-xs text-text-secondary font-medium">
                        Completed
                      </div>
                      <div className="text-sm font-bold text-text-primary">
                        {completedTasks}{" "}
                        <span className="text-xs font-normal text-text-muted">
                          ({completionPercentage}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* In Progress */}
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-[#F3A72F] shrink-0" />
                    <div>
                      <div className="text-xs text-text-secondary font-medium">
                        In Progress
                      </div>
                      <div className="text-sm font-bold text-text-primary">
                        {inProgressTasks}{" "}
                        <span className="text-xs font-normal text-text-muted">
                          ({inProgressPercentage}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pending */}
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-[#4285F4] shrink-0" />
                    <div>
                      <div className="text-xs text-text-secondary font-medium">
                        Pending
                      </div>
                      <div className="text-sm font-bold text-text-primary">
                        {pendingTasks}{" "}
                        <span className="text-xs font-normal text-text-muted">
                          ({pendingPercentage}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Overdue */}
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-[#EB5757] shrink-0" />
                    <div>
                      <div className="text-xs text-text-secondary font-medium">
                        Overdue
                      </div>
                      <div className="text-sm font-bold text-text-primary">
                        {overdueTasks}{" "}
                        <span className="text-xs font-normal text-text-muted">
                          ({overduePercentage}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card B: Recent Tasks List */}
            <div className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
              <div className="flex items-center justify-between pb-4 border-b border-border-default">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-text-primary">
                    Recent Tasks
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                    {tasks.length} total
                  </span>
                </div>
                <Link
                  href="/tasks"
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="mt-4 divide-y divide-border-default">
                {tasks.slice(0, 6).map((task) => (
                  <div
                    key={task.id}
                    className="py-3.5 flex items-center justify-between gap-3 group hover:bg-surface-secondary/40 -mx-2 px-2 rounded-xl transition"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Checkbox toggles task completion state */}
                      <button
                        type="button"
                        onClick={() => toggleTaskCompletion(task.id)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                          task.completed
                            ? "bg-[#20B779] border-[#20B779] text-white"
                            : "border-border-default hover:border-purple-500 bg-surface-primary"
                        }`}
                        title={
                          task.completed ? "Mark incomplete" : "Mark complete"
                        }
                        aria-label={`Toggle task: ${task.title}`}
                      >
                        {task.completed && (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className={`text-left text-xs sm:text-sm font-semibold truncate block hover:text-purple-600 transition ${
                            task.completed
                              ? "line-through text-text-muted"
                              : "text-text-primary"
                          }`}
                        >
                          {task.title}
                        </button>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-text-muted truncate max-w-[140px] sm:max-w-xs">
                            {task.projectName}
                          </span>
                          <span className="text-[11px] text-text-muted">•</span>
                          <span
                            className={`text-[11px] font-medium ${
                              task.status === "Overdue"
                                ? "text-[#EB5757] font-semibold"
                                : "text-text-muted"
                            }`}
                          >
                            Due {task.dueDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Assignee Avatar */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: task.assignee.avatarColor }}
                        title={`Assigned to ${task.assignee.name}`}
                      >
                        {task.assignee.initials}
                      </div>

                      {/* Status Badge */}
                      <Badge
                        status={task.status}
                        label={task.status}
                        size="xs"
                        showIcon={false}
                        showDot
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Active Projects + Team Overview (approx 5 of 12 columns) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card C: Active Projects */}
            <div className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
              <div className="flex items-center justify-between pb-4 border-b border-border-default">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-text-primary">
                    Active Projects
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border-default">
                    {projects.length}
                  </span>
                </div>
                <Link
                  href="/projects"
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="mt-4 space-y-4">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="p-3.5 rounded-xl border border-border-default bg-surface-secondary/30 hover:bg-surface-secondary/70 transition group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-md shrink-0"
                          style={{ backgroundColor: proj.color }}
                        />
                        <h3 className="text-xs sm:text-sm font-bold text-text-primary truncate">
                          {proj.name}
                        </h3>
                      </div>
                      <span className="text-xs font-bold text-purple-600 shrink-0">
                        {proj.progress}%
                      </span>
                    </div>

                    <p className="text-[11px] text-text-secondary mt-1 line-clamp-1">
                      {proj.description}
                    </p>

                    {/* Progress Bar */}
                    <div className="mt-3 w-full bg-surface-secondary dark:bg-navy-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${proj.progress}%`,
                          backgroundColor: proj.color,
                        }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-text-muted">
                      <span>
                        {proj.completedTasks} of {proj.tasksCount} tasks done
                      </span>
                      <span>Due {proj.dueDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card D: Team Overview */}
            <div className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
              <div className="flex items-center justify-between pb-4 border-b border-border-default">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-text-primary">
                    Team Overview
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border-default">
                    {team.length} members
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setIsInviteOpen(true)}
                  icon={<Plus className="w-3 h-3" />}
                >
                  Invite
                </Button>
              </div>

              <div className="mt-4 divide-y divide-border-default">
                {team.map((member) => (
                  <div
                    key={member.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: member.avatarColor }}
                        >
                          {member.initials}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface-primary ${
                            member.status === "Active"
                              ? "bg-[#20B779]"
                              : member.status === "Away"
                                ? "bg-[#F3A72F]"
                                : "bg-text-muted"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-text-primary truncate">
                          {member.name}
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          {member.email}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-surface-secondary text-text-secondary border border-border-default">
                        {member.role}
                      </span>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {member.activeProjects} active project
                        {member.activeProjects === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-border-default text-center">
                <Link
                  href="/team"
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 transition"
                >
                  Manage Team & Role Permissions →
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: OPERATIONAL TELEMETRY & SYSTEM HEALTH (Preserves backend metrics) */
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-600 text-white shrink-0">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  FlowForge Distributed Orchestration Engine
                </h3>
                <p className="text-xs text-text-secondary">
                  Real-time worker telemetry, BullMQ queue telemetry, and
                  failure categorization
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={fetchTelemetry}
              isLoading={telemetryLoading}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Telemetry
            </Button>
          </div>

          {/* Telemetry KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="BullMQ In-Flight Jobs"
              value={telemetry?.queue.totalInFlight ?? 0}
              subtext={`${telemetry?.queue.runningJobs ?? 0} active, ${telemetry?.queue.queuedJobs ?? 0} queued`}
              icon={<Layers className="w-5 h-5" />}
              iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
            />

            <StatCard
              label="Scheduler Status"
              value={telemetry?.scheduler.status ?? "ONLINE"}
              subtext={`${telemetry?.scheduler.activeSchedules ?? 0} active crons, max lag ${telemetry?.scheduler.maxLagSeconds ?? 0}s`}
              icon={<Clock className="w-5 h-5" />}
              iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            />

            <StatCard
              label="Worker Heartbeat"
              value={telemetry?.worker.status ?? "HEALTHY"}
              subtext="Distributed BullMQ worker alive"
              icon={<Activity className="w-5 h-5" />}
              iconBg="bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
            />

            <StatCard
              label="Failure Categories"
              value={failures?.totalFailures ?? 0}
              subtext="Logged in 24h execution window"
              icon={<ShieldAlert className="w-5 h-5" />}
              iconBg="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
            />
          </div>

          {/* Active Alerts */}
          {alerts.length > 0 && (
            <div className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card">
              <h3 className="text-sm font-bold text-text-primary mb-3">
                Active System Alerts ({alerts.length})
              </h3>
              <div className="space-y-2">
                {alerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="font-bold text-rose-900 dark:text-rose-200">
                        {al.title}:
                      </span>
                      <span className="text-text-secondary">{al.message}</span>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0">
                      {new Date(al.triggeredAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Create New Task */}
      <Modal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        title="Create New Task"
        description="Assign an operational milestone or workflow action to your team."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <FormField
            label="Task Title"
            name="task-title"
            required
            htmlFor={taskTitleId}
          >
            <Input
              id={taskTitleId}
              name="task-title"
              required
              placeholder="e.g. Implement webhook retry with exponential backoff"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              autoFocus
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Associated Project"
              name="task-project"
              htmlFor={taskProjectId}
            >
              <select
                id={taskProjectId}
                name="task-project"
                value={newTaskProject}
                onChange={(e) => setNewTaskProject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Priority"
              name="task-priority"
              htmlFor={taskPriorityId}
            >
              <select
                id={taskPriorityId}
                name="task-priority"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Target Due Date"
              name="task-due-date"
              htmlFor={taskDueDateId}
            >
              <Input
                id={taskDueDateId}
                name="task-due-date"
                type="text"
                placeholder="e.g. Nov 25, 2026"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
              />
            </FormField>

            <FormField
              label="Assignee"
              name="task-assignee"
              htmlFor={taskAssigneeId}
            >
              <select
                id={taskAssigneeId}
                name="task-assignee"
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                {team.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            label="Description & Notes"
            name="task-desc"
            htmlFor={taskDescId}
          >
            <Textarea
              id={taskDescId}
              name="task-desc"
              rows={2}
              placeholder="Operational details, acceptance criteria, or external references..."
              value={newTaskDesc}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewTaskDesc(e.target.value)
              }
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsNewTaskOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newTaskTitle.trim()}
            >
              Create Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Create New Project */}
      <Modal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        title="Create New Project"
        description="Group related workflows, pipelines, and tasks under a dedicated initiative."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <FormField
            label="Project Name"
            name="project-name"
            required
            htmlFor={projectNameId}
          >
            <Input
              id={projectNameId}
              name="project-name"
              required
              placeholder="e.g. Q4 SOC2 Type II Audit Compliance"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label="Description"
            name="project-desc"
            htmlFor={projectDescId}
          >
            <Textarea
              id={projectDescId}
              name="project-desc"
              rows={2}
              placeholder="Scope, objectives, and deliverables..."
              value={newProjectDesc}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewProjectDesc(e.target.value)
              }
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Target Launch Date"
              name="project-due-date"
              htmlFor={projectDueDateId}
            >
              <Input
                id={projectDueDateId}
                name="project-due-date"
                type="text"
                placeholder="e.g. Dec 31, 2026"
                value={newProjectDueDate}
                onChange={(e) => setNewProjectDueDate(e.target.value)}
              />
            </FormField>

            <FormField label="Accent Color" name="project-color">
              <div className="flex items-center gap-2 pt-1">
                {[
                  "#6738E8",
                  "#20B779",
                  "#F3A72F",
                  "#4285F4",
                  "#EC4899",
                  "#14B8A6",
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewProjectColor(c)}
                    className={`w-7 h-7 rounded-lg transition-transform ${
                      newProjectColor === c
                        ? "ring-2 ring-purple-600 scale-110"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsNewProjectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newProjectName.trim()}
            >
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Invite Team Member */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite Team Member"
        description="Add a collaborator to your FlowForge workspace with role-based access."
      >
        <form onSubmit={handleInviteMember} className="space-y-4">
          <FormField
            label="Full Name"
            name="member-name"
            required
            htmlFor={memberNameId}
          >
            <Input
              id={memberNameId}
              name="member-name"
              required
              placeholder="e.g. Alex Henderson"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label="Email Address"
            name="member-email"
            required
            htmlFor={memberEmailId}
          >
            <Input
              id={memberEmailId}
              name="member-email"
              type="email"
              required
              placeholder="e.g. alex@company.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
            />
          </FormField>

          <FormField
            label="Workspace Role"
            name="member-role"
            htmlFor={memberRoleId}
          >
            <select
              id={memberRoleId}
              name="member-role"
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            >
              <option value="Admin">
                Admin (Full workflow & member control)
              </option>
              <option value="Editor">
                Editor (Create, edit, and trigger workflows)
              </option>
              <option value="Viewer">
                Viewer (Read-only analytics and audit logs)
              </option>
            </select>
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newMemberName.trim() || !newMemberEmail.trim()}
            >
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Task Details & Quick Actions */}
      {selectedTask && (
        <Modal
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          title={selectedTask.title}
          description={`Project: ${selectedTask.projectName}`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface-secondary/50 border border-border-default space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">Status</span>
                <Badge status={selectedTask.status} size="sm" showDot />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">
                  Priority
                </span>
                <span className="font-semibold text-text-primary">
                  {selectedTask.priority}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">
                  Due Date
                </span>
                <span className="font-semibold text-text-primary">
                  {selectedTask.dueDate}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">
                  Assignee
                </span>
                <span className="font-semibold text-text-primary">
                  {selectedTask.assignee.name}
                </span>
              </div>
            </div>

            {selectedTask.description && (
              <div className="text-xs text-text-secondary leading-relaxed bg-surface-primary p-3 rounded-xl border border-border-default">
                {selectedTask.description}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border-default">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  deleteTask(selectedTask.id);
                  setSelectedTask(null);
                }}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTask(null)}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    toggleTaskCompletion(selectedTask.id);
                    setSelectedTask(null);
                  }}
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  {selectedTask.completed ? "Mark Incomplete" : "Mark Complete"}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
