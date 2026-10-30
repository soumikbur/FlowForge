"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlayCircle,
} from "lucide-react";

interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  steps: Array<{
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
  }>;
}

export default function ExecutionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, setDetail] = useState<ExecutionDetail>({
    id: params.id,
    workflowId: "wf_demo_1",
    workflowName: "Order Processing & Manager Approval",
    status: "WAITING_APPROVAL",
    triggerType: "WEBHOOK",
    triggerPayload: {
      orderId: "ORD-9821",
      orderValue: 15000,
      customerEmail: "vip@client.com",
    },
    createdAt: new Date().toISOString(),
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
      },
      {
        id: "s3",
        nodeId: "node_approval",
        nodeType: "APPROVAL",
        nodeName: "Manager Approval Required",
        status: "WAITING",
        startedAt: new Date(Date.now() - 4750).toISOString(),
      },
    ],
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/executions"
          className="text-slate-500 hover:text-slate-800 p-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Execution Diagnostics: {params.id}
          </h1>
          <p className="text-xs text-slate-500">
            Workflow: {detail.workflowName}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-100 text-amber-800">
              {detail.status}
            </span>
            <span className="text-xs text-slate-500">
              Trigger: {detail.triggerType}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Started: {new Date(detail.createdAt).toLocaleTimeString()}
          </span>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Trigger Payload
          </h4>
          <pre className="bg-slate-900 text-teal-300 p-3 rounded-lg text-xs font-mono overflow-x-auto">
            {JSON.stringify(detail.triggerPayload, null, 2)}
          </pre>
        </div>
      </div>

      {/* Step Timeline */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-900">Step Timeline</h3>

        <div className="space-y-4">
          {detail.steps.map((step, idx) => (
            <div
              key={step.id}
              className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-500">
                    #{idx + 1}
                  </span>
                  <span className="font-semibold text-sm text-slate-900">
                    {step.nodeName}
                  </span>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                    {step.nodeType}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    step.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {step.status}
                </span>
              </div>

              {step.outputPayload && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    Output:
                  </p>
                  <pre className="bg-slate-900 text-slate-200 p-2.5 rounded text-xs font-mono overflow-x-auto">
                    {JSON.stringify(step.outputPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
