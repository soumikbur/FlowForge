"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlayCircle,
  RotateCcw,
  StopCircle,
  RefreshCw,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
} from "lucide-react";

interface StepRecord {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: string;
  inputPayload?: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  attempt: number;
}

interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflowName?: string;
  workflowVersionId?: string;
  status: string;
  triggerType: string;
  triggerPayload?: Record<string, unknown>;
  currentNodeId?: string;
  retryCount: number;
  errorDetails?: {
    failedNodeId?: string;
    message?: string;
    attempts?: number;
    cancellationReason?: string;
  };
  createdAt: string;
  completedAt?: string;
  steps: StepRecord[];
  approvals?: Array<{
    id: string;
    title: string;
    status: string;
    requiredRole: string;
    assignedUserId?: string;
    decisionComment?: string;
  }>;
}

export default function ExecutionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const isTerminal = (status: string) => {
    return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
  };

  const fetchDetail = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      const res = await fetch(`${apiUrl}/api/v1/executions/${params.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDetail(json.data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Default mock data if server unseeded
    setDetail({
      id: params.id,
      workflowId: "wf_demo_1",
      workflowName: "Order Processing & Procurement",
      status: "WAITING_APPROVAL",
      triggerType: "WEBHOOK",
      triggerPayload: {
        orderId: "ORD-9821",
        orderValue: 15000,
        customerEmail: "vip@client.com",
      },
      retryCount: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      steps: [
        {
          id: "s1",
          nodeId: "node_trigger",
          nodeType: "TRIGGER",
          nodeName: "Order Webhook Trigger",
          status: "COMPLETED",
          outputPayload: { orderId: "ORD-9821", orderValue: 15000 },
          startedAt: new Date(Date.now() - 5000).toISOString(),
          completedAt: new Date(Date.now() - 4800).toISOString(),
          attempt: 1,
        },
        {
          id: "s2",
          nodeId: "node_condition",
          nodeType: "CONDITION",
          nodeName: "Check Order Value > $10,000",
          status: "COMPLETED",
          outputPayload: {
            result: true,
            evaluatedExpression: "trigger.payload.orderValue > 10000",
          },
          startedAt: new Date(Date.now() - 4800).toISOString(),
          completedAt: new Date(Date.now() - 4750).toISOString(),
          attempt: 1,
        },
        {
          id: "s3",
          nodeId: "node_approval",
          nodeType: "APPROVAL",
          nodeName: "Manager Approval Required",
          status: "WAITING",
          startedAt: new Date(Date.now() - 4750).toISOString(),
          attempt: 1,
        },
      ],
      approvals: [
        {
          id: "appr_1001",
          title: "Manager Approval Required",
          status: "PENDING",
          requiredRole: "ADMIN",
        },
      ],
    });
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Dynamic Polling: poll while non-terminal
  useEffect(() => {
    if (detail && !isTerminal(detail.status)) {
      pollingRef.current = setInterval(() => {
        fetchDetail();
      }, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [detail, fetchDetail]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const handleCancelExecution = async () => {
    if (!window.confirm("Are you sure you want to cancel this workflow execution?")) return;
    setActionInProgress(true);
    setActionMessage(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/v1/executions/${params.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Manually cancelled from execution diagnostics UI" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: "success", text: "Execution was cancelled successfully." });
        fetchDetail();
      } else {
        setActionMessage({ type: "error", text: data.error?.message || "Failed to cancel execution." });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Network error cancelling execution." });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRetryExecution = async (stepId?: string) => {
    setActionInProgress(true);
    setActionMessage(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/v1/executions/${params.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          stepId,
          reason: stepId ? `Manual step retry on ${stepId}` : "Manual restart from failed node",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: "success", text: "Execution retry queued successfully." });
        fetchDetail();
      } else {
        setActionMessage({ type: "error", text: data.error?.message || "Failed to retry execution." });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Network error retrying execution." });
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCEEDED":
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "FAILED":
        return "bg-red-100 text-red-800 border-red-200";
      case "WAITING_APPROVAL":
      case "WAITING":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "WAITING_DELAY":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "RUNNING":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "RETRYING":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "CANCELLED":
      case "SKIPPED":
        return "bg-slate-200 text-slate-700 border-slate-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  if (loading || !detail) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
        Loading execution diagnostics...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Back button and page title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/executions"
            className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg border border-slate-200 bg-white shadow-sm transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-mono">
                {detail.id}
              </h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusBadge(
                  detail.status,
                )}`}
              >
                {detail.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Workflow: <strong>{detail.workflowName || detail.workflowId}</strong>
            </p>
          </div>
        </div>

        {/* Execution Control Actions */}
        <div className="flex items-center gap-2">
          {!isTerminal(detail.status) && (
            <button
              onClick={handleCancelExecution}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition shadow-sm"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Cancel Execution
            </button>
          )}

          {detail.status === "FAILED" && (
            <button
              onClick={() => handleRetryExecution()}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Execution
            </button>
          )}

          <button
            onClick={fetchDetail}
            className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm"
            title="Refresh Diagnostics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            actionMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Human Approval Pending Banner */}
      {detail.status === "WAITING_APPROVAL" && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Workflow Paused: Human Approval Required
              </h4>
              <p className="text-xs text-amber-700">
                This workflow execution requires an authorized decision before proceeding.
              </p>
            </div>
          </div>
          <Link
            href="/approvals"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap"
          >
            Go to Approval Inbox
          </Link>
        </div>
      )}

      {/* Error Details Diagnostics Banner */}
      {detail.errorDetails && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-red-900 font-semibold text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Failure Diagnostics</span>
          </div>
          <p className="text-xs text-red-800 font-mono bg-white p-2.5 rounded border border-red-100">
            {detail.errorDetails.message || "Unknown execution runtime failure"}
          </p>
          {detail.errorDetails.failedNodeId && (
            <p className="text-xs text-red-700">
              Failed at Node: <strong className="font-mono">{detail.errorDetails.failedNodeId}</strong>
            </p>
          )}
        </div>
      )}

      {/* Overview & Metadata Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">Trigger Type</span>
            <span className="font-semibold text-slate-800 font-mono">
              {detail.triggerType}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Retries</span>
            <span className="font-semibold text-slate-800 font-mono">
              {detail.retryCount}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Started</span>
            <span className="text-slate-700">
              {new Date(detail.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Completed</span>
            <span className="text-slate-700">
              {detail.completedAt
                ? new Date(detail.completedAt).toLocaleTimeString()
                : "In progress"}
            </span>
          </div>
        </div>

        {detail.triggerPayload && Object.keys(detail.triggerPayload).length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Initial Trigger Payload
            </h4>
            <pre className="bg-slate-900 text-teal-300 p-3 rounded-lg text-xs font-mono overflow-x-auto">
              {JSON.stringify(detail.triggerPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Chronological Step Timeline */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-600" />
            Chronological Step Timeline ({detail.steps.length})
          </h3>
          <span className="text-xs text-slate-400">
            Executed in deterministic topological order
          </span>
        </div>

        <div className="space-y-3">
          {detail.steps.map((step, idx) => (
            <div
              key={step.id}
              className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
            >
              <div
                onClick={() => toggleStep(step.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-slate-400">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        {step.nodeName}
                      </span>
                      <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                        {step.nodeType}
                      </span>
                      {step.attempt > 1 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-mono font-bold">
                          Attempt {step.attempt}
                        </span>
                      )}
                    </div>
                    {step.errorMessage && (
                      <p className="text-xs text-red-600 mt-0.5 font-mono">
                        {step.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                      step.status,
                    )}`}
                  >
                    {step.status}
                  </span>

                  {step.status === "FAILED" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryExecution(step.id);
                      }}
                      className="px-2 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition"
                    >
                      Retry Step
                    </button>
                  )}

                  {expandedSteps[step.id] ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {expandedSteps[step.id] && (
                <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                  {step.inputPayload && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">
                        Input Context:
                      </p>
                      <pre className="bg-slate-900 text-slate-200 p-2.5 rounded text-xs font-mono overflow-x-auto max-h-48">
                        {JSON.stringify(step.inputPayload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {step.outputPayload && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">
                        Output Result:
                      </p>
                      <pre className="bg-slate-900 text-teal-300 p-2.5 rounded text-xs font-mono overflow-x-auto max-h-48">
                        {JSON.stringify(step.outputPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
