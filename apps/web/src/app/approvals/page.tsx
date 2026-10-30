'use client';

import React, { useEffect, useState } from 'react';
import { CheckSquare, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ApprovalItem {
  id: string;
  title: string;
  description?: string;
  requiredRole: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decisionComment?: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([
    {
      id: 'appr_demo_1',
      title: 'High-Value Order Approval: $15,000',
      description: 'Order exceeds $10,000 threshold. Verification needed before notifying client.',
      requiredRole: 'ADMIN',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    }
  ]);
  const [activeApproval, setActiveApproval] = useState<ApprovalItem | null>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [comment, setComment] = useState('');

  const submitDecision = async () => {
    if (!activeApproval) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    try {
      await fetch(`${apiUrl}/api/v1/approvals/${activeApproval.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, comment })
      });
    } catch {}

    setApprovals((prev) =>
      prev.map((a) =>
        a.id === activeApproval.id
          ? { ...a, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decisionComment: comment }
          : a
      )
    );

    setActiveApproval(null);
    setComment('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Human Approval Inbox</h1>
        <p className="text-sm text-slate-500">
          Authorize high-value actions, exceptions, and pending business operations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {approvals.map((appr) => (
          <div key={appr.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-teal-600" />
                <span className="font-semibold text-slate-900">{appr.title}</span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    appr.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-800'
                      : appr.status === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {appr.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 pl-8">{appr.description}</p>
              {appr.decisionComment && (
                <p className="text-xs text-slate-400 pl-8 italic">Comment: {appr.decisionComment}</p>
              )}
            </div>

            {appr.status === 'PENDING' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setActiveApproval(appr);
                    setDecision('REJECT');
                  }}
                  className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs font-medium transition"
                >
                  Reject
                </button>
                <button
                  onClick={() => {
                    setActiveApproval(appr);
                    setDecision('APPROVE');
                  }}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-medium shadow-sm transition"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {activeApproval && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {decision === 'APPROVE' ? 'Confirm Approval' : 'Reject Request'}
            </h3>
            <p className="text-sm text-slate-600">{activeApproval.title}</p>

            <div>
              <label className="block text-xs font-medium text-slate-700">Audit Comment / Reason</label>
              <textarea
                placeholder="Optional notes for the audit trail..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveApproval(null)}
                className="px-3 py-2 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecision}
                className={`px-4 py-2 rounded-md text-xs font-medium text-white ${
                  decision === 'APPROVE' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirm {decision === 'APPROVE' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
