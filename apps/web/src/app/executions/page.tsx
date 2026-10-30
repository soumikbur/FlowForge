'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlayCircle, Clock, ExternalLink } from 'lucide-react';

interface ExecutionRow {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  status: string;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([
    {
      id: 'exec_1001',
      workflowId: 'wf_demo_1',
      workflowName: 'Order Processing & Manager Approval',
      triggerType: 'WEBHOOK',
      status: 'SUCCEEDED',
      retryCount: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString()
    },
    {
      id: 'exec_1002',
      workflowId: 'wf_demo_1',
      workflowName: 'Order Processing & Manager Approval',
      triggerType: 'WEBHOOK',
      status: 'WAITING_APPROVAL',
      retryCount: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      id: 'exec_1003',
      workflowId: 'wf_demo_2',
      workflowName: 'Customer Welcome Sequence',
      triggerType: 'MANUAL',
      status: 'SUCCEEDED',
      retryCount: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 59).toISOString()
    }
  ]);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    fetch(`${apiUrl}/api/v1/executions`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && data.data && data.data.length > 0) {
          setExecutions(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return 'bg-emerald-100 text-emerald-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'WAITING_APPROVAL':
        return 'bg-amber-100 text-amber-800';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Execution History</h1>
        <p className="text-sm text-slate-500">Inspect real-time execution logs, step transitions, and failure diagnostics.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-600 font-semibold">
            <tr>
              <th className="px-6 py-3 text-left">Execution ID</th>
              <th className="px-6 py-3 text-left">Workflow</th>
              <th className="px-6 py-3 text-left">Trigger</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Timestamp</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executions.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 font-mono text-xs text-slate-700">{e.id}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{e.workflowName || e.workflowId}</td>
                <td className="px-6 py-4 text-slate-500">{e.triggerType}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(e.status)}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/executions/${e.id}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    <span>View Logs</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
