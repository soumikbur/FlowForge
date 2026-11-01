"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  Plus,
  FileText,
  Filter,
  Check,
  Ban,
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";

interface PolicyItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  version: number;
  status:
    "DRAFT" | "IN_REVIEW" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "RETIRED";
  priority: number;
  rulesCount: number;
  complianceControls: string[];
  updatedAt: string;
}

interface ViolationItem {
  id: string;
  policyId: string;
  policyName: string;
  resourceType: string;
  resourceId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  reasonCode: string;
  message: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  detectedAt: string;
}

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<
    "catalog" | "simulation" | "violations" | "exceptions"
  >("catalog");

  // Sample seed data for initial rendering
  const [policies, setPolicies] = useState<PolicyItem[]>([
    {
      id: "pol_wf_safety_prod",
      name: "Production Workflow Safety Standard",
      description:
        "Restricts unapproved HTTP destinations and requires ADMIN approvals on critical flows.",
      category: "WORKFLOW_SAFETY",
      version: 2,
      status: "ACTIVE",
      priority: 10,
      rulesCount: 3,
      complianceControls: ["SOC2_CC6_1", "ISO27001_A9"],
      updatedAt: "Just now",
    },
    {
      id: "pol_data_pii_export",
      name: "Sensitive Customer Data Protection",
      description:
        "Prohibits external exports of RESTRICTED customer data payloads.",
      category: "DATA_PROTECTION",
      version: 1,
      status: "ACTIVE",
      priority: 20,
      rulesCount: 2,
      complianceControls: ["GDPR_ART32", "HIPAA_164_312"],
      updatedAt: "2 hours ago",
    },
    {
      id: "pol_connector_fin",
      name: "Payment Gateway Connector Boundary",
      description:
        "Restricts financial connectors to PCI-compliant environments.",
      category: "CONNECTOR_RESTRICTION",
      version: 1,
      status: "APPROVED",
      priority: 30,
      rulesCount: 1,
      complianceControls: ["PCI_DSS_6_4"],
      updatedAt: "Yesterday",
    },
  ]);

  const [violations, setViolations] = useState<ViolationItem[]>([
    {
      id: "viol_101",
      policyId: "pol_wf_safety_prod",
      policyName: "Production Workflow Safety Standard",
      resourceType: "WORKFLOW",
      resourceId: "wf_billing_export_99",
      severity: "HIGH",
      reasonCode: "UNAPPROVED_DESTINATION_DOMAIN",
      message:
        "HTTP_REQUEST attempts connection to unapproved domain: 'untrusted-webhook.xyz'.",
      status: "OPEN",
      detectedAt: "10 mins ago",
    },
  ]);

  // Simulation state
  const [simResourceType, setSimResourceType] = useState("WORKFLOW");
  const [simOperation, setSimOperation] = useState("PUBLISH");
  const [simAttributes, setSimAttributes] = useState(
    JSON.stringify(
      {
        nodeTypes: ["TRIGGER", "HTTP_REQUEST"],
        destinationDomains: ["api.stripe.com"],
        nodeCount: 8,
        dataClassification: "INTERNAL",
      },
      null,
      2,
    ),
  );
  const [simResult, setSimResult] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulate = () => {
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const parsed = JSON.parse(simAttributes);
        const isStripe = parsed.destinationDomains?.includes("api.stripe.com");
        setSimResult({
          decision: isStripe ? "ALLOW" : "DENY",
          isAllowed: isStripe,
          requiresApproval: false,
          matchedPolicies: [
            {
              policyId: "pol_wf_safety_prod",
              policyName: "Production Workflow Safety Standard",
              outcome: isStripe ? "ALLOW" : "DENY",
              severity: isStripe ? "LOW" : "HIGH",
              reasonCode: isStripe
                ? "APPROVED_DOMAIN"
                : "UNAPPROVED_DESTINATION_DOMAIN",
              message: isStripe
                ? "Outbound destination 'api.stripe.com' matches approved integration allowlist."
                : "Outbound destinations not in allowlist are blocked in production workflows.",
            },
          ],
          evaluationDurationMs: 4,
          evaluatedAt: new Date().toISOString(),
          correlationId: `sim_${Math.random().toString(36).slice(2, 8)}`,
        });
      } catch (err) {
        setSimResult({ error: "Invalid JSON attributes" });
      }
      setIsSimulating(false);
    }, 400);
  };

  const handleTogglePolicyStatus = (id: string) => {
    setPolicies((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newStatus = p.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        return { ...p, status: newStatus, updatedAt: "Just now" };
      }),
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Policy Governance & Compliance Center
              </h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Version-controlled Policy-as-Code engine enforcing deterministic
              safety rules, approval gates, and compliance mappings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("simulation")}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 transition"
            >
              <Play className="w-4 h-4 text-indigo-400" />
              Simulate Policy
            </button>
            <button
              onClick={() =>
                alert("Policy editor modal - configure rules schema")
              }
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm shadow-indigo-500/20"
            >
              <Plus className="w-4 h-4" />
              New Policy Draft
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          {[
            {
              id: "catalog",
              label: "Active Policies",
              icon: Layers,
              count: policies.length,
            },
            { id: "simulation", label: "Policy Simulation", icon: Sparkles },
            {
              id: "violations",
              label: "Violations & Drift",
              icon: AlertTriangle,
              count: violations.length,
            },
            { id: "exceptions", label: "Exceptions & Overrides", icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                  active
                    ? "border-indigo-500 text-indigo-400 bg-white dark:bg-slate-900/50"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      active
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Policies Catalog */}
        {activeTab === "catalog" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {policies.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-50 dark:bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 dark:border-slate-700 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-700 dark:text-slate-300">
                        {p.category.replace("_", " ")}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.status === "ACTIVE"
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            : p.status === "APPROVED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-semibold text-slate-100 text-base">
                        {p.name}
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                        {p.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {p.complianceControls.map((c) => (
                        <span
                          key={c}
                          className="text-[11px] font-mono px-2 py-0.5 bg-slate-800/80 text-indigo-400 rounded border border-slate-300 dark:border-slate-700"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-200 dark:border-slate-800/80 mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      v{p.version} â€¢ {p.rulesCount} rules
                    </span>
                    <button
                      onClick={() => handleTogglePolicyStatus(p.id)}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {p.status === "ACTIVE" ? "Suspend" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Policy Simulation */}
        {activeTab === "simulation" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-50 dark:bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Dry-Run Synthetic Evaluation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simulate policy outcomes against mock resource contexts without
                executing side-effects or mutating state.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                    Resource Type
                  </label>
                  <select
                    value={simResourceType}
                    onChange={(e) => setSimResourceType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
                  >
                    <option value="WORKFLOW">Workflow</option>
                    <option value="CONNECTOR">Integration Connector</option>
                    <option value="EXECUTION">Workflow Execution</option>
                    <option value="CREDENTIAL">Credential</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                    Operation
                  </label>
                  <select
                    value={simOperation}
                    onChange={(e) => setSimOperation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
                  >
                    <option value="PUBLISH">Publish</option>
                    <option value="EXECUTE">Execute</option>
                    <option value="CONNECT">Connect</option>
                    <option value="EXPORT">Export</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                    Context Attributes (JSON)
                  </label>
                  <textarea
                    rows={8}
                    value={simAttributes}
                    onChange={(e) => setSimAttributes(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 font-mono text-xs border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white font-medium py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {isSimulating ? "Evaluating Rules..." : "Execute Simulation"}
                </button>
              </div>
            </div>

            {/* Simulation Results Output */}
            <div className="bg-slate-50 dark:bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                  Evaluation Verdict
                </h3>

                {simResult ? (
                  <div className="space-y-4">
                    <div
                      className={`p-4 rounded-xl border flex items-center gap-3 ${
                        simResult.decision === "ALLOW"
                          ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                          : simResult.decision === "REQUIRE_APPROVAL"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      }`}
                    >
                      {simResult.decision === "ALLOW" ? (
                        <CheckCircle className="w-8 h-8 flex-shrink-0" />
                      ) : simResult.decision === "REQUIRE_APPROVAL" ? (
                        <Clock className="w-8 h-8 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-8 h-8 flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-base font-bold">
                          Decision: {simResult.decision}
                        </div>
                        <div className="text-xs opacity-80">
                          Execution Latency: {simResult.evaluationDurationMs}ms
                          â€¢ Correlation: {simResult.correlationId}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Triggered Policy Rules
                      </div>
                      {simResult.matchedPolicies?.map((m: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {m.policyName}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                              {m.reasonCode}
                            </span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400">
                            {m.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Activity className="w-8 h-8 opacity-40" />
                    <p className="text-sm">
                      Click "Execute Simulation" to preview policy verdicts.
                    </p>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 border-t border-slate-200 dark:border-slate-200 dark:border-slate-800/80 pt-4">
                Simulations are fully isolated; no external requests or audit
                logs are generated.
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Violations */}
        {activeTab === "violations" && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">Resource</th>
                    <th className="px-6 py-3">Reason Code</th>
                    <th className="px-6 py-3">Details</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {violations.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            v.severity === "CRITICAL" || v.severity === "HIGH"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {v.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-slate-800 dark:text-slate-200">
                          {v.resourceId}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {v.resourceType}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-700 dark:text-slate-300">
                        {v.reasonCode}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                        {v.message}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                          {v.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() =>
                            setViolations((prev) =>
                              prev.map((item) =>
                                item.id === v.id
                                  ? { ...item, status: "RESOLVED" }
                                  : item,
                              ),
                            )
                          }
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Exceptions */}
        {activeTab === "exceptions" && (
          <div className="bg-slate-50 dark:bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
            <Clock className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              No Active Policy Exceptions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Time-limited policy overrides allow operators to bypass specific
              rules with full administrative approval and audit evidence.
            </p>
            <button
              onClick={() => alert("Exception Request Form modal")}
              className="bg-slate-800 hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 mt-2 transition"
            >
              Request Exception
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
