"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "./api-client";

export interface TaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: "Completed" | "In Progress" | "Pending" | "Overdue";
  priority: "High" | "Medium" | "Low";
  dueDate: string;
  completed: boolean;
  assignee: {
    name: string;
    email: string;
    initials: string;
    avatarColor: string;
  };
  description?: string;
  createdAt: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: "Active" | "Completed" | "On Hold";
  progress: number;
  tasksCount: number;
  completedTasks: number;
  dueDate: string;
  startDate: string;
  color: string;
}

export interface TeamMemberItem {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  initials: string;
  avatarColor: string;
  activeProjects: number;
  status: "Active" | "Away" | "Offline";
  permissions: string[];
}

const DEFAULT_PROJECTS: ProjectItem[] = [
  {
    id: "proj-1",
    name: "Customer Onboarding Automation",
    description:
      "End-to-end multi-tier onboarding with KYC checks and Slack triggers",
    owner: "John Doe",
    status: "Active",
    progress: 78,
    tasksCount: 14,
    completedTasks: 11,
    dueDate: "Nov 15, 2026",
    startDate: "Oct 01, 2026",
    color: "#6738E8",
  },
  {
    id: "proj-2",
    name: "Billing Reconciliation Pipeline",
    description: "Automated Stripe & PostgreSQL ledger sync and audit checks",
    owner: "Sarah Chen",
    status: "Active",
    progress: 92,
    tasksCount: 12,
    completedTasks: 11,
    dueDate: "Nov 10, 2026",
    startDate: "Oct 12, 2026",
    color: "#20B779",
  },
  {
    id: "proj-3",
    name: "Security Vulnerability Auto-Remediation",
    description:
      "Automated webhook alert ingestion, triage, and ticket generation",
    owner: "Alex Rivera",
    status: "Active",
    progress: 45,
    tasksCount: 20,
    completedTasks: 9,
    dueDate: "Nov 25, 2026",
    startDate: "Oct 20, 2026",
    color: "#F3A72F",
  },
  {
    id: "proj-4",
    name: "Enterprise SCIM & SSO Integration",
    description: "Okta and Azure AD enterprise directory synchronization",
    owner: "Elena Rostova",
    status: "Active",
    progress: 60,
    tasksCount: 10,
    completedTasks: 6,
    dueDate: "Dec 05, 2026",
    startDate: "Nov 01, 2026",
    color: "#4285F4",
  },
];

const DEFAULT_TASKS: TaskItem[] = [
  {
    id: "task-1",
    title: "Configure OAuth2 token exchange with Salesforce API",
    projectId: "proj-1",
    projectName: "Customer Onboarding Automation",
    status: "Completed",
    priority: "High",
    dueDate: "Oct 28, 2026",
    completed: true,
    assignee: {
      name: "John Doe",
      email: "john@flowforge.dev",
      initials: "JD",
      avatarColor: "#6738E8",
    },
    description:
      "Implement secure refresh token rotation and AES-256 vault storage",
    createdAt: "2026-10-25T10:00:00Z",
  },
  {
    id: "task-2",
    title: "Verify idempotent webhook receiver signatures (HMAC-SHA256)",
    projectId: "proj-2",
    projectName: "Billing Reconciliation Pipeline",
    status: "Completed",
    priority: "High",
    dueDate: "Oct 30, 2026",
    completed: true,
    assignee: {
      name: "Sarah Chen",
      email: "sarah@flowforge.dev",
      initials: "SC",
      avatarColor: "#20B779",
    },
    description:
      "Validate header signatures against replay attacks and clock skew",
    createdAt: "2026-10-26T14:30:00Z",
  },
  {
    id: "task-3",
    title: "Implement human-in-the-loop approval escalation timeout",
    projectId: "proj-1",
    projectName: "Customer Onboarding Automation",
    status: "In Progress",
    priority: "High",
    dueDate: "Nov 06, 2026",
    completed: false,
    assignee: {
      name: "John Doe",
      email: "john@flowforge.dev",
      initials: "JD",
      avatarColor: "#6738E8",
    },
    description:
      "Automatically re-route pending approvals after 24h SLA breach",
    createdAt: "2026-10-28T09:15:00Z",
  },
  {
    id: "task-4",
    title: "Benchmark BullMQ worker step execution concurrency",
    projectId: "proj-3",
    projectName: "Security Vulnerability Auto-Remediation",
    status: "In Progress",
    priority: "Medium",
    dueDate: "Nov 08, 2026",
    completed: false,
    assignee: {
      name: "Alex Rivera",
      email: "alex@flowforge.dev",
      initials: "AR",
      avatarColor: "#F3A72F",
    },
    description: "Test 500 concurrent step jobs with Redis memory profiling",
    createdAt: "2026-10-29T11:00:00Z",
  },
  {
    id: "task-5",
    title: "Audit cross-tenant schema isolation in PostgreSQL queries",
    projectId: "proj-4",
    projectName: "Enterprise SCIM & SSO Integration",
    status: "Pending",
    priority: "High",
    dueDate: "Nov 12, 2026",
    completed: false,
    assignee: {
      name: "Elena Rostova",
      email: "elena@flowforge.dev",
      initials: "ER",
      avatarColor: "#4285F4",
    },
    description:
      "Ensure organizationId WHERE clause is strictly enforced by Prisma middleware",
    createdAt: "2026-11-01T08:00:00Z",
  },
  {
    id: "task-6",
    title: "Review GDPR data retention scrub policy compliance",
    projectId: "proj-2",
    projectName: "Billing Reconciliation Pipeline",
    status: "Overdue",
    priority: "High",
    dueDate: "Nov 02, 2026",
    completed: false,
    assignee: {
      name: "Sarah Chen",
      email: "sarah@flowforge.dev",
      initials: "SC",
      avatarColor: "#20B779",
    },
    description:
      "Execute 90-day execution log anonymization and cryptographic hash check",
    createdAt: "2026-10-20T16:00:00Z",
  },
];

