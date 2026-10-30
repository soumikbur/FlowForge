'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Workflow,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react';

interface DashboardStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  pendingApprovals: number;
  successRate: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkflows: 3,
    activeWorkflows: 2,
    totalExecutions: 14,
    successfulExecutions: 12,
    failedExecutions: 2,
    pendingApprovals: 1,
    successRate: 85.7
  });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    fetch(`${apiUrl}/api/v1/dashboard/stats`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && data.data) {
          setStats(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const cards = [
    { label: 'Total Workflows', value: stats.totalWorkflows, icon: Workflow, color: 'text-blue-500' },
    { label: 'Active Workflows', value: stats.activeWorkflows, icon: CheckCircle2, color: 'text-teal-500' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: PlayCircle, color: 'text-emerald-500' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: Clock, color: 'text-amber-500' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automation Overview</h1>
          <p className="text-sm text-slate-500">Monitor multi-tenant workflow health, executions, and human approvals.</p>
        </div>
        <Link
          href="/workflows"
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          <span>View Workflows</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 bg-slate-50 rounded-lg ${card.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Recent Workflow Executions</h2>
          <Link href="/executions" className="text-xs text-teal-600 hover:underline">
            View all executions →
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="font-medium text-slate-900">Order Processing Workflow #wf_101</p>
                <p className="text-xs text-slate-400">Trigger: WEBHOOK • Duration: 1.2s</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-700">
              SUCCEEDED
            </span>
          </div>

          <div className="py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div>
                <p className="font-medium text-slate-900">High-Value Order Approval #wf_102</p>
                <p className="text-xs text-slate-400">Order value $15,000 • Waiting on Manager</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-700">
              WAITING_APPROVAL
            </span>
          </div>

          <div className="py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="font-medium text-slate-900">Customer Welcome Series #wf_103</p>
                <p className="text-xs text-slate-400">Trigger: MANUAL • Steps: 4</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-700">
              SUCCEEDED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
