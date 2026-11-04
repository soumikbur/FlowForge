"use client";

import React, { useState, useId, useMemo } from "react";
import Link from "next/link";
import {
  FolderKanban,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  Trash2,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { useProjectData, ProjectItem } from "@/lib/project-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input, Textarea } from "@/components/ui/FormField";

export default function ProjectsPage() {
  const { projects, tasks, addProject, deleteProject } = useProjectData();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectDueDate, setProjectDueDate] = useState("Dec 20, 2026");
  const [projectColor, setProjectColor] = useState("#6738E8");

  const nameId = useId();
  const descId = useId();
  const dueDateId = useId();

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "ALL" || p.status.toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const activeCount = projects.filter((p) => p.status === "Active").length;
  const completedCount = projects.filter(
    (p) => p.status === "Completed",
  ).length;
  const avgProgress =
    projects.length > 0
      ? Math.round(
          projects.reduce((acc, p) => acc + p.progress, 0) / projects.length,
        )
      : 0;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    addProject({
      name: projectName.trim(),
      description: projectDesc.trim() || "Automated workflow initiative",
      owner: "John Doe",
      status: "Active",
      dueDate: projectDueDate,
      startDate: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      color: projectColor,
    });

    setProjectName("");
    setProjectDesc("");
    setIsNewProjectOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Projects
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your automation initiatives, milestone roadmaps, and workflow
            sets.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsNewProjectOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          New Project
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Total Initiatives
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {projects.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center">
            <FolderKanban className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Active
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {activeCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#20B779]/10 text-[#20B779] flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Completed
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {completedCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Avg Completion
            </div>
            <div className="text-xl font-bold text-purple-600 mt-0.5">
              {avgProgress}%
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Search and Tabs */}
      <div className="p-4 rounded-2xl bg-surface-primary border border-border-default shadow-card flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border-default bg-surface-secondary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-default text-xs font-semibold">
          {["ALL", "ACTIVE", "COMPLETED"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === tab
                  ? "bg-surface-primary text-text-primary shadow-xs font-bold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab === "ALL"
                ? "All Projects"
                : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            className="bg-surface-primary rounded-2xl border border-border-default p-6 shadow-card hover:shadow-elevated transition flex flex-col justify-between"
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-3.5 h-3.5 rounded-md shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <h3 className="text-base font-bold text-text-primary truncate">
                    {project.name}
                  </h3>
                </div>
                <Badge
                  status={project.status === "Active" ? "ACTIVE" : "COMPLETED"}
                  size="xs"
                  showDot
                />
              </div>

              {/* Description */}
              <p className="text-xs text-text-secondary mt-2 line-clamp-2 leading-relaxed">
                {project.description}
              </p>

              {/* Progress */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-text-secondary">Progress</span>
                  <span className="text-purple-600 font-bold">
                    {project.progress}%
                  </span>
                </div>
                <div className="w-full bg-surface-secondary dark:bg-navy-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${project.progress}%`,
                      backgroundColor: project.color,
                    }}
                  />
                </div>
              </div>

              {/* Tasks & Dates */}
              <div className="mt-4 pt-4 border-t border-border-default grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-muted block text-[11px]">
                    Tasks Done
                  </span>
                  <span className="font-bold text-text-primary">
                    {project.completedTasks} / {project.tasksCount}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">
                    Target SLA
                  </span>
                  <span className="font-semibold text-text-primary">
                    {project.dueDate}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-5 pt-3 border-t border-border-default flex items-center justify-between">
              <Link
                href="/tasks"
                className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition"
              >
                <span>View Tasks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => deleteProject(project.id)}
                className="p-1.5 text-text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                title="Delete project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Project Modal */}
      <Modal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        title="Create New Project"
        description="Establish a new automation objective with milestones and team ownership."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField
            label="Project Name"
            name="p-name"
            required
            htmlFor={nameId}
          >
            <Input
              id={nameId}
              name="p-name"
              required
              placeholder="e.g. Real-Time Fraud Alert Ingestion"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField label="Description" name="p-desc" htmlFor={descId}>
            <Textarea
              id={descId}
              name="p-desc"
              rows={2}
              placeholder="Business goals, integrations, and deliverables..."
              value={projectDesc}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setProjectDesc(e.target.value)
              }
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Target Delivery Date"
              name="p-due"
              htmlFor={dueDateId}
            >
              <Input
                id={dueDateId}
                name="p-due"
                type="text"
                placeholder="e.g. Dec 25, 2026"
                value={projectDueDate}
                onChange={(e) => setProjectDueDate(e.target.value)}
              />
            </FormField>

            <FormField label="Badge Color" name="p-color">
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
                    onClick={() => setProjectColor(c)}
                    className={`w-7 h-7 rounded-lg transition-transform ${
                      projectColor === c
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
              disabled={!projectName.trim()}
            >
              Create Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