const DEFAULT_TEAM: TeamMemberItem[] = [
  {
    id: "member-1",
    name: "John Doe",
    email: "john@flowforge.dev",
    role: "Owner",
    initials: "JD",
    avatarColor: "#6738E8",
    activeProjects: 4,
    status: "Active",
    permissions: [
      "Admin Access",
      "Deploy Workflows",
      "Manage Billing",
      "Security Lead",
    ],
  },
  {
    id: "member-2",
    name: "Sarah Chen",
    email: "sarah@flowforge.dev",
    role: "Admin",
    initials: "SC",
    avatarColor: "#20B779",
    activeProjects: 3,
    status: "Active",
    permissions: ["Deploy Workflows", "Create Projects", "Manage Integrations"],
  },
  {
    id: "member-3",
    name: "Alex Rivera",
    email: "alex@flowforge.dev",
    role: "Editor",
    initials: "AR",
    avatarColor: "#F3A72F",
    activeProjects: 2,
    status: "Active",
    permissions: ["Edit Workflows", "Execute Simulations"],
  },
  {
    id: "member-4",
    name: "Elena Rostova",
    email: "elena@flowforge.dev",
    role: "Admin",
    initials: "ER",
    avatarColor: "#4285F4",
    activeProjects: 3,
    status: "Away",
    permissions: ["SSO & SCIM Admin", "Policy Manager", "Security Audit"],
  },
  {
    id: "member-5",
    name: "Marcus Vance",
    email: "marcus@flowforge.dev",
    role: "Viewer",
    initials: "MV",
    avatarColor: "#EC4899",
    activeProjects: 1,
    status: "Offline",
    permissions: ["View Analytics", "Inspect Audits"],
  },
];

