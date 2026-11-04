"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Workflow,
  ExternalLink,
  History,
  Users,
  User,
  Share2,
  Upload,
  Search,
  Trash2,
  Filter,
  Layers,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { ImportWorkflowModal } from "@/components/workflow/ImportWorkflowModal";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input, Textarea } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getApiBaseUrl } from "@/lib/api-client";

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  publishedVersionId?: string;
  draftRevision?: number;
  updatedAt: string;
  createdById?: string;
  owner?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  collaborators?: Array<{
    userId: string;
    role: string;
  }>;
  accessLevel?: "OWNER" | "MAINTAINER" | "EDITOR" | "VIEWER";
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    {
      id: "wf_demo_1",
      name: "Order Processing & Manager Approval",
      description:
        "Webhook trigger -> Check order value > $10,000 -> Manager approval -> Email notification.",
      status: "ACTIVE",
      publishedVersionId: "ver_1",
      updatedAt: new Date().toISOString(),
      accessLevel: "OWNER",
    },
    {
      id: "wf_demo_2",
      name: "Customer Welcome Sequence",
      description:
        "Trigger -> Send Welcome Email -> Delay 24h -> Followup HTTP webhook.",
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
      accessLevel: "EDITOR",
    },
  ]);
  const [filter, setFilter] = useState<
    "all" | "created_by_me" | "shared_with_me"
  >("all");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(
    null,
  );
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchWorkflows = () => {
    const apiUrl = getApiBaseUrl();
    fetch(`${apiUrl}/api/v1/workflows?filter=${filter}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && Array.isArray(data.data)) {
          setWorkflows(data.data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchWorkflows();
  }, [filter]);

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      // Status filter
      if (statusFilter !== "ALL" && wf.status !== statusFilter) return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        wf.name.toLowerCase().includes(query) ||
        (wf.description && wf.description.toLowerCase().includes(query)) ||
        wf.status.toLowerCase().includes(query)
      );
    });
  }, [workflows, searchQuery, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    const apiUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${apiUrl}/api/v1/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newTitle.trim(),
          description: newDesc.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setWorkflows([data.data, ...workflows]);
      }
    } catch {
      // Local fallback
      const newItem: WorkflowItem = {
        id: `wf_${Date.now()}`,
        name: newTitle.trim(),
        description: newDesc.trim(),
        status: "DRAFT",
        updatedAt: new Date().toISOString(),
        accessLevel: "OWNER",
      };
      setWorkflows([newItem, ...workflows]);
    } finally {
      setIsSubmitting(false);
      setNewTitle("");
      setNewDesc("");
      setShowCreateModal(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!workflowToDelete) return;
    const apiUrl = getApiBaseUrl();

    try {
      await fetch(`${apiUrl}/api/v1/workflows/${workflowToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setWorkflows(workflows.filter((w) => w.id !== workflowToDelete.id));
    setWorkflowToDelete(null);
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Workflows Directory</span>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
              {filteredWorkflows.length} total
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Authoritative workflow catalog, environment deployments, and visual
            builder canvases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            icon={
              <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            }
          >
            Import JSON
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Workflow
          </Button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        {/* Ownership Tabs */}
        <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filter === "all"
                ? "bg-indigo-50 text-indigo-700 font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            All Workflows
          </button>
          <button
            onClick={() => setFilter("created_by_me")}
            aria-pressed={filter === "created_by_me"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filter === "created_by_me"
                ? "bg-indigo-50 text-indigo-700 font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Created by Me</span>
          </button>
          <button
            onClick={() => setFilter("shared_with_me")}
            aria-pressed={filter === "shared_with_me"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filter === "shared_with_me"
                ? "bg-indigo-50 text-indigo-700 font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Shared with Me</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus-ring"
            aria-label="Filter by workflow status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {/* Instant Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="workflow-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus-ring text-slate-900 dark:text-slate-100 placeholder-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Workflows High-Density List */}
      {filteredWorkflows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title={searchQuery ? "No matching workflows" : "No workflows found"}
          description={
            searchQuery
              ? `No workflows matched "${searchQuery}". Clear your search query or create a new automation.`
              : "Get started by creating your first automated business workflow or import an existing definition."
          }
          actionLabel="Create Workflow"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="bg-surface-primary rounded-2xl border border-border-default shadow-card overflow-hidden">
          <div className="divide-y divide-border-default">
            {filteredWorkflows.map((wf) => (
              <div
                key={wf.id}
                className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-surface-secondary/40 transition group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 shrink-0">
                      <Workflow className="w-4 h-4" />
                    </div>
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="font-bold text-text-primary hover:text-purple-600 transition truncate text-sm"
                    >
                      {wf.name}
                    </Link>
                    <Badge status={wf.status} size="xs" showDot />
                    {wf.publishedVersionId && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        deployed
                      </span>
                    )}
                    {wf.accessLevel && (
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded bg-surface-secondary text-text-secondary border border-border-default">
                        {wf.accessLevel}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-text-secondary sm:pl-8 line-clamp-2">
                    {wf.description || "No description provided."}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-text-muted sm:pl-8 pt-0.5">
                    {wf.owner && (
                      <span>
                        Owner:{" "}
                        {wf.owner.firstName
                          ? `${wf.owner.firstName} ${wf.owner.lastName || ""}`
                          : wf.owner.email}
                      </span>
                    )}
                    <span>
                      Updated {new Date(wf.updatedAt).toLocaleDateString()}
                    </span>
                    {wf.collaborators && wf.collaborators.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-text-secondary font-medium">
                        <Users className="w-3 h-3 text-text-muted" />
                        {wf.collaborators.length} collaborator
                        {wf.collaborators.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-center shrink-0">
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border-default bg-surface-primary hover:bg-surface-secondary rounded-lg text-xs font-medium text-text-primary transition shadow-xs focus-ring"
                  >
                    <History className="w-3.5 h-3.5 text-text-muted" />
                    <span>Versions</span>
                  </Link>

                  <Link
                    href={`/workflows/${wf.id}/builder`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition shadow-xs focus-ring"
                  >
                    <span>Open Builder</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => setWorkflowToDelete(wf)}
                    aria-label={`Delete workflow ${wf.name}`}
                    title="Delete workflow"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition focus-ring"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accessible Create Workflow Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Workflow"
        description="Initialize a new business automation draft with node canvas and version control."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField
            label="Workflow Name"
            name="workflow-name"
            required
            hint="A clear, identifiable title for this automation."
          >
            <Input
              id="workflow-name"
              name="workflow-name"
              type="text"
              required
              placeholder="e.g. Employee Onboarding & Account Provisioning"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label="Description"
            name="workflow-desc"
            hint="Summarize the triggers, conditions, and external integrations."
          >
            <Textarea
              id="workflow-desc"
              name="workflow-desc"
              placeholder="Describe the operational process..."
              value={newDesc}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewDesc(e.target.value)
              }
              rows={3}
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              disabled={!newTitle.trim()}
            >
              Create Draft
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Deletion */}
      <ConfirmDialog
        isOpen={!!workflowToDelete}
        onClose={() => setWorkflowToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${workflowToDelete?.name}"? All associated trigger bindings and execution histories will be affected.`}
        confirmLabel="Delete Workflow"
        isDestructive
      />

      {/* Import Workflow Modal */}
      <ImportWorkflowModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => fetchWorkflows()}
      />
    </div>
  );
}
