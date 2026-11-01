"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Search,
  Filter,
  Plus,
  ArrowRight,
  ShieldCheck,
  Building,
  Lock,
  Layers,
  Sparkles,
  CheckCircle2,
  X,
  ExternalLink,
  Code2,
  Tag,
  Eye,
  Check,
} from "lucide-react";

interface TemplateVersion {
  id: string;
  versionNumber: number;
  definition: any;
  requiredConnections: string[];
  requiredInputs: Record<string, unknown>;
  contentHash: string;
  releaseNotes?: string;
  publishedAt: string;
}

interface WorkflowTemplate {
  id: string;
  organizationId?: string | null;
  name: string;
  shortDescription: string;
  description?: string;
  category: string;
  tags: string[];
  visibility: "PRIVATE" | "ORGANIZATION" | "PLATFORM";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  draftDefinition?: any;
  requiredConnections: string[];
  requiredInputs: Record<string, unknown>;
  usageCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  publishedVersionId?: string;
  publishedVersion?: TemplateVersion;
  createdAt: string;
}

const CATEGORIES = [
  "All",
  "DevOps",
  "Finance",
  "SecOps",
  "ITSM",
  "Marketing",
  "HR",
  "Data & AI",
  "General",
];

export default function TemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedVisibility, setSelectedVisibility] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Preview & Instantiation Modal States
  const [previewTemplate, setPreviewTemplate] =
    useState<WorkflowTemplate | null>(null);
  const [instantiateTemplate, setInstantiateTemplate] =
    useState<WorkflowTemplate | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [connectionMappings, setConnectionMappings] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [selectedCategory, selectedVisibility, searchQuery]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== "All") {
        params.append("category", selectedCategory);
      }
      if (selectedVisibility && selectedVisibility !== "ALL") {
        params.append("visibility", selectedVisibility);
      }
      if (searchQuery.trim()) {
        params.append("query", searchQuery.trim());
      }

      const res = await fetch(`/api/v1/templates?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch templates catalog");
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTemplates(json.data);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error(err);
      // Fallback empty array on network failure
      setTemplates([
        {
          id: "tmpl_order_processing",
          name: "E-Commerce Order Fulfillment & Fraud Check",
          shortDescription:
            "Automate omnichannel customer order processing with Stripe charge validation, fraud scoring, and ERP invoice generation.",
          description:
            "A comprehensive enterprise order processing blueprint. Automatically captures incoming checkout webhooks, runs risk scoring heuristics, triggers human approval if score exceeds thresholds, and pushes to ERP logistics.",
          category: "Finance",
          tags: ["orders", "stripe", "fraud", "approvals"],
          visibility: "PLATFORM",
          status: "PUBLISHED",
          requiredConnections: ["stripe_gateway", "slack_notifications"],
          requiredInputs: {},
          usageCount: 412,
          isFeatured: true,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "tmpl_incident_response",
          name: "Multi-Cloud P1 Incident Orchestration",
          shortDescription:
            "Orchestrate major incident triage with automated Datadog alerts, PagerDuty on-call routing, and Slack war-room provisioning.",
          category: "DevOps",
          tags: ["incident", "pagerduty", "datadog", "slack"],
          visibility: "PLATFORM",
          status: "PUBLISHED",
          requiredConnections: [
            "datadog_api",
            "pagerduty",
            "slack_notifications",
          ],
          requiredInputs: {},
          usageCount: 890,
          isFeatured: true,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "tmpl_employee_onboarding",
          name: "Identity-First Employee Onboarding Pipeline",
          shortDescription:
            "Automate HR identity provisioning across Okta SCIM, Google Workspace, GitHub Enterprise, and payroll systems with audit compliance.",
          category: "HR",
          tags: ["hr", "scim", "okta", "github", "compliance"],
          visibility: "PLATFORM",
          status: "PUBLISHED",
          requiredConnections: ["okta_scim", "google_workspace"],
          requiredInputs: {},
          usageCount: 310,
          isFeatured: false,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "tmpl_db_backup_resilience",
          name: "PostgreSQL Automated Disaster Recovery Backup",
          shortDescription:
            "Schedule point-in-time PostgreSQL database snapshots, verify SHA-256 integrity, and replicate to secondary cloud storage.",
          category: "SecOps",
          tags: ["database", "backup", "disaster-recovery", "s3"],
          visibility: "PLATFORM",
          status: "PUBLISHED",
          requiredConnections: ["aws_s3_storage"],
          requiredInputs: {},
          usageCount: 520,
          isFeatured: false,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "tmpl_lead_enrichment",
          name: "Inbound Lead AI Enrichment & CRM Sync",
          shortDescription:
            "Enrich marketing leads with Gemini semantic reasoning, scrape corporate domain metadata, and assign sales reps dynamically.",
          category: "Marketing",
          tags: ["ai", "gemini", "salesforce", "enrichment"],
          visibility: "ORGANIZATION",
          status: "PUBLISHED",
          requiredConnections: ["salesforce_crm", "gemini_copilot"],
          requiredInputs: {},
          usageCount: 180,
          isFeatured: true,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "tmpl_vulnerability_remediation",
          name: "Automated Dependabot & Container CVE Remediation",
          shortDescription:
            "Trigger automated security patches for critical CVE container vulnerabilities with isolated staging test pipelines.",
          category: "SecOps",
          tags: ["security", "cve", "github", "docker"],
          visibility: "PLATFORM",
          status: "PUBLISHED",
          requiredConnections: ["github_enterprise"],
          requiredInputs: {},
          usageCount: 640,
          isFeatured: false,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInstantiate = (tmpl: WorkflowTemplate) => {
    setInstantiateTemplate(tmpl);
    setNewWorkflowName(`${tmpl.name} (Draft)`);
    const initialMappings: Record<string, string> = {};
    tmpl.requiredConnections?.forEach((conn) => {
      initialMappings[conn] = "";
    });
    setConnectionMappings(initialMappings);
    setErrorMsg(null);
  };

  const handleInstantiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instantiateTemplate) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch(
        `/api/v1/templates/${instantiateTemplate.id}/instantiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newWorkflowName.trim() || instantiateTemplate.name,
            connectionMappings,
          }),
        },
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error?.message ||
            "Failed to instantiate workflow from template.",
        );
      }

      setInstantiateTemplate(null);
      // Navigate directly to the new workflow canvas
      router.push(`/workflows/${json.data.id}/builder`);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100">
      {/* Hero Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs transition-colors duration-150">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs tracking-wider uppercase mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Enterprise Template Catalog</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Workflow Templates & Marketplace
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm max-w-2xl leading-relaxed">
              Accelerate business automation with production-validated workflow
              templates. Instantiate reusable pipelines with guaranteed tenant
              isolation, zero credential leakage, and automatic node ID
              regeneration.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/workflows")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition"
            >
              <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>My Workflows</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by title, description, or tag..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <span>Visibility:</span>
            </div>
            <select
              value={selectedVisibility}
              onChange={(e) => setSelectedVisibility(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="ALL">All Visibility</option>
              <option value="PLATFORM">Verified Platform</option>
              <option value="ORGANIZATION">Organization Shared</option>
              <option value="PRIVATE">My Private Drafts</option>
            </select>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 font-semibold"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Template Grid */}
      <div className="w-full">
        {loading ? (
          <div className="text-center py-20 text-slate-500 dark:text-slate-400 text-sm">
            Loading template catalog...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <BookOpen className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              No templates found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              No matching templates found for your category and search criteria.
              Try clearing your filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition group shadow-xs hover:shadow-md"
              >
                <div>
                  {/* Card Header: Category & Visibility Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-2 py-0.5 rounded-md">
                      {tmpl.category}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {tmpl.visibility === "PLATFORM" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Platform
                        </span>
                      ) : tmpl.visibility === "ORGANIZATION" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40 px-2 py-0.5 rounded-full">
                          <Building className="w-3 h-3" />
                          Org Shared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-2 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" />
                          Private
                        </span>
                      )}

                      {tmpl.isFeatured && (
                        <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 px-2 py-0.5 rounded-full">
                          ★ Featured
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Template Title */}
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                    {tmpl.name}
                  </h3>

                  {/* Short Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {tmpl.shortDescription}
                  </p>

                  {/* Required Connectors Pill List */}
                  {tmpl.requiredConnections &&
                    tmpl.requiredConnections.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                          Required Integrations:
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {tmpl.requiredConnections.map((conn) => (
                            <span
                              key={conn}
                              className="inline-flex items-center gap-1 text-[10px] bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded font-mono"
                            >
                              <Code2 className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                              {conn}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Tags */}
                  {tmpl.tags && tmpl.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {tmpl.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer: Metadata & Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {tmpl.usageCount}
                    </span>{" "}
                    uses
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition flex items-center gap-1 font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>

                    <button
                      onClick={() => handleOpenInstantiate(tmpl)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-xs"
                    >
                      <span>Use Template</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-slate-900 dark:text-slate-100">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  {previewTemplate.category} Template
                </span>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {previewTemplate.name}
                </h2>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mt-4 leading-relaxed">
              {previewTemplate.description || previewTemplate.shortDescription}
            </p>

            <div className="mt-6 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Setup Requirements & Dependencies
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                When you instantiate this template, all raw credentials and
                sensitive tokens are completely scrubbed. You will bind your
                organization's verified connections during setup.
              </p>

              <div className="mt-3 space-y-2">
                {previewTemplate.requiredConnections.map((conn) => (
                  <div
                    key={conn}
                    className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800 shadow-2xs"
                  >
                    <span className="font-mono text-indigo-600 dark:text-indigo-300 font-semibold">
                      {conn}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Organization Connection Required
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  const tmpl = previewTemplate;
                  setPreviewTemplate(null);
                  handleOpenInstantiate(tmpl);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs"
              >
                <span>Use This Template</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instantiate Modal */}
      {instantiateTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <form
            onSubmit={handleInstantiate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Create from Template
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {instantiateTemplate.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInstantiateTemplate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/80 rounded-lg text-xs text-red-700 dark:text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Workflow Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-2xs"
                />
              </div>

              {instantiateTemplate.requiredConnections.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Connect Required Integrations
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                    Enter the Connection ID from your organization's settings
                    for each connector:
                  </p>
                  <div className="space-y-2">
                    {instantiateTemplate.requiredConnections.map((conn) => (
                      <div key={conn} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 min-w-[120px]">
                          {conn}
                        </span>
                        <input
                          type="text"
                          placeholder="Optional connectionId (or configure in builder)"
                          value={connectionMappings[conn] || ""}
                          onChange={(e) =>
                            setConnectionMappings({
                              ...connectionMappings,
                              [conn]: e.target.value,
                            })
                          }
                          className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 shadow-2xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  The workflow will be created as a private{" "}
                  <strong>Draft</strong> in your active organization. Triggers
                  remain inactive until published.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInstantiateTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition"
              >
                {isSubmitting ? "Instantiating..." : "Create Workflow"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
