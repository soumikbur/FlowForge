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
  "Operations",
  "Customer Support",
  "Security",
  "Marketing",
  "General",
];

const DEFAULT_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tmpl_incident_response",
    organizationId: null,
    name: "Automated Incident Escalation",
    shortDescription: "Detect high-severity incidents, notify on-call engineers via Slack, and require manager sign-off.",
    description: "Standard operating procedure for P1/P2 operational incident response. Ingests monitoring webhooks, posts to dedicated triage channels, evaluates incident impact, and routes human approvals before disaster recovery actions.",
    category: "DevOps",
    tags: ["incident", "pagerduty", "slack", "approvals"],
    visibility: "PLATFORM",
    status: "PUBLISHED",
    requiredConnections: ["slack-webhook", "http-api"],
    requiredInputs: { channel: "string", minSeverity: "string" },
    usageCount: 142,
    isFeatured: true,
    isVerified: true,
    publishedVersionId: "ver_1",
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
  },
  {
    id: "tmpl_customer_onboarding",
    organizationId: null,
    name: "SaaS Customer Onboarding & Provisioning",
    shortDescription: "Automate new tenant workspace provisioning, send welcome emails, and create CRM accounts.",
    description: "End-to-end customer onboarding pipeline. Listens for completed Stripe checkouts, provisions tenant schemas, issues welcome tokens via transactional SMTP, and logs the account in HubSpot or Salesforce.",
    category: "Operations",
    tags: ["stripe", "email", "onboarding", "provisioning"],
    visibility: "PLATFORM",
    status: "PUBLISHED",
    requiredConnections: ["smtp-email", "http-api"],
    requiredInputs: { welcomeSubject: "string" },
    usageCount: 98,
    isFeatured: true,
    isVerified: true,
    publishedVersionId: "ver_2",
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
  {
    id: "tmpl_expense_approval",
    organizationId: null,
    name: "Two-Tier Expense Reimbursement",
    shortDescription: "Conditional routing of expense claims with automatic payout for <$500 and VP approval above.",
    description: "Compliant corporate expense workflow. Implements automated fraud scoring, single-tier manager approval for standard amounts, and mandatory executive authorization for high-value reimbursements.",
    category: "Finance",
    tags: ["finance", "reimbursement", "approvals", "audit"],
    visibility: "PLATFORM",
    status: "PUBLISHED",
    requiredConnections: ["smtp-email"],
    requiredInputs: { approvalThreshold: "number" },
    usageCount: 76,
    isFeatured: false,
    isVerified: true,
    publishedVersionId: "ver_3",
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: "tmpl_sec_vulnerability",
    organizationId: null,
    name: "CVE & Dependency Security Triage",
    shortDescription: "Weekly automated dependency scans, automated ticket creation, and SLA tracking.",
    description: "Scheduled security operations task. Polls container vulnerability feeds, deduplicates alerts by CVE severity, creates Jira tickets, and tracks resolution SLA timers with delay nodes.",
    category: "Security",
    tags: ["security", "cve", "github", "jira"],
    visibility: "ORGANIZATION",
    status: "PUBLISHED",
    requiredConnections: ["http-api"],
    requiredInputs: { maxSlaHours: "number" },
    usageCount: 34,
    isFeatured: false,
    isVerified: false,
    publishedVersionId: "ver_4",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVisibility, setSelectedVisibility] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);

  // Modals
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const [instantiateTemplate, setInstantiateTemplate] = useState<WorkflowTemplate | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [connectionMappings, setConnectionMappings] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch templates from API
  useEffect(() => {
    async function loadTemplates() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedCategory !== "All") params.append("category", selectedCategory);
        if (selectedVisibility !== "ALL") params.append("visibility", selectedVisibility);
        if (searchQuery.trim()) params.append("search", searchQuery.trim());

        const res = await fetch(`/api/v1/templates?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            setTemplates(json.data);
          } else {
            // Fall back to filtered default templates
            filterDefaultTemplates();
          }
        } else {
          filterDefaultTemplates();
        }
      } catch (e) {
        filterDefaultTemplates();
      } finally {
        setLoading(false);
      }
    }

    function filterDefaultTemplates() {
      let filtered = [...DEFAULT_TEMPLATES];
      if (selectedCategory !== "All") {
        filtered = filtered.filter(
          (t) => t.category.toLowerCase() === selectedCategory.toLowerCase()
        );
      }
      if (selectedVisibility !== "ALL") {
        filtered = filtered.filter((t) => t.visibility === selectedVisibility);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.shortDescription.toLowerCase().includes(q) ||
            t.tags.some((tg) => tg.toLowerCase().includes(q))
        );
      }
      setTemplates(filtered);
    }

    loadTemplates();
  }, [selectedCategory, selectedVisibility, searchQuery]);

  const handleOpenInstantiate = (tmpl: WorkflowTemplate) => {
    setInstantiateTemplate(tmpl);
    setNewWorkflowName(`${tmpl.name} (from Template)`);
    const initialMappings: Record<string, string> = {};
    tmpl.requiredConnections.forEach((conn) => {
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

      const res = await fetch(`/api/v1/templates/${instantiateTemplate.id}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWorkflowName.trim() || instantiateTemplate.name,
          connectionMappings,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to instantiate workflow from template.");
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero Header */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 px-6 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-teal-400 font-semibold text-xs tracking-wider uppercase mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Enterprise Template Catalog</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                Workflow Templates & Marketplace
              </h1>
              <p className="mt-2 text-slate-400 text-sm max-w-2xl">
                Accelerate business automation with production-validated workflow templates.
                Instantiate reusable pipelines with guaranteed tenant isolation, zero credential leakage, and automatic node ID regeneration.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/workflows")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>My Workflows</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/80 p-4 rounded-xl border border-slate-800">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates by title, description, or tag..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <span>Visibility:</span>
              </div>
              <select
                value={selectedVisibility}
                onChange={(e) => setSelectedVisibility(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              >
                <option value="ALL">All Visibility</option>
                <option value="PLATFORM">Verified Platform</option>
                <option value="ORGANIZATION">Organization Shared</option>
                <option value="PRIVATE">My Private Drafts</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content: Template Grid */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <div className="text-center py-20 text-slate-500 text-sm">Loading template catalog...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">No templates found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No matching templates found for your category and search criteria. Try clearing your filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition group shadow-sm hover:shadow-md"
              >
                <div>
                  {/* Card Header: Category & Visibility Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-semibold text-teal-400 bg-teal-950/60 border border-teal-800/60 px-2 py-0.5 rounded-md">
                      {tmpl.category}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {tmpl.visibility === "PLATFORM" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Platform
                        </span>
                      ) : tmpl.visibility === "ORGANIZATION" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400 bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded-full">
                          <Building className="w-3 h-3" />
                          Org Shared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" />
                          Private
                        </span>
                      )}

                      {tmpl.isFeatured && (
                        <span className="text-[10px] font-semibold text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-full">
                          ★ Featured
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Template Title */}
                  <h3 className="text-base font-bold text-slate-100 group-hover:text-teal-400 transition">
                    {tmpl.name}
                  </h3>

                  {/* Short Description */}
                  <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {tmpl.shortDescription}
                  </p>

                  {/* Required Connectors Pill List */}
                  {tmpl.requiredConnections && tmpl.requiredConnections.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                        Required Integrations:
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {tmpl.requiredConnections.map((conn) => (
                          <span
                            key={conn}
                            className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded"
                          >
                            <Code2 className="w-3 h-3 text-teal-400" />
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
                          className="text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer: Metadata & Actions */}
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">{tmpl.usageCount}</span> uses
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>

                    <button
                      onClick={() => handleOpenInstantiate(tmpl)}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">
                  {previewTemplate.category} Template
                </span>
                <h2 className="text-xl font-bold text-white mt-1">{previewTemplate.name}</h2>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mt-4 leading-relaxed">
              {previewTemplate.description || previewTemplate.shortDescription}
            </p>

            <div className="mt-6 bg-slate-950 border border-slate-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Setup Requirements & Dependencies
              </h4>
              <p className="text-[11px] text-slate-400 mt-1">
                When you instantiate this template, all raw credentials and sensitive tokens are completely scrubbed.
                You will bind your organization's verified connections during setup.
              </p>

              <div className="mt-3 space-y-2">
                {previewTemplate.requiredConnections.map((conn) => (
                  <div
                    key={conn}
                    className="flex items-center justify-between text-xs bg-slate-900 p-2.5 rounded border border-slate-800"
                  >
                    <span className="font-mono text-teal-300">{conn}</span>
                    <span className="text-[10px] text-slate-400">Organization Connection Required</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  const tmpl = previewTemplate;
                  setPreviewTemplate(null);
                  handleOpenInstantiate(tmpl);
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleInstantiate}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">
                  Create from Template
                </span>
                <h2 className="text-lg font-bold text-white mt-1">{instantiateTemplate.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInstantiateTemplate(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Workflow Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {instantiateTemplate.requiredConnections.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Connect Required Integrations
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Enter the Connection ID from your organization's settings for each connector:
                  </p>
                  <div className="space-y-2">
                    {instantiateTemplate.requiredConnections.map((conn) => (
                      <div key={conn} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-teal-300 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 min-w-[120px]">
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
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>
                  The workflow will be created as a private <strong>Draft</strong> in your active organization. Triggers remain inactive until published.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInstantiateTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
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
