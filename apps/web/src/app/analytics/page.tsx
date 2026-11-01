"use client";

import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Download,
  Filter,
  FileSpreadsheet,
  FileText,
  Activity,
  Layers,
  Database,
  ArrowUpRight,
  Settings,
  RefreshCw,
  Plus,
} from "lucide-react";

interface WorkflowRoiItem {
  workflowId: string;
  workflowName: string;
  executionCount: number;
  successfulExecutions: number;
  manualMinutesPerRun: number;
  hoursSaved: number;
  laborCostAvoided: number;
  infrastructureCost: number;
  netSavings: number;
}

interface ConnectorHealthItem {
  connectionId: string;
  connectorName: string;
  provider: string;
  status: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  errorRatePercentage: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  rateLimitHits: number;
}

interface DataQualityCheck {
  checkName: string;
  status: "PASS" | "WARN" | "FAIL";
  score: number;
  evaluatedCount: number;
  issueCount: number;
  details: string;
}

interface SavedReportItem {
  id: string;
  name: string;
  description: string;
  reportType: string;
  format: string;
  createdAt: string;
}

export default function AnalyticsDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "roi"
    | "operational"
    | "integrations"
    | "governance"
    | "quality"
    | "reports"
  >("overview");

  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "90d">(
    "30d",
  );

  // ROI Interactive Inputs
  const [manualMinutes, setManualMinutes] = useState<number>(15);
  const [hourlyWage, setHourlyWage] = useState<number>(45);
  const [infraCostPerRun, setInfraCostPerRun] = useState<number>(0.02);
  const [showAssumptionSaved, setShowAssumptionSaved] =
    useState<boolean>(false);

  // Mock / Initial Data
  const [workflowBreakdown, setWorkflowBreakdown] = useState<WorkflowRoiItem[]>(
    [
      {
        workflowId: "wf_customer_onboarding",
        workflowName: "Enterprise Customer Onboarding",
        executionCount: 1420,
        successfulExecutions: 1395,
        manualMinutesPerRun: 25,
        hoursSaved: 581.25,
        laborCostAvoided: 26156.25,
        infrastructureCost: 28.4,
        netSavings: 26127.85,
      },
      {
        workflowId: "wf_invoice_reconciliation",
        workflowName: "Automated Invoice Reconciliation",
        executionCount: 3840,
        successfulExecutions: 3790,
        manualMinutesPerRun: 12,
        hoursSaved: 758.0,
        laborCostAvoided: 34110.0,
        infrastructureCost: 76.8,
        netSavings: 34033.2,
      },
      {
        workflowId: "wf_security_incident_sync",
        workflowName: "Security Alert Triage & Jira Sync",
        executionCount: 890,
        successfulExecutions: 865,
        manualMinutesPerRun: 18,
        hoursSaved: 259.5,
        laborCostAvoided: 11677.5,
        infrastructureCost: 17.8,
        netSavings: 11659.7,
      },
      {
        workflowId: "wf_salesforce_hubspot_sync",
        workflowName: "CRM Bi-Directional Lead Sync",
        executionCount: 5210,
        successfulExecutions: 5120,
        manualMinutesPerRun: 8,
        hoursSaved: 682.67,
        laborCostAvoided: 30720.15,
        infrastructureCost: 104.2,
        netSavings: 30615.95,
      },
    ],
  );

  const [connectors] = useState<ConnectorHealthItem[]>([
    {
      connectionId: "conn_salesforce_prod",
      connectorName: "Salesforce CRM Production",
      provider: "salesforce",
      status: "ACTIVE",
      totalCalls: 12450,
      successCount: 12380,
      errorCount: 70,
      errorRatePercentage: 0.6,
      averageLatencyMs: 245,
      p95LatencyMs: 620,
      rateLimitHits: 4,
    },
    {
      connectionId: "conn_stripe_billing",
      connectorName: "Stripe Billing Live",
      provider: "stripe",
      status: "ACTIVE",
      totalCalls: 4890,
      successCount: 4885,
      errorCount: 5,
      errorRatePercentage: 0.1,
      averageLatencyMs: 185,
      p95LatencyMs: 340,
      rateLimitHits: 0,
    },
    {
      connectionId: "conn_jira_engineering",
      connectorName: "Jira Cloud Operations",
      provider: "jira",
      status: "ACTIVE",
      totalCalls: 6320,
      successCount: 6180,
      errorCount: 140,
      errorRatePercentage: 2.2,
      averageLatencyMs: 310,
      p95LatencyMs: 890,
      rateLimitHits: 12,
    },
    {
      connectionId: "conn_slack_internal",
      connectorName: "Slack Enterprise Grid",
      provider: "slack",
      status: "ACTIVE",
      totalCalls: 18450,
      successCount: 18420,
      errorCount: 30,
      errorRatePercentage: 0.2,
      averageLatencyMs: 95,
      p95LatencyMs: 180,
      rateLimitHits: 1,
    },
  ]);

  const [qualityChecks] = useState<DataQualityCheck[]>([
    {
      checkName: "SCHEMA_INTEGRITY",
      status: "PASS",
      score: 100,
      evaluatedCount: 22820,
      issueCount: 0,
      details:
        "All execution IDs, workflow references, and state transitions comply with canonical schemas.",
    },
    {
      checkName: "TIMESTAMP_VALIDITY",
      status: "PASS",
      score: 99,
      evaluatedCount: 22820,
      issueCount: 2,
      details:
        "No negative durations detected; 2 minor clock-drift events reconciled during node failovers.",
    },
    {
      checkName: "RELATIONAL_INTEGRITY",
      status: "PASS",
      score: 100,
      evaluatedCount: 38400,
      issueCount: 0,
      details:
        "Zero orphaned step execution records or unlinked approval tokens detected in database.",
    },
    {
      checkName: "FAILURE_CLASSIFICATION",
      status: "WARN",
      score: 88,
      evaluatedCount: 315,
      issueCount: 38,
      details:
        "38 legacy failures missing granular error category metadata before taxonomy v2 migration.",
    },
    {
      checkName: "STREAM_INTEGRITY",
      status: "PASS",
      score: 100,
      evaluatedCount: 14200,
      issueCount: 0,
      details:
        "All event streams have valid CloudEvents headers, idempotent keys, and strict ordering.",
    },
  ]);

  const [savedReports, setSavedReports] = useState<SavedReportItem[]>([
    {
      id: "rep_monthly_executive_roi",
      name: "Monthly Executive Automation ROI",
      description:
        "Aggregated labor cost avoided and net automation ROI across all business units.",
      reportType: "EXECUTIVE_ROI",
      format: "CSV",
      createdAt: "2026-10-31T09:00:00Z",
    },
    {
      id: "rep_data_governance_audit",
      name: "Quarterly Data Quality & Policy Audit",
      description:
        "Audit trail of data health scores, schema validity, and policy enforcement blocks.",
      reportType: "GOVERNANCE_AUDIT",
      format: "JSON",
      createdAt: "2026-10-31T08:30:00Z",
    },
    {
      id: "rep_connector_reliability_matrix",
      name: "Weekly Connector Reliability & Latency",
      description:
        "P95 latencies, error distributions, and rate limit triggers across all SaaS integrations.",
      reportType: "INTEGRATION_RELIABILITY",
      format: "CSV",
      createdAt: "2026-10-31T07:15:00Z",
    },
  ]);

  // Derived Totals
  const totalExecutions = workflowBreakdown.reduce(
    (sum, w) => sum + w.executionCount,
    0,
  );
  const successfulExecutions = workflowBreakdown.reduce(
    (sum, w) => sum + w.successfulExecutions,
    0,
  );
  const successRate =
    totalExecutions > 0
      ? ((successfulExecutions / totalExecutions) * 100).toFixed(1)
      : "0";
  const totalHoursSaved = workflowBreakdown.reduce(
    (sum, w) => sum + w.hoursSaved,
    0,
  );
  const totalNetSavings = workflowBreakdown.reduce(
    (sum, w) => sum + w.netSavings,
    0,
  );

  const handleRecalculateRoi = () => {
    const updated = workflowBreakdown.map((item) => {
      const hours =
        Math.round(((item.successfulExecutions * manualMinutes) / 60) * 100) /
        100;
      const labor = Math.round(hours * hourlyWage * 100) / 100;
      const infra =
        Math.round(item.executionCount * infraCostPerRun * 100) / 100;
      const net = Math.round((labor - infra) * 100) / 100;
      return {
        ...item,
        manualMinutesPerRun: manualMinutes,
        hoursSaved: hours,
        laborCostAvoided: labor,
        infrastructureCost: infra,
        netSavings: net,
      };
    });
    setWorkflowBreakdown(updated);
    setShowAssumptionSaved(true);
    setTimeout(() => setShowAssumptionSaved(false), 3000);
  };

  const downloadReportMock = (report: SavedReportItem) => {
    let content = "";
    let mimeType = "";
    let extension = report.format.toLowerCase();

    if (report.format === "CSV") {
      content = "Workflow,Executions,Successful,HoursSaved,NetSavings\r\n";
      for (const w of workflowBreakdown) {
        content += `"${w.workflowName}",${w.executionCount},${w.successfulExecutions},${w.hoursSaved},${w.netSavings}\r\n`;
      }
      mimeType = "text/csv;charset=utf-8;";
    } else {
      content = JSON.stringify(
        { report, summary: { totalExecutions, totalNetSavings, successRate } },
        null,
        2,
      );
      mimeType = "application/json;charset=utf-8;";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Enterprise Analytics & Business Intelligence
              </h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Semantic metric registry, automation ROI tracking, data governance
              audits, and operational insights.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1 text-xs font-medium">
              {(["24h", "7d", "30d", "90d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    timeRange === r
                      ? "bg-indigo-500 text-slate-950 font-semibold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => setActiveTab("reports")}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              Export Reports
            </button>
          </div>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Net ROI Savings */}
          <div className="bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Net Automation Value
              </span>
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                $
                {totalNetSavings.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs text-emerald-400 font-medium flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> +14.2%
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Estimated labor avoided minus platform infrastructure costs
            </p>
          </div>

          {/* Card 2: Manual Time Avoided */}
          <div className="bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Hours Avoided
              </span>
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {Math.round(totalHoursSaved).toLocaleString()} hrs
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                across {successfulExecutions.toLocaleString()} runs
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Based on configurable process step duration benchmarks
            </p>
          </div>

          {/* Card 3: Execution Success Rate */}
          <div className="bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Platform Success Rate
              </span>
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-400">
                {successRate}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {totalExecutions.toLocaleString()} total runs
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Median duration: 280ms | P95 duration: 920ms
            </p>
          </div>

          {/* Card 4: Data Quality & Governance */}
          <div className="bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Data Quality Health
              </span>
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <Database className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                97.4%
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                HEALTHY
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Referential schema audit passed across 5 verification rules
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 overflow-x-auto text-sm font-medium">
          {[
            { id: "overview", label: "Executive Overview", icon: Activity },
            { id: "roi", label: "Business ROI & Value", icon: DollarSign },
            {
              id: "operational",
              label: "Operational Performance",
              icon: TrendingUp,
            },
            {
              id: "integrations",
              label: "Integration Reliability",
              icon: Layers,
            },
            {
              id: "governance",
              label: "Governance & Compliance",
              icon: ShieldAlert,
            },
            { id: "quality", label: "Data Quality Health", icon: Database },
            {
              id: "reports",
              label: "Saved Reports & Exports",
              icon: FileSpreadsheet,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 border-b-2 font-medium transition whitespace-nowrap ${
                  active
                    ? "border-indigo-400 text-indigo-400"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ROI Highlights */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Top ROI Generating Workflows
                  </h3>
                  <button
                    onClick={() => setActiveTab("roi")}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    Adjust assumptions <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3">
                  {workflowBreakdown.map((item) => (
                    <div
                      key={item.workflowId}
                      className="bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-200 dark:border-slate-800/80 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {item.workflowName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.executionCount.toLocaleString()} runs Â·{" "}
                          {item.hoursSaved.toFixed(1)} hrs saved
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">
                          $
                          {item.netSavings.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          net savings
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Quality Health Summary */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    Data Health & Semantic Integrity
                  </h3>
                  <button
                    onClick={() => setActiveTab("quality")}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    Full audit <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3">
                  {qualityChecks.map((check) => (
                    <div
                      key={check.checkName}
                      className="bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-200 dark:border-slate-800/80 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {check.checkName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${
                              check.status === "PASS"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {check.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {check.details}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {check.score}%
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {check.issueCount} issues
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROI & BUSINESS VALUE */}
        {activeTab === "roi" && (
          <div className="space-y-6">
            {/* Assumption Configuration Box */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    ROI Financial Modeling Assumptions
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tune processing benchmarks and labor wage rates to reflect
                    your organization's manual operational costs.
                  </p>
                </div>
                {showAssumptionSaved && (
                  <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded">
                    Assumptions recalculated!
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Average Manual Process Time (mins/run)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Human handling time avoided per automated workflow run
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Blended Hourly Wage Rate ($/hour)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={hourlyWage}
                    onChange={(e) => setHourlyWage(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fully burdened employee hourly cost (salary + benefits)
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Platform Infrastructure Cost ($/run)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={infraCostPerRun}
                    onChange={(e) => setInfraCostPerRun(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Deducted compute, queue, and API consumption cost
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleRecalculateRoi}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-slate-950 font-bold text-sm rounded-lg hover:bg-indigo-400 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  Recalculate & Save Assumptions
                </button>
              </div>
            </div>

            {/* Workflow ROI Breakdown Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Workflow Value Breakdown
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Total Net Value: $
                  {totalNetSavings.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Workflow Name</th>
                      <th className="py-3 px-4 text-right">Executions</th>
                      <th className="py-3 px-4 text-right">Successful</th>
                      <th className="py-3 px-4 text-right">Hours Avoided</th>
                      <th className="py-3 px-4 text-right">Labor Savings</th>
                      <th className="py-3 px-4 text-right">Infra Cost</th>
                      <th className="py-3 px-4 text-right">Net Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {workflowBreakdown.map((w) => (
                      <tr
                        key={w.workflowId}
                        className="hover:bg-slate-800/40 transition"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {w.workflowName}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 font-mono">
                          {w.executionCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-mono">
                          {w.successfulExecutions.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 font-mono">
                          {w.hoursSaved.toFixed(1)} hrs
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 font-mono">
                          $
                          {w.laborCostAvoided.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-400/80 font-mono">
                          ${w.infrastructureCost.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-bold font-mono">
                          $
                          {w.netSavings.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OPERATIONAL PERFORMANCE */}
        {activeTab === "operational" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Latency Percentiles
              </span>
              <div className="pt-2 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    Median (P50)
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    280 ms
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    P95 Latency
                  </span>
                  <span className="font-mono font-semibold text-indigo-400">
                    920 ms
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">
                    P99 Latency
                  </span>
                  <span className="font-mono font-semibold text-amber-400">
                    2,410 ms
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Trigger Distribution
              </span>
              <div className="pt-2 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    Webhook Triggers
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    52%
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    Event Stream Triggers
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    31%
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">
                    Scheduled / Cron
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    17%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Self-Healing Retries
              </span>
              <div className="pt-2 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    Transient Errors Caught
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    142
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    Auto-Recovered via Backoff
                  </span>
                  <span className="font-mono font-semibold text-emerald-400">
                    138 (97.2%)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">
                    Dead-Letter Queued
                  </span>
                  <span className="font-mono font-semibold text-rose-400">
                    4
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INTEGRATION RELIABILITY */}
        {activeTab === "integrations" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Connected Integration & Connector Telemetry
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {connectors.length} monitored SaaS integrations
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Connector</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4 text-right">Invocations</th>
                    <th className="py-3 px-4 text-right">Error Rate</th>
                    <th className="py-3 px-4 text-right">Avg Latency</th>
                    <th className="py-3 px-4 text-right">P95 Latency</th>
                    <th className="py-3 px-4 text-right">429 Rate Limits</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {connectors.map((c) => (
                    <tr
                      key={c.connectionId}
                      className="hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {c.connectorName}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 uppercase">
                        {c.provider}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 font-mono">
                        {c.totalCalls.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`${
                            c.errorRatePercentage < 1
                              ? "text-emerald-400"
                              : c.errorRatePercentage < 3
                                ? "text-amber-400"
                                : "text-rose-400 font-bold"
                          }`}
                        >
                          {c.errorRatePercentage}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 font-mono">
                        {c.averageLatencyMs} ms
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 font-mono">
                        {c.p95LatencyMs} ms
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                        {c.rateLimitHits}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: GOVERNANCE & COMPLIANCE */}
        {activeTab === "governance" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                Policy Enforcement Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Total Evaluations (30d)
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    4,280
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Permitted / Compliant
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    4,258 (99.5%)
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Blocked at Pre-Publish
                  </span>
                  <span className="font-mono font-bold text-rose-400">22</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Human Approval Bottlenecks
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Average Approval Wait Time
                  </span>
                  <span className="font-mono font-bold text-indigo-400">
                    18.4 mins
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Pending Approvals
                  </span>
                  <span className="font-mono font-bold text-amber-400">3</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Timed Out & Auto-Rejected
                  </span>
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                    1
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: DATA QUALITY HEALTH */}
        {activeTab === "quality" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Canonical Data Model Integrity Checks
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automated checks verify schema validity, timestamps, foreign
                  key links, and stream order.
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-bold">
                97.4% OVERALL SCORE
              </span>
            </div>
            <div className="divide-y divide-slate-800">
              {qualityChecks.map((check) => (
                <div
                  key={check.checkName}
                  className="p-4 hover:bg-slate-850 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          check.status === "PASS"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {check.status === "PASS" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {check.checkName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {check.details}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                        {check.score}%
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {check.issueCount} issues /{" "}
                        {check.evaluatedCount.toLocaleString()} audited
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: SAVED REPORTS & EXPORTS */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
                Scheduled Reports & Export Artifacts
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {savedReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 dark:border-slate-700 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-400">
                        {report.reportType}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {report.format}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {report.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {report.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Created {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => downloadReportMock(report)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download {report.format}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
