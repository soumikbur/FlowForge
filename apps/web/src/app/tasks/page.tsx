"use client";

import React, { useState, useId, useMemo } from "react";
import {
  CheckSquare,
  Check,
  Plus,
  Search,
  Filter,
  Trash2,
  Calendar,
  AlertTriangle,
  User,
  Clock,
  CheckCircle2,
  MoreVertical,
  X,
} from "lucide-react";
import { useProjectData, TaskItem } from "@/lib/project-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input, Textarea } from "@/components/ui/FormField";

export default function TasksPage() {
  const {
    tasks,
    projects,
    team,
    totalTasks,
    completedTasks,
    inProgressTasks,
    overdueTasks,
    addTask,
    toggleTaskCompletion,
    deleteTask,
    updateTask,
  } = useProjectData();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");

  // Modal states
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  // Form states for New Task
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskProject, setNewTaskProject] = useState(
    projects[0]?.id || "proj-1",
  );
  const [newTaskPriority, setNewTaskPriority] = useState<
    "High" | "Medium" | "Low"
  >("Medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("Nov 25, 2026");
  const [newTaskAssignee, setNewTaskAssignee] = useState(
    team[0]?.name || "John Doe",
  );
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const taskTitleId = useId();
  const taskProjectId = useId();
  const taskPriorityId = useId();
  const taskDueDateId = useId();
  const taskAssigneeId = useId();
  const taskDescId = useId();

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.projectName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "COMPLETED" && t.completed) ||
        (statusFilter === "IN_PROGRESS" &&
          !t.completed &&
          t.status === "In Progress") ||
        (statusFilter === "PENDING" &&
          !t.completed &&
          t.status === "Pending") ||
        (statusFilter === "OVERDUE" && !t.completed && t.status === "Overdue");

      const matchesPriority =
        priorityFilter === "ALL" || t.priority.toUpperCase() === priorityFilter;

      const matchesProject =
        projectFilter === "ALL" || t.projectId === projectFilter;

      return (
        matchesSearch && matchesStatus && matchesPriority && matchesProject
      );
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter, projectFilter]);

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

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage, assign, and track automated milestones across your projects.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsNewTaskOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          New Task
        </Button>
      </div>

      {/* Quick Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              All Tasks
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {totalTasks}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center">
            <CheckSquare className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Completed
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {completedTasks}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#20B779]/10 text-[#20B779] flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              In Progress
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {inProgressTasks}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#F3A72F]/10 text-[#F3A72F] flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Overdue
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {overdueTasks}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#EB5757]/10 text-[#EB5757] flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-surface-primary border border-border-default shadow-card space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tasks by title or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border-default bg-surface-secondary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border-default bg-surface-secondary text-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="ALL">All Priorities</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>

            {/* Project Filter */}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border-default bg-surface-secondary text-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 max-w-[180px] truncate"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 border-t border-border-default pt-3 overflow-x-auto text-xs">
          {[
            { id: "ALL", label: `All (${tasks.length})` },
            { id: "IN_PROGRESS", label: `In Progress (${inProgressTasks})` },
            { id: "COMPLETED", label: `Completed (${completedTasks})` },
            { id: "PENDING", label: "Pending" },
            { id: "OVERDUE", label: `Overdue (${overdueTasks})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                statusFilter === tab.id
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-surface-primary rounded-2xl border border-border-default shadow-card overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <CheckSquare className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <h3 className="text-base font-bold text-text-primary">
              No tasks match your filters
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Try adjusting your search criteria or create a new task.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-default bg-surface-secondary/40 text-text-secondary uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 w-10">Done</th>
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Assignee</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-surface-secondary/30 transition group"
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => toggleTaskCompletion(task.id)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          task.completed
                            ? "bg-[#20B779] border-[#20B779] text-white"
                            : "border-border-default hover:border-purple-500 bg-surface-primary"
                        }`}
                        title={
                          task.completed ? "Mark incomplete" : "Mark complete"
                        }
                      >
                        {task.completed && (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        )}
                      </button>
                    </td>

                    {/* Task Title */}
                    <td className="py-3 px-4">
                      <div className="max-w-md">
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className={`font-semibold hover:text-purple-600 text-left transition truncate block ${
                            task.completed
                              ? "line-through text-text-muted"
                              : "text-text-primary"
                          }`}
                        >
                          {task.title}
                        </button>
                        {task.description && (
                          <div className="text-[11px] text-text-muted truncate mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Project */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-secondary text-text-secondary font-medium text-[11px] border border-border-default">
                        {task.projectName}
                      </span>
                    </td>

                    {/* Assignee */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: task.assignee.avatarColor }}
                        >
                          {task.assignee.initials}
                        </div>
                        <span className="text-text-primary font-medium truncate max-w-[100px]">
                          {task.assignee.name}
                        </span>
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase tracking-wider ${
                          task.priority === "High"
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50"
                            : task.priority === "Medium"
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50"
                              : "bg-surface-secondary text-text-secondary border border-border-default"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs ${
                          task.status === "Overdue"
                            ? "text-[#EB5757] font-semibold"
                            : "text-text-secondary"
                        }`}
                      >
                        {task.dueDate}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <Badge
                        status={task.status}
                        label={task.status}
                        size="xs"
                        showIcon={false}
                        showDot
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 text-text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        title="Create New Task"
        description="Assign a new operational task to your team."
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
              placeholder="e.g. Set up OAuth token refresh policy"
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
                placeholder="e.g. Nov 28, 2026"
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

          <FormField label="Description" name="task-desc" htmlFor={taskDescId}>
            <Textarea
              id={taskDescId}
              name="task-desc"
              rows={2}
              placeholder="Task instructions and criteria..."
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

      {/* Task Details / Edit Modal */}
      {editingTask && (
        <Modal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          title="Task Details"
          description={`Project: ${editingTask.projectName}`}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">
                Title
              </label>
              <Input
                value={editingTask.title}
                onChange={(e) =>
                  setEditingTask({ ...editingTask, title: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Status
                </label>
                <select
                  value={editingTask.status}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      status: e.target.value as any,
                      completed: e.target.value === "Completed",
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-border-default bg-surface-primary text-text-primary text-xs"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Priority
                </label>
                <select
                  value={editingTask.priority}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      priority: e.target.value as any,
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-border-default bg-surface-primary text-text-primary text-xs"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">
                Description
              </label>
              <Textarea
                rows={2}
                value={editingTask.description || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditingTask({
                    ...editingTask,
                    description: e.target.value,
                  })
                }
              />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border-default">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  deleteTask(editingTask.id);
                  setEditingTask(null);
                }}
                className="text-rose-600 hover:text-rose-700"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTask(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    updateTask(editingTask.id, editingTask);
                    setEditingTask(null);
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