class ProjectStore {
  private tasks: TaskItem[] = [];
  private projects: ProjectItem[] = [];
  private team: TeamMemberItem[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
    }
  }

  private init() {
    if (this.initialized) return;
    try {
      const storedTasks = localStorage.getItem("flowforge_tasks");
      const storedProjects = localStorage.getItem("flowforge_projects");
      const storedTeam = localStorage.getItem("flowforge_team");

      this.tasks = storedTasks ? JSON.parse(storedTasks) : DEFAULT_TASKS;
      this.projects = storedProjects
        ? JSON.parse(storedProjects)
        : DEFAULT_PROJECTS;
      this.team = storedTeam ? JSON.parse(storedTeam) : DEFAULT_TEAM;
      this.initialized = true;

      // Sync with real workflows from API in the background
      this.syncWithBackend();
    } catch {
      this.tasks = DEFAULT_TASKS;
      this.projects = DEFAULT_PROJECTS;
      this.team = DEFAULT_TEAM;
    }
  }

  private async syncWithBackend() {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/workflows`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.workflows)) {
          const backendWfs = json.data.workflows;
          backendWfs.forEach((wf: any) => {
            const exists = this.projects.some((p) => p.id === wf.id);
            if (!exists) {
              this.projects.push({
                id: wf.id,
                name: wf.name,
                description:
                  wf.description || "FlowForge automated business workflow",
                owner: "John Doe",
                status: wf.status === "ACTIVE" ? "Active" : "On Hold",
                progress: wf.status === "ACTIVE" ? 85 : 40,
                tasksCount: 8,
                completedTasks: wf.status === "ACTIVE" ? 7 : 3,
                dueDate: "Dec 15, 2026",
                startDate: "Nov 01, 2026",
                color: "#6738E8",
              });
            }
          });
          this.notify();
        }
      }
    } catch {
      // Backend offline or mock
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("flowforge_tasks", JSON.stringify(this.tasks));
      localStorage.setItem("flowforge_projects", JSON.stringify(this.projects));
      localStorage.setItem("flowforge_team", JSON.stringify(this.team));
    } catch {}
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getTasks() {
    if (!this.initialized && typeof window !== "undefined") this.init();
    return [...(this.tasks.length ? this.tasks : DEFAULT_TASKS)];
  }

  public getProjects() {
    if (!this.initialized && typeof window !== "undefined") this.init();
    return [...(this.projects.length ? this.projects : DEFAULT_PROJECTS)];
  }

  public getTeam() {
    if (!this.initialized && typeof window !== "undefined") this.init();
    return [...(this.team.length ? this.team : DEFAULT_TEAM)];
  }

  public addTask(task: Omit<TaskItem, "id" | "createdAt">) {
    const newTask: TaskItem = {
      ...task,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.tasks = [newTask, ...this.tasks];

    // Update project count
    const proj = this.projects.find((p) => p.id === task.projectId);
    if (proj) {
      proj.tasksCount += 1;
      if (task.completed) proj.completedTasks += 1;
      proj.progress = Math.round((proj.completedTasks / proj.tasksCount) * 100);
    }

    this.persist();
    return newTask;
  }

  public toggleTaskCompletion(taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      task.status = task.completed ? "Completed" : "In Progress";

      const proj = this.projects.find((p) => p.id === task.projectId);
      if (proj) {
        const projTasks = this.tasks.filter((t) => t.projectId === proj.id);
        const completedCount = projTasks.filter((t) => t.completed).length;
        proj.completedTasks = completedCount;
        proj.progress = projTasks.length
          ? Math.round((completedCount / projTasks.length) * 100)
          : 0;
      }

      this.persist();
    }
  }

  public updateTask(taskId: string, updates: Partial<TaskItem>) {
    this.tasks = this.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t,
    );
    this.persist();
  }

  public deleteTask(taskId: string) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.persist();
  }

  public addProject(
    project: Omit<
      ProjectItem,
      "id" | "progress" | "tasksCount" | "completedTasks"
    >,
  ) {
    const newProj: ProjectItem = {
      ...project,
      id: `proj-${Date.now()}`,
      progress: 0,
      tasksCount: 0,
      completedTasks: 0,
    };
    this.projects = [newProj, ...this.projects];
    this.persist();
    return newProj;
  }

  public updateProject(projectId: string, updates: Partial<ProjectItem>) {
    this.projects = this.projects.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p,
    );
    this.persist();
  }

  public deleteProject(projectId: string) {
    this.projects = this.projects.filter((p) => p.id !== projectId);
    this.tasks = this.tasks.filter((t) => t.projectId !== projectId);
    this.persist();
  }

  public addTeamMember(member: Omit<TeamMemberItem, "id" | "activeProjects">) {
    const newMember: TeamMemberItem = {
      ...member,
      id: `member-${Date.now()}`,
      activeProjects: 1,
    };
    this.team = [...this.team, newMember];
    this.persist();
    return newMember;
  }
}

export const projectStore = new ProjectStore();

export function useProjectData() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return projectStore.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, []);

  const tasks = projectStore.getTasks();
  const projects = projectStore.getProjects();
  const team = projectStore.getTeam();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (t) => t.completed || t.status === "Completed",
  ).length;
  const inProgressTasks = tasks.filter(
    (t) => !t.completed && t.status === "In Progress",
  ).length;
  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.status === "Overdue",
  ).length;
  const pendingTasks = tasks.filter(
    (t) => !t.completed && t.status === "Pending",
  ).length;

  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const inProgressPercentage =
    totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0;
  const overduePercentage =
    totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0;

  return {
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
    addTask: (t: any) => projectStore.addTask(t),
    toggleTaskCompletion: (id: string) => projectStore.toggleTaskCompletion(id),
    updateTask: (id: string, u: any) => projectStore.updateTask(id, u),
    deleteTask: (id: string) => projectStore.deleteTask(id),
    addProject: (p: any) => projectStore.addProject(p),
    updateProject: (id: string, u: any) => projectStore.updateProject(id, u),
    deleteProject: (id: string) => projectStore.deleteProject(id),
    addTeamMember: (m: any) => projectStore.addTeamMember(m),
  };
}
