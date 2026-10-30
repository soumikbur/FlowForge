"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Filter,
  User,
  Shield,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

interface ApprovalItem {
  id: string;
  workflowId?: string;
  workflowName?: string;
  executionId: string;
  stepId: string;
  title: string;
  description?: string;
  requiredRole: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT";
  decisionComment?: string;
  decidedById?: string;
  assignedUserId?: string;
  expiresAt?: string;
  createdAt: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [activeApproval, setActiveApproval] = useState<ApprovalItem | null>(null);
  const [reassignApproval, setReassignApproval] = useState<ApprovalItem | null>(null);

  // Decision Modal State
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Reassign Modal State
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignRole, setReassignRole] = useState("ADMIN");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.append("status", statusFilter);
    if (assignedToMe) params.append("assignedToMe", "true");

    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setApprovals(json.data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback fallback mock if network unreachable
    }

    // Default mock data if API is unseeded or running standalone
    setApprovals([
      {
        id: "appr_demo_1",
        workflowId: "wf_demo_1",
        workflowName: "Order Processing & Procurement",
        executionId: "exec_1002",
        stepId: "step_appr_1",
        title: "High-Value Order Approval: $15,000",
        description:
          "Order exceeds $10,000 threshold. Independent manager sign-off required prior to invoice generation.",
        requiredRole: "ADMIN",
        status: "PENDING",
        createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      },
      {
        id: "appr_demo_2",
        workflowId: "wf_demo_2",
        workflowName: "Employee Access Grant",
        executionId: "exec_1004",
        stepId: "step_appr_2",
        title: "Production Database Read-Only Access",
        description: "Requested by DevOps engineer for incident RCA.",
        requiredRole: "OWNER",
        status: "APPROVED",
        decisionComment: "Granted for 4 hours.",
        decidedById: "usr_owner_1",
        createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
    ]);
    setLoading(false);
  }, [statusFilter, assignedToMe]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const submitDecision = async () => {
    if (!activeApproval) return;
    setSubmitting(true);
    setDecisionError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/approvals/${activeApproval.id}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ decision, comment }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setDecisionError("Conflict: This approval has already been decided by another user.");
        } else if (res.status === 403) {
          setDecisionError(data.error?.message || "Forbidden: You are not authorized to decide this approval.");
        } else {
          setDecisionError(data.error?.message || "Failed to submit decision.");
        }
        setSubmitting(false);
        return;
      }

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === activeApproval.id
            ? {
                ...a,
                status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
                decisionComment: comment,
              }
            : a,
        ),
      );
      setActiveApproval(null);
      setComment("");
    } catch (err: any) {
      setDecisionError(err.message || "Network error submitting decision.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReassignment = async () => {
    if (!reassignApproval) return;
    setReassigning(true);
    setReassignError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/approvals/${reassignApproval.id}/reassign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            assignedUserId: reassignUserId || undefined,
            requiredRole: reassignRole as any,
            reason: reassignReason || undefined,
          }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setReassignError(data.error?.message || "Failed to reassign approval.");
        setReassigning(false);
        return;
      }

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === reassignApproval.id
            ? {
                ...a,
                assignedUserId: reassignUserId || a.assignedUserId,
                requiredRole: reassignRole,
              }
            : a,
        ),
      );
      setReassignApproval(null);
      setReassignUserId("");
      setReassignReason("");
    } catch (err: any) {
      setReassignError(err.message || "Network error reassigning approval.");
    } finally {
      setReassigning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "APPROVED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REJECTED":
        return "bg-red-100 text-red-800 border-red-200";
      case "TIMEOUT":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-teal-600" />
            Human Approval Inbox
          </h1>
          <p className="text-sm text-slate-500">
            Authorize high-value actions, exceptions, and pending business operations.
          </p>
        </div>
        <button
          onClick={fetchApprovals}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {["ALL", "PENDING", "APPROVED", "REJECTED", "TIMEOUT"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                statusFilter === tab
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={assignedToMe}
            onChange={(e) => setAssignedToMe(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <span>Assigned to me</span>
        </label>
      </div>

      {/* Approval List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            Loading approval requests...
          </div>
        ) : approvals.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Inbox Zero</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No approval requests match your selected filters. All workflows are running smoothly.
            </p>
          </div>
        ) : (
          approvals.map((appr) => (
            <div
              key={appr.id}
              className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition"
            >
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-semibold text-slate-900 text-base">
                    {appr.title}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusBadge(
                      appr.status,
                    )}`}
                  >
                    {appr.status}
                  </span>
                  {appr.workflowName && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {appr.workflowName}
                    </span>
                  )}
                </div>

                {appr.description && (
                  <p className="text-sm text-slate-600">{appr.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-slate-500">
                    <Shield className="w-3.5 h-3.5" />
                    Role: <strong className="text-slate-700">{appr.requiredRole}</strong>
                  </span>
                  {appr.assignedUserId && (
                    <span className="flex items-center gap-1 text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      Assignee: <strong className="text-slate-700">{appr.assignedUserId}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Requested: {new Date(appr.createdAt).toLocaleDateString()} at{" "}
                    {new Date(appr.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {appr.decisionComment && (
                  <div className="mt-2 text-xs bg-slate-100 border border-slate-200 text-slate-700 p-2.5 rounded-lg flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Decision Note:</strong> {appr.decisionComment}
                    </span>
                  </div>
                )}
              </div>

              {appr.status === "PENDING" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setReassignApproval(appr);
                      setReassignRole(appr.requiredRole);
                      setReassignUserId(appr.assignedUserId || "");
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition"
                  >
                    Reassign
                  </button>
                  <button
                    onClick={() => {
                      setActiveApproval(appr);
                      setDecision("REJECT");
                      setDecisionError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      setActiveApproval(appr);
                      setDecision("APPROVE");
                      setDecisionError(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Decision Submission Modal */}
      {activeApproval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {decision === "APPROVE" ? "Approve Execution Step" : "Reject Execution Step"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Workflow: {activeApproval.workflowName || activeApproval.title}
                </p>
              </div>
              <button
                onClick={() => setActiveApproval(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {decisionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Decision
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision("APPROVE")}
                    className={`py-2 text-xs font-semibold rounded-lg border text-center transition ${
                      decision === "APPROVE"
                        ? "bg-teal-50 border-teal-500 text-teal-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Approve Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision("REJECT")}
                    className={`py-2 text-xs font-semibold rounded-lg border text-center transition ${
                      decision === "REJECT"
                        ? "bg-red-50 border-red-500 text-red-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Reject Request
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Decision Note / Audit Comment (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Provide audit reason, authorization reference, or feedback..."
                  rows={3}
                  className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveApproval(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitDecision}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition shadow-sm ${
                  decision === "APPROVE"
                    ? "bg-teal-600 hover:bg-teal-700"
                    : "bg-red-600 hover:bg-red-700"
                } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {submitting ? "Submitting..." : `Confirm ${decision === "APPROVE" ? "Approval" : "Rejection"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignApproval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Reassign Approval
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Change assignee or required authorization tier
                </p>
              </div>
              <button
                onClick={() => setReassignApproval(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {reassignError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{reassignError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Required Role
                </label>
                <select
                  value={reassignRole}
                  onChange={(e) => setReassignRole(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specific User ID (Optional)
                </label>
                <input
                  type="text"
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  placeholder="e.g. usr_manager_123"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reassignment Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="e.g. Primary approver on annual leave"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReassignApproval(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reassigning}
                onClick={submitReassignment}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition shadow-sm"
              >
                {reassigning ? "Saving..." : "Save Reassignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
