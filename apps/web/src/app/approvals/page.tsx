"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Clock,
  UserCheck,
  RefreshCw,
  AlertCircle,
  User,
  Shield,
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { getApiBaseUrl } from "@/lib/api-client";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const [activeApproval, setActiveApproval] = useState<ApprovalItem | null>(
    null,
  );
  const [reassignApproval, setReassignApproval] = useState<ApprovalItem | null>(
    null,
  );

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
    const apiUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.append("status", statusFilter);
    if (assignedToMe) params.append("assignedToMe", "true");

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/approvals?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setApprovals(json.data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback
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
    const apiUrl = getApiBaseUrl();

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
          setDecisionError(
            "Conflict: This approval has already been decided by another user.",
          );
        } else if (res.status === 403) {
          setDecisionError(
            data.error?.message ||
              "Forbidden: You are not authorized to decide this approval.",
          );
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
      setDecisionError(err.message || "Failed to reach backend.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReassignment = async () => {
    if (!reassignApproval) return;
    setReassigning(true);
    setReassignError(null);
    const apiUrl = getApiBaseUrl();

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/approvals/${reassignApproval.id}/reassign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requiredRole: reassignRole,
            assignedUserId: reassignUserId.trim() || undefined,
            reason: reassignReason.trim() || undefined,
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
                requiredRole: reassignRole,
                assignedUserId: reassignUserId.trim() || undefined,
              }
            : a,
        ),
      );
      setReassignApproval(null);
    } catch (err: any) {
      setReassignError(err.message || "Network error submitting reassignment.");
    } finally {
      setReassigning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600 shrink-0" />
            <span>Human Approval Inbox</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review, authorize, or delegate manual workflow checkpoints and
            critical business decisions.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchApprovals}
          isLoading={loading}
          icon={
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          }
        >
          Refresh
        </Button>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {["ALL", "PENDING", "APPROVED", "REJECTED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              aria-pressed={statusFilter === tab}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition focus-ring ${
                statusFilter === tab
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800"
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={assignedToMe}
            onChange={(e) => setAssignedToMe(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus-ring"
          />
          <span>Assigned to me</span>
        </label>
      </div>

      {/* Approval List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
            <span>Loading approval requests...</span>
          </div>
        ) : approvals.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="Inbox Zero"
            description="No approval requests match your selected filters. All workflows are running smoothly."
            actionLabel="Reset Filters"
            onAction={() => {
              setStatusFilter("ALL");
              setAssignedToMe(false);
            }}
          />
        ) : (
          approvals.map((appr) => (
            <div
              key={appr.id}
              className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 dark:bg-slate-800/50 transition"
            >
              <div className="space-y-1.5 max-w-2xl min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                    {appr.title}
                  </span>
                  <Badge status={appr.status} size="sm" />
                  {appr.workflowName && (
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {appr.workflowName}
                    </span>
                  )}
                </div>

                {appr.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {appr.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <Shield className="w-3.5 h-3.5" />
                    Role:{" "}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {appr.requiredRole}
                    </strong>
                  </span>
                  {appr.assignedUserId && (
                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <User className="w-3.5 h-3.5" />
                      Assignee:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {appr.assignedUserId}
                      </strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Requested: {new Date(
                      appr.createdAt,
                    ).toLocaleDateString()}{" "}
                    at {new Date(appr.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {appr.decisionComment && (
                  <div className="mt-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 p-2.5 rounded-lg flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span>
                      <strong>Decision Note:</strong> {appr.decisionComment}
                    </span>
                  </div>
                )}
              </div>

              {appr.status === "PENDING" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReassignApproval(appr);
                      setReassignRole(appr.requiredRole);
                      setReassignUserId(appr.assignedUserId || "");
                    }}
                  >
                    Reassign
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setActiveApproval(appr);
                      setDecision("REJECT");
                      setDecisionError(null);
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setActiveApproval(appr);
                      setDecision("APPROVE");
                      setDecisionError(null);
                    }}
                  >
                    Approve
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Accessible Decision Submission Modal */}
      <Modal
        isOpen={!!activeApproval}
        onClose={() => setActiveApproval(null)}
        title={
          decision === "APPROVE"
            ? "Approve Execution Step"
            : "Reject Execution Step"
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Workflow:{" "}
            <strong>
              {activeApproval?.workflowName || activeApproval?.title}
            </strong>
          </p>

          {decisionError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{decisionError}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Decision
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDecision("APPROVE")}
                  aria-pressed={decision === "APPROVE"}
                  className={`py-2 text-xs font-semibold rounded-lg border text-center transition focus-ring ${
                    decision === "APPROVE"
                      ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50"
                  }`}
                >
                  Approve Request
                </button>
                <button
                  type="button"
                  onClick={() => setDecision("REJECT")}
                  aria-pressed={decision === "REJECT"}
                  className={`py-2 text-xs font-semibold rounded-lg border text-center transition focus-ring ${
                    decision === "REJECT"
                      ? "bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50"
                  }`}
                >
                  Reject Request
                </button>
              </div>
            </div>

            <FormField
              label="Decision Note / Audit Comment"
              name="decision-comment"
              hint="Provide audit reason, authorization reference, or explanatory feedback."
            >
              <textarea
                id="decision-comment"
                name="decision-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Provide audit reason, authorization reference, or feedback..."
                rows={3}
                className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 focus-ring text-slate-900 dark:text-slate-100"
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" onClick={() => setActiveApproval(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === "APPROVE" ? "primary" : "danger"}
              isLoading={submitting}
              onClick={submitDecision}
            >
              {`Confirm ${decision === "APPROVE" ? "Approval" : "Rejection"}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Accessible Reassign Modal */}
      <Modal
        isOpen={!!reassignApproval}
        onClose={() => setReassignApproval(null)}
        title="Reassign Approval Checkpoint"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Change assignee or required authorization tier for this workflow
            checkpoint.
          </p>

          {reassignError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{reassignError}</span>
            </div>
          )}

          <div className="space-y-3">
            <FormField label="Required Role" name="reassign-role">
              <select
                id="reassign-role"
                name="reassign-role"
                value={reassignRole}
                onChange={(e) => setReassignRole(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus-ring text-slate-900 dark:text-slate-100"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER">OWNER</option>
              </select>
            </FormField>

            <FormField
              label="Specific User ID"
              name="reassign-user"
              hint="Leave blank to allow any user with the required role to authorize."
            >
              <Input
                id="reassign-user"
                name="reassign-user"
                type="text"
                value={reassignUserId}
                onChange={(e) => setReassignUserId(e.target.value)}
                placeholder="e.g. usr_manager_123"
              />
            </FormField>

            <FormField
              label="Reassignment Reason"
              name="reassign-reason"
              hint="Audit note explaining the delegation."
            >
              <Input
                id="reassign-reason"
                name="reassign-reason"
                type="text"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="e.g. Primary approver on annual leave"
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" onClick={() => setReassignApproval(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={reassigning}
              onClick={submitReassignment}
            >
              Save Reassignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
