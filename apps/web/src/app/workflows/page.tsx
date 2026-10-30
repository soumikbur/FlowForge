"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Workflow, ExternalLink, Play, CheckCircle, History } from "lucide-react";

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  publishedVersionId?: string;
  updatedAt: string;
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
    },
    {
      id: "wf_demo_2",
      name: "Customer Welcome Sequence",
      description:
        "Trigger -> Send Welcome Email -> Delay 24h -> Followup HTTP webhook.",
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
    },
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    fetch(`${apiUrl}/api/v1/workflows`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && data.data && data.data.length > 0) {
          setWorkflows(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/v1/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newTitle, description: newDesc }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setWorkflows([data.data, ...workflows]);
      }
    } catch {
      // Local fallback
      const newItem: WorkflowItem = {
        id: `wf_${Date.now()}`,
        name: newTitle,
        description: newDesc,
        status: "DRAFT",
        updatedAt: new Date().toISOString(),
      };
      setWorkflows([newItem, ...workflows]);
    }

    setNewTitle("");
    setNewDesc("");
    setShowCreateModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflows</h1>
          <p className="text-sm text-slate-500">
            Create, configure, and publish business automations.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Workflow</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-200">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="p-6 flex items-center justify-between hover:bg-slate-50 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <Workflow className="w-5 h-5 text-teal-600" />
                  <span className="font-semibold text-slate-900">
                    {wf.name}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      wf.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {wf.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500 pl-8">
                  {wf.description || "No description provided."}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/workflows/${wf.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Versions & Deploy</span>
                </Link>
                <Link
                  href={`/workflows/${wf.id}/builder`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                >
                  <span>Open Builder</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Create New Workflow
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Workflow Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Employee Onboarding"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  placeholder="Describe the operational process..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-medium"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
