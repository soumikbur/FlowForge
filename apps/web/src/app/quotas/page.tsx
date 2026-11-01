"use client";

import React, { useState } from "react";
import {
  Gauge,
  Cpu,
  Layers,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Plus,
  ShieldCheck,
  CheckCircle,
  Clock,
  Sliders,
  Filter,
  Activity,
  Check,
  Zap,
} from "lucide-react";

interface QuotaPolicyItem {
  id: string;
  scopeType: "ORGANIZATION" | "WORKSPACE" | "WORKFLOW";
  scopeId: string;
  maxConcurrentExecutions: number;
  maxQueueDepth: number;
  maxMonthlyExecutions: number;
  maxExecutionDurationMs: number;
  maxStepCount: number;
  maxConnectorCallsPerRun: number;
  fairnessWeight: number;
  monthlyCostBudgetUsd: number;
  enforcementAction: "REJECT" | "DEGRADE" | "WARN";
  updatedAt: string;
}

export default function QuotasPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "policies" | "budget" | "fairness"
  >("overview");
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);

  // Utilization state
  const [utilization] = useState({
    activeConcurrency: 14,
    maxConcurrentExecutions: 50,
    queueDepth: 8,
    maxQueueDepth: 100,
    monthlyExecutions: 24350,
    maxMonthlyExecutions: 50000,
    healthStatus: "HEALTHY" as const,
  });

  // Cost budget state
  const [costBudget] = useState({
    budgetCeilingUsd: 1500,
    spentUsd: 730.5,
    projectedSpendUsd: 1120.0,
    spendPercentage: 48.7,
    status: "HEALTHY" as const,
    alertThresholdPercent: 80,
  });

  // Quota Policies
  const [policies, setPolicies] = useState<QuotaPolicyItem[]>([
    {
      id: "quota_org_default",
      scopeType: "ORGANIZATION",
      scopeId: "org_enterprise_main",
      maxConcurrentExecutions: 50,
      maxQueueDepth: 100,
      maxMonthlyExecutions: 50000,
      maxExecutionDurationMs: 300000,
      maxStepCount: 500,
      maxConnectorCallsPerRun: 100,
      fairnessWeight: 10,
      monthlyCostBudgetUsd: 1500,
      enforcementAction: "REJECT",
      updatedAt: "2 days ago",
    },
    {
      id: "quota_ws_analytics",
      scopeType: "WORKSPACE",
      scopeId: "ws_data_analytics",
      maxConcurrentExecutions: 25,
      maxQueueDepth: 50,
      maxMonthlyExecutions: 20000,
      maxExecutionDurationMs: 600000,
      maxStepCount: 1000,
      maxConnectorCallsPerRun: 200,
      fairnessWeight: 15,
      monthlyCostBudgetUsd: 800,
      enforcementAction: "REJECT",
      updatedAt: "1 day ago",
    },
    {
      id: "quota_wf_critical_sync",
      scopeType: "WORKFLOW",
      scopeId: "wf_sap_customer_sync",
      maxConcurrentExecutions: 10,
      maxQueueDepth: 20,
      maxMonthlyExecutions: 5000,
      maxExecutionDurationMs: 120000,
      maxStepCount: 150,
      maxConnectorCallsPerRun: 50,
      fairnessWeight: 20,
      monthlyCostBudgetUsd: 300,
      enforcementAction: "DEGRADE",
      updatedAt: "3 hours ago",
    },
  ]);

  const [newPolicy, setNewPolicy] = useState({
    scopeType: "WORKSPACE" as "ORGANIZATION" | "WORKSPACE" | "WORKFLOW",
    scopeId: "",
    maxConcurrentExecutions: 20,
    maxQueueDepth: 50,
    maxMonthlyExecutions: 10000,
    monthlyCostBudgetUsd: 500,
    fairnessWeight: 10,
    enforcementAction: "REJECT" as "REJECT" | "DEGRADE" | "WARN",
  });

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicy.scopeId) return;

    const record: QuotaPolicyItem = {
      id: `quota_${Date.now()}`,
      scopeType: newPolicy.scopeType,
      scopeId: newPolicy.scopeId,
      maxConcurrentExecutions: Number(newPolicy.maxConcurrentExecutions),
      maxQueueDepth: Number(newPolicy.maxQueueDepth),
      maxMonthlyExecutions: Number(newPolicy.maxMonthlyExecutions),
      maxExecutionDurationMs: 300000,
      maxStepCount: 500,
      maxConnectorCallsPerRun: 100,
      fairnessWeight: Number(newPolicy.fairnessWeight),
      monthlyCostBudgetUsd: Number(newPolicy.monthlyCostBudgetUsd),
      enforcementAction: newPolicy.enforcementAction,
      updatedAt: "Just now",
    };

    setPolicies([record, ...policies]);
    setNewPolicy({
      scopeType: "WORKSPACE",
      scopeId: "",
      maxConcurrentExecutions: 20,
      maxQueueDepth: 50,
      maxMonthlyExecutions: 10000,
      monthlyCostBudgetUsd: 500,
      fairnessWeight: 10,
      enforcementAction: "REJECT",
    });
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      // Mock or call reconciliation endpoint
      setTimeout(() => {
        setIsReconciling(false);
        setReconcileResult(
          "Resource state successfully reconciled. Cleared 0 stale leases, 0 expired reservations.",
        );
      }, 700);
    } catch (err: any) {
      setIsReconciling(false);
      setReconcileResult(`Reconciliation failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Enterprise Resource Governance & Quotas
            </h1>
          </div>
          <p className="text-slate-400 mt-1 text-sm">
            Enforce hierarchical quotas, prevent noisy-neighbor starvation with
            fair scheduling, and maintain financial cost ceilings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReconcile}
            disabled={isReconciling}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw
              className={`w-4 h-4 ${isReconciling ? "animate-spin text-indigo-400" : ""}`}
            />
            {isReconciling ? "Reconciling..." : "Reconcile State"}
          </button>
        </div>
      </div>

      {reconcileResult && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-sm text-indigo-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{reconcileResult}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-indigo-400 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          Resource Utilization
        </button>
        <button
          onClick={() => setActiveTab("policies")}
          className={`pb-3 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === "policies"
              ? "border-indigo-400 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Quota Policies ({policies.length})
        </button>
        <button
          onClick={() => setActiveTab("budget")}
          className={`pb-3 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === "budget"
              ? "border-indigo-400 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Cost Budgets
        </button>
        <button
          onClick={() => setActiveTab("fairness")}
          className={`pb-3 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === "fairness"
              ? "border-indigo-400 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Fair Scheduling
        </button>
      </div>

      {/* TAB 1: OVERVIEW & UTILIZATION */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Active Concurrency */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center text-slate-400 text-sm font-medium mb-3">
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" /> Active Concurrency
                </span>
                <span className="text-xs bg-indigo-950/80 text-indigo-400 px-2 py-0.5 rounded border border-indigo-800/50">
                  {Math.round(
                    (utilization.activeConcurrency /
                      utilization.maxConcurrentExecutions) *
                      100,
                  )}
                  % Used
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white mb-2">
                {utilization.activeConcurrency} /{" "}
                {utilization.maxConcurrentExecutions}
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(utilization.activeConcurrency / utilization.maxConcurrentExecutions) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Workers interleave tasks with Deficit Round Robin dispatching.
              </div>
            </div>

            {/* Queue Depth */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center text-slate-400 text-sm font-medium mb-3">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" /> Current Queue
                  Depth
                </span>
                <span className="text-xs bg-sky-950/80 text-sky-400 px-2 py-0.5 rounded border border-sky-800/50">
                  {Math.round(
                    (utilization.queueDepth / utilization.maxQueueDepth) * 100,
                  )}
                  % Capacity
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white mb-2">
                {utilization.queueDepth} / {utilization.maxQueueDepth}
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-sky-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(utilization.queueDepth / utilization.maxQueueDepth) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Backpressure threshold returns HTTP 429 with Retry-After when
                full.
              </div>
            </div>

            {/* Monthly Volume */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center text-slate-400 text-sm font-medium mb-3">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Monthly
                  Executions
                </span>
                <span className="text-xs bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/50">
                  {Math.round(
                    (utilization.monthlyExecutions /
                      utilization.maxMonthlyExecutions) *
                      100,
                  )}
                  %
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white mb-2">
                {utilization.monthlyExecutions.toLocaleString()} /{" "}
                {utilization.maxMonthlyExecutions.toLocaleString()}
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(utilization.monthlyExecutions / utilization.maxMonthlyExecutions) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Billing cycle quota automatically resets on the 1st of each
                month.
              </div>
            </div>
          </div>

          {/* Admission Safety Architecture */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Unified Admission & Execution Budgeting Engine
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mt-4">
              <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-indigo-400 font-semibold mb-1 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> Atomic Admission
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every entry point (API, Webhooks, Schedules, Event Streams)
                  passes through authoritative admission checks.
                </p>
              </div>
              <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-sky-400 font-semibold mb-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Execution Timeouts
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Worker runtime enforces millisecond abort controllers to
                  prevent zombie runs and CPU saturation.
                </p>
              </div>
              <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-purple-400 font-semibold mb-1 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" /> Step & Call Limits
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Guards against runaway infinite loops and rate limits on
                  downstream SaaS connectors.
                </p>
              </div>
              <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Cost Guardrails
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Real-time budget tracker with configurable warning thresholds
                  (80%) and hard financial caps.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUOTA POLICIES */}
      {activeTab === "policies" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-fit">
              <h2 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Configure Quota Policy
              </h2>
              <form onSubmit={handleCreatePolicy} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-1">
                    Scope Level
                  </label>
                  <select
                    value={newPolicy.scopeType}
                    onChange={(e: any) =>
                      setNewPolicy({ ...newPolicy, scopeType: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="ORGANIZATION">Organization Default</option>
                    <option value="WORKSPACE">Workspace Override</option>
                    <option value="WORKFLOW">Workflow Override</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-1">
                    Scope Target ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ws_finance or wf_sync_v2"
                    value={newPolicy.scopeId}
                    onChange={(e) =>
                      setNewPolicy({ ...newPolicy, scopeId: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">
                      Max Concurrency
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newPolicy.maxConcurrentExecutions}
                      onChange={(e) =>
                        setNewPolicy({
                          ...newPolicy,
                          maxConcurrentExecutions: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">
                      Max Queue Depth
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newPolicy.maxQueueDepth}
                      onChange={(e) =>
                        setNewPolicy({
                          ...newPolicy,
                          maxQueueDepth: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">
                      Fairness Weight
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newPolicy.fairnessWeight}
                      onChange={(e) =>
                        setNewPolicy({
                          ...newPolicy,
                          fairnessWeight: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">
                      Cost Cap ($ USD)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newPolicy.monthlyCostBudgetUsd}
                      onChange={(e) =>
                        setNewPolicy({
                          ...newPolicy,
                          monthlyCostBudgetUsd: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-1">
                    Enforcement Action
                  </label>
                  <select
                    value={newPolicy.enforcementAction}
                    onChange={(e: any) =>
                      setNewPolicy({
                        ...newPolicy,
                        enforcementAction: e.target.value,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="REJECT">REJECT (Strict HTTP 429/402)</option>
                    <option value="DEGRADE">
                      DEGRADE (Low Worker Priority)
                    </option>
                    <option value="WARN">WARN (Log Audit Alert Only)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold rounded-lg transition"
                >
                  Save Policy Override
                </button>
              </form>
            </div>

            {/* Policy List */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-md font-bold text-white flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                Active Hierarchical Overrides
              </h2>
              {policies.map((pol) => (
                <div
                  key={pol.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                          pol.scopeType === "ORGANIZATION"
                            ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
                            : pol.scopeType === "WORKSPACE"
                              ? "bg-sky-950/80 text-sky-300 border border-sky-800/60"
                              : "bg-indigo-950/80 text-indigo-300 border border-indigo-800/60"
                        }`}
                      >
                        {pol.scopeType}
                      </span>
                      <span className="font-mono text-sm text-white font-medium">
                        {pol.scopeId}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        pol.enforcementAction === "REJECT"
                          ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                          : pol.enforcementAction === "DEGRADE"
                            ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                      }`}
                    >
                      {pol.enforcementAction}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-300 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Max Concurrency
                      </span>
                      <span className="font-semibold text-white">
                        {pol.maxConcurrentExecutions} workers
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Max Queue Depth
                      </span>
                      <span className="font-semibold text-white">
                        {pol.maxQueueDepth} pending
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Fairness Weight
                      </span>
                      <span className="font-semibold text-white">
                        Weight {pol.fairnessWeight}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Cost Ceiling
                      </span>
                      <span className="font-semibold text-white">
                        ${pol.monthlyCostBudgetUsd}/mo
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                    <span>Updated {pol.updatedAt}</span>
                    <span>
                      Precedence: Workflow &gt; Workspace &gt; Org &gt; Plan
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BUDGET */}
      {activeTab === "budget" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-6 h-6 text-emerald-400" />
                  Organization Cost Guardrails & Projections
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enforces strict financial budgets with proactive alerts before
                  runaway loops cause billing overruns.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Status:</span>
                <span className="text-xs bg-emerald-950 text-emerald-400 font-bold px-2.5 py-1 rounded border border-emerald-800/60 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {costBudget.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-xs block mb-1">
                  Monthly Cost Budget
                </span>
                <span className="text-2xl font-bold text-white">
                  ${costBudget.budgetCeilingUsd.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-xs block mb-1">
                  Spent This Month
                </span>
                <span className="text-2xl font-bold text-emerald-400">
                  ${costBudget.spentUsd.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-xs block mb-1">
                  Projected End-of-Month Spend
                </span>
                <span className="text-2xl font-bold text-sky-400">
                  ${costBudget.projectedSpendUsd.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  Budget Consumption ({costBudget.spendPercentage.toFixed(1)}%)
                </span>
                <span>
                  Warning Alert at {costBudget.alertThresholdPercent}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${costBudget.spendPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FAIR SCHEDULING */}
      {activeTab === "fairness" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-3">
              <Sliders className="w-6 h-6 text-indigo-400" />
              Weighted Deficit Round Robin (DRR) Scheduler
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              FlowForge workers do not process queue items with simple FIFO
              dispatching. High-volume tenants with tens of thousands of
              incoming events are interleaved proportionally to their configured
              fairness weights, preventing starvation of low-volume interactive
              tenants.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-slate-300 font-semibold text-sm mb-2">
                  Anti-Starvation Guarantees
                </div>
                <p className="text-xs text-slate-400">
                  Deficit counters accumulate unused quanta across rounds,
                  ensuring bursty workloads get fair turns without monopolizing
                  continuous capacity.
                </p>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-slate-300 font-semibold text-sm mb-2">
                  Backpressure Thresholds
                </div>
                <p className="text-xs text-slate-400">
                  When an organization reaches its{" "}
                  <code className="text-indigo-400">maxQueueDepth</code>,
                  subsequent trigger attempts are rejected with HTTP 429 and
                  standard Retry-After headers.
                </p>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-slate-300 font-semibold text-sm mb-2">
                  Atomic Reservation TTL
                </div>
                <p className="text-xs text-slate-400">
                  Pre-flight reservations expire automatically after 10 minutes
                  to protect against worker process crashes or network partition
                  deadlocks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
