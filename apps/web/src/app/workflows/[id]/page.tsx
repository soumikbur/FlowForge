"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  ArrowLeft,
  GitBranch,
  Rocket,
  RotateCcw,
  History,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  FileCode,
  Tag,
  ExternalLink,
  RefreshCw,
  Diff,
  X,
  UploadCloud,
  Check,
} from "lucide-react";

interface WorkflowDetail {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  publishedVersionId?: string;
  updatedAt: string;
}

interface WorkflowVersionItem {
  id: string;
  versionNumber: number;
  contentHash?: string;
  releaseNotes?: string;
  createdAt: string;
  publishedById?: string;
  definition: {
    nodes: any[];
    edges: any[];
  };
}

interface DeploymentItem {
  id: string;
  workflowVersionId: string;
  environment: "development" | "staging" | "production";
  status: "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK";
  deployedAt: string;
  previousVersionId?: string;
  releaseNotes?: string;
}

interface VersionComparisonResult {
  isIdentical: boolean;
  addedNodes: any[];
  removedNodes: any[];
  modifiedNodes: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    previousConfig: any;
    newConfig: any;
    diffs: Array<{
      path: string;
      before?: any;
      after?: any;
    }>;
  }>;
  addedEdges: any[];
  removedEdges: any[];
  summary: {
    totalChanges: number;
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
  };
}

export default function WorkflowLifecyclePage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [versions, setVersions] = useState<WorkflowVersionItem[]>([]);
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal States
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteTargetEnv, setPromoteTargetEnv] = useState<
    "development" | "staging" | "production"
  >("staging");
  const [promoteVersionId, setPromoteVersionId] = useState<string>("");
  const [promoteNotes, setPromoteNotes] = useState<string>("");
  const [promoteLoading, setPromoteLoading] = useState(false);

  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackEnv, setRollbackEnv] = useState<
    "development" | "staging" | "production"
  >("production");
  const [rollbackTargetVersionId, setRollbackTargetVersionId] =
    useState<string>("");
  const [rollbackNotes, setRollbackNotes] = useState<string>("");
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState<string>("");
  const [compareTargetId, setCompareTargetId] = useState<string>("");
  const [comparisonResult, setComparisonResult] =
    useState<VersionComparisonResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const apiUrl = getApiBaseUrl();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Workflow Detail
      const wfRes = await fetch(`${apiUrl}/api/v1/workflows/${workflowId}`, {
        credentials: "include",
      });
      if (wfRes.ok) {
        const wfData = await wfRes.json();
        if (wfData.success) {
          setWorkflow(wfData.data);
        }
      }

      // 2. Fetch Versions
      const verRes = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/versions`,
        {
          credentials: "include",
        },
      );
      if (verRes.ok) {
        const verData = await verRes.json();
        if (verData.success) {
          setVersions(verData.data || []);
          if (verData.data?.length > 0 && !promoteVersionId) {
            setPromoteVersionId(verData.data[0].id);
          }
        }
      }

      // 3. Fetch Deployments
      const depRes = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/deployments`,
        {
          credentials: "include",
        },
      );
      if (depRes.ok) {
        const depData = await depRes.json();
        if (depData.success) {
          setDeployments(depData.data || []);
        }
      }
    } catch {
      // Local fallback mock if API is down
      setWorkflow({
        id: workflowId,
        name: "Enterprise Invoice Processing",
        description:
          "Automated extraction, approval routing, and ERP ledger dispatch.",
        status: "ACTIVE",
        draftRevision: 3,
        publishedVersionId: "ver_demo_2",
        updatedAt: new Date().toISOString(),
      });
      setVersions([
        {
          id: "ver_demo_2",
          versionNumber: 2,
          contentHash:
            "4f7a9c8b1234567890abcdef1234567890abcdef1234567890abcdef12345678",
          releaseNotes: "Add manager approval threshold and retry policies.",
          createdAt: new Date().toISOString(),
          definition: { nodes: [], edges: [] },
        },
        {
          id: "ver_demo_1",
          versionNumber: 1,
          contentHash:
            "9a8b7c6d1234567890abcdef1234567890abcdef1234567890abcdef12345678",
          releaseNotes: "Initial release with webhook trigger.",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          definition: { nodes: [], edges: [] },
        },
      ]);
      setDeployments([
        {
          id: "dep_1",
          workflowVersionId: "ver_demo_2",
          environment: "development",
          status: "ACTIVE",
          deployedAt: new Date().toISOString(),
          releaseNotes: "Active in dev",
        },
        {
          id: "dep_2",
          workflowVersionId: "ver_demo_2",
          environment: "staging",
          status: "ACTIVE",
          deployedAt: new Date().toISOString(),
          releaseNotes: "Promoted to staging",
        },
        {
          id: "dep_3",
          workflowVersionId: "ver_demo_1",
          environment: "production",
          status: "ACTIVE",
          deployedAt: new Date(Date.now() - 40000000).toISOString(),
          releaseNotes: "Initial prod deployment",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, workflowId, promoteVersionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Promote / Deploy
  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteVersionId) return;

    setPromoteLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            versionId: promoteVersionId,
            targetEnvironment: promoteTargetEnv,
            releaseNotes: promoteNotes.trim() || undefined,
          }),
        },
      );

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          body.error?.message ||
            `Failed to promote version to ${promoteTargetEnv}. Check your role permissions.`,
        );
      }

      setSuccessMsg(
        `Successfully promoted version to ${promoteTargetEnv.toUpperCase()}!`,
      );
      setShowPromoteModal(false);
      setPromoteNotes("");
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to promote workflow version.");
    } finally {
      setPromoteLoading(false);
    }
  };

  // Handle Rollback
  const handleRollback = async (e: React.FormEvent) => {
    e.preventDefault();
    setRollbackLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/environments/${rollbackEnv}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetVersionId: rollbackTargetVersionId || undefined,
            notes: rollbackNotes.trim() || undefined,
          }),
        },
      );

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          body.error?.message ||
            `Failed to rollback ${rollbackEnv}. Verify previous version exists.`,
        );
      }

      setSuccessMsg(
        `Successfully rolled back ${rollbackEnv.toUpperCase()} environment!`,
      );
      setShowRollbackModal(false);
      setRollbackNotes("");
      setRollbackTargetVersionId("");
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to rollback environment.");
    } finally {
      setRollbackLoading(false);
    }
  };

  // Handle Restore Draft
  const handleRestoreDraft = async (verId: string) => {
    if (
      !confirm(
        "Are you sure you want to overwrite the current draft with this historical version?",
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/versions/${verId}/create-draft`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body = await res.json();
      if (res.ok && body.success) {
        setSuccessMsg(
          "Historical version successfully restored to draft. You can now edit it in the builder.",
        );
        await fetchData();
      } else {
        setErrorMsg(
          body.error?.message || "Failed to restore version to draft.",
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error restoring version to draft.");
    }
  };

  // Handle Compare
  const runComparison = async () => {
    if (!compareBaseId || !compareTargetId) return;
    setCompareLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/compare?baseVersionId=${compareBaseId}&targetVersionId=${compareTargetId}`,
        { credentials: "include" },
      );
      const body = await res.json();
      if (res.ok && body.success) {
        setComparisonResult(body.data);
      } else {
        setErrorMsg(body.error?.message || "Comparison failed.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while comparing versions.");
    } finally {
      setCompareLoading(false);
    }
  };

  const getActiveDeployment = (
    env: "development" | "staging" | "production",
  ) => {
    return deployments.find(
      (d) => d.environment === env && d.status === "ACTIVE",
    );
  };

  const getVersionById = (verId?: string) => {
    return versions.find((v) => v.id === verId);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/workflows"
              className="p-1 text-slate-400 hover:text-slate-700 dark:text-slate-300 rounded-md transition"
              title="Back to Workflows"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {workflow?.name || "Workflow"}
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                workflow?.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}
            >
              {workflow?.status || "DRAFT"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
              Draft Rev #{workflow?.draftRevision || 0}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 pl-8">
            {workflow?.description ||
              "Manage immutable versions, environment deployments, and promotions."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (versions.length >= 2) {
                setCompareBaseId(versions[1].id);
                setCompareTargetId(versions[0].id);
              } else if (versions.length === 1) {
                setCompareBaseId(versions[0].id);
                setCompareTargetId(versions[0].id);
              }
              setShowCompareModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 transition shadow-sm"
          >
            <Diff className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Compare Versions</span>
          </button>

          <button
            onClick={() => {
              if (versions.length > 0) {
                setPromoteVersionId(versions[0].id);
              }
              setShowPromoteModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            <Rocket className="w-4 h-4" />
            <span>Promote / Deploy</span>
          </button>

          <Link
            href={`/workflows/${workflowId}/builder`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            <FileCode className="w-4 h-4" />
            <span>Open Builder</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-Environment Promotion Pipeline */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Environment Deployments
            </h2>
          </div>
          <button
            onClick={() => fetchData()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(["development", "staging", "production"] as const).map((env) => {
            const activeDep = getActiveDeployment(env);
            const activeVer = activeDep
              ? getVersionById(activeDep.workflowVersionId)
              : null;

            const isProd = env === "production";
            const isStaging = env === "staging";

            return (
              <div
                key={env}
                className={`rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 relative overflow-hidden ${
                  isProd
                    ? "border-purple-200 ring-1 ring-purple-100"
                    : isStaging
                      ? "border-blue-200 ring-1 ring-blue-50"
                      : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activeDep
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-slate-300"
                      }`}
                    />
                    <h3 className="font-bold capitalize text-slate-900 dark:text-slate-100">
                      {env}
                    </h3>
                  </div>
                  {isProd && (
                    <span className="text-[11px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Protected (Owner/Admin)
                    </span>
                  )}
                </div>

                {activeDep && activeVer ? (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-600" />
                        Version v{activeVer.versionNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {activeVer.contentHash
                          ? `sha256:${activeVer.contentHash.slice(0, 8)}...`
                          : ""}
                      </span>
                    </div>

                    {activeDep.releaseNotes && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">
                        &quot;{activeDep.releaseNotes}&quot;
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        Deployed{" "}
                        {new Date(activeDep.deployedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                    No active version deployed in {env}.
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setPromoteTargetEnv(env);
                      if (versions.length > 0)
                        setPromoteVersionId(versions[0].id);
                      setShowPromoteModal(true);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition"
                  >
                    <Rocket className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    <span>Deploy Version</span>
                  </button>

                  {activeDep && (
                    <button
                      onClick={() => {
                        setRollbackEnv(env);
                        setShowRollbackModal(true);
                      }}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
                      title={`Rollback ${env}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Immutable Version History Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Immutable Version History
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {versions.length} published version
            {versions.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Version</th>
                  <th className="px-6 py-3.5">Content Hash (SHA-256)</th>
                  <th className="px-6 py-3.5">Release Notes</th>
                  <th className="px-6 py-3.5">Active Environments</th>
                  <th className="px-6 py-3.5">Published Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {versions.map((ver) => {
                  const activeEnvs = (
                    ["development", "staging", "production"] as const
                  ).filter(
                    (env) =>
                      getActiveDeployment(env)?.workflowVersionId === ver.id,
                  );

                  return (
                    <tr
                      key={ver.id}
                      className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                    >
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-indigo-600" />
                        <span>v{ver.versionNumber}</span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {ver.contentHash ? (
                          <span
                            title={ver.contentHash}
                            className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-800"
                          >
                            {ver.contentHash.slice(0, 16)}...
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>

                      <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-700 dark:text-slate-300">
                        {ver.releaseNotes || (
                          <span className="text-slate-400 italic">
                            No notes
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {activeEnvs.length > 0 ? (
                            activeEnvs.map((env) => (
                              <span
                                key={env}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded capitalize ${
                                  env === "production"
                                    ? "bg-purple-100 text-purple-700 border border-purple-200"
                                    : env === "staging"
                                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                                      : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                {env}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">None</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(ver.createdAt).toLocaleString()}
                      </td>

                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setPromoteVersionId(ver.id);
                            setShowPromoteModal(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          <span>Deploy</span>
                        </button>

                        <button
                          onClick={() => handleRestoreDraft(ver.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 transition"
                          title="Restore version contents to draft"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore Draft</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {versions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-slate-400 text-sm"
                    >
                      No versions published yet. Open the builder and click
                      &quot;Publish&quot; to create your first immutable
                      version.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Deployment Audit Trail */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Deployment Audit History
          </h2>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-200">
            {deployments.map((dep) => {
              const ver = getVersionById(dep.workflowVersionId);
              return (
                <div
                  key={dep.id}
                  className="p-4 flex items-center justify-between text-sm hover:bg-slate-50 dark:bg-slate-800/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        dep.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : dep.status === "ROLLED_BACK"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {dep.status}
                    </span>

                    <span className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {dep.environment}
                    </span>

                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Version v{ver?.versionNumber || "?"}
                    </span>

                    {dep.releaseNotes && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 italic">
                        - &quot;{dep.releaseNotes}&quot;
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-slate-400">
                    {new Date(dep.deployedAt).toLocaleString()}
                  </span>
                </div>
              );
            })}

            {deployments.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">
                No deployment history recorded.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PROMOTE / DEPLOY MODAL */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-600" />
                <span>Promote / Deploy Version</span>
              </h3>
              <button
                onClick={() => setShowPromoteModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePromote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Environment
                </label>
                <select
                  value={promoteTargetEnv}
                  onChange={(e) =>
                    setPromoteTargetEnv(
                      e.target.value as
                        "development" | "staging" | "production",
                    )
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">
                    Production (Admin/Owner Only)
                  </option>
                </select>
              </div>

              {promoteTargetEnv === "production" && (
                <div className="bg-purple-50 border border-purple-200 text-purple-900 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="w-4 h-4 text-purple-700" />
                    <span>Production Safeguard Active</span>
                  </div>
                  <p>
                    Deploying to production will update the live operational
                    workflow. Elevated permissions (OWNER or ADMIN) are
                    required.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Workflow Version
                </label>
                <select
                  value={promoteVersionId}
                  onChange={(e) => setPromoteVersionId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} (
                      {v.contentHash
                        ? `sha256:${v.contentHash.slice(0, 8)}...`
                        : v.id}
                      )
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Deployment Release Notes
                </label>
                <textarea
                  rows={3}
                  value={promoteNotes}
                  onChange={(e) => setPromoteNotes(e.target.value)}
                  placeholder="Describe the changes or reason for this deployment..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={promoteLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {promoteLoading ? "Deploying..." : "Confirm Deployment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLLBACK MODAL */}
      {showRollbackModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <span>Rollback {rollbackEnv.toUpperCase()}</span>
              </h3>
              <button
                onClick={() => setShowRollbackModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRollback} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Rolling back will safely switch active traffic to a previous
                immutable version without deleting history or mutating running
                executions.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Version (Leave empty to restore previous active
                  version)
                </label>
                <select
                  value={rollbackTargetVersionId}
                  onChange={(e) => setRollbackTargetVersionId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">
                    Default (Auto-resolve previous version)
                  </option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} (
                      {v.contentHash
                        ? `sha256:${v.contentHash.slice(0, 8)}...`
                        : v.id}
                      )
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Rollback Reason / Notes
                </label>
                <textarea
                  rows={2}
                  value={rollbackNotes}
                  onChange={(e) => setRollbackNotes(e.target.value)}
                  placeholder="Reason for rollback (e.g. incident mitigation)..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRollbackModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rollbackLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {rollbackLoading ? "Rolling back..." : "Confirm Rollback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERSION COMPARISON MODAL */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Diff className="w-5 h-5 text-indigo-600" />
                <span>Semantic Workflow Version Comparison</span>
              </h3>
              <button
                onClick={() => {
                  setShowCompareModal(false);
                  setComparisonResult(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Base Version (Original)
                </label>
                <select
                  value={compareBaseId}
                  onChange={(e) => setCompareBaseId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} ({v.releaseNotes || v.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Version (Modified)
                </label>
                <select
                  value={compareTargetId}
                  onChange={(e) => setCompareTargetId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} ({v.releaseNotes || v.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={runComparison}
                disabled={compareLoading || !compareBaseId || !compareTargetId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
              >
                <Diff className="w-4 h-4" />
                <span>{compareLoading ? "Analyzing..." : "Compare"}</span>
              </button>
            </div>

            {comparisonResult && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Status:{" "}
                    </span>
                    <span
                      className={`font-bold ${
                        comparisonResult.isIdentical
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {comparisonResult.isIdentical
                        ? "IDENTICAL"
                        : "CHANGES DETECTED"}
                    </span>
                  </div>
                  <div className="space-x-3">
                    <span className="text-emerald-700 font-medium">
                      +{comparisonResult.addedNodes?.length || 0} nodes
                    </span>
                    <span className="text-red-700 font-medium">
                      -{comparisonResult.removedNodes?.length || 0} nodes
                    </span>
                    <span className="text-blue-700 font-medium">
                      ~{comparisonResult.modifiedNodes?.length || 0} modified
                    </span>
                  </div>
                </div>

                {/* Modified Nodes */}
                {comparisonResult.modifiedNodes &&
                  comparisonResult.modifiedNodes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Modified Nodes
                      </h4>
                      <div className="space-y-2">
                        {comparisonResult.modifiedNodes.map((mod) => (
                          <div
                            key={mod.nodeId}
                            className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 text-xs space-y-1.5"
                          >
                            <div className="font-semibold text-blue-900">
                              Node: {mod.nodeName} ({mod.nodeType})
                            </div>
                            <div className="space-y-1 font-mono text-[11px]">
                              {mod.diffs.map((d) => (
                                <div
                                  key={d.path}
                                  className="flex items-center gap-2"
                                >
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {d.path}:
                                  </span>
                                  <span className="text-red-600 line-through">
                                    {JSON.stringify(d.before)}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-slate-400" />
                                  <span className="text-emerald-600 font-bold">
                                    {JSON.stringify(d.after)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Added Nodes */}
                {comparisonResult.addedNodes &&
                  comparisonResult.addedNodes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                        Added Nodes
                      </h4>
                      <div className="space-y-1.5">
                        {comparisonResult.addedNodes.map((n) => (
                          <div
                            key={n.id}
                            className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs flex items-center justify-between"
                          >
                            <span className="font-semibold text-emerald-900">
                              {n.name} ({n.type})
                            </span>
                            <span className="text-[11px] text-emerald-700 font-mono">
                              ID: {n.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Removed Nodes */}
                {comparisonResult.removedNodes &&
                  comparisonResult.removedNodes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-red-800">
                        Removed Nodes
                      </h4>
                      <div className="space-y-1.5">
                        {comparisonResult.removedNodes.map((n) => (
                          <div
                            key={n.id}
                            className="p-2.5 bg-red-50 rounded-lg border border-red-200 text-xs flex items-center justify-between"
                          >
                            <span className="font-semibold text-red-900 line-through">
                              {n.name} ({n.type})
                            </span>
                            <span className="text-[11px] text-red-700 font-mono">
                              ID: {n.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Edge Diffs */}
                {((comparisonResult.addedEdges &&
                  comparisonResult.addedEdges.length > 0) ||
                  (comparisonResult.removedEdges &&
                    comparisonResult.removedEdges.length > 0)) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Connection Edge Changes
                    </h4>
                    <div className="space-y-1 text-xs">
                      {comparisonResult.addedEdges?.map((e) => (
                        <div
                          key={e.id}
                          className="text-emerald-700 flex items-center gap-1 font-mono"
                        >
                          <span>+ Added Edge:</span> {e.source} -&gt; {e.target}
                        </div>
                      ))}
                      {comparisonResult.removedEdges?.map((e) => (
                        <div
                          key={e.id}
                          className="text-red-700 flex items-center gap-1 font-mono line-through"
                        >
                          <span>- Removed Edge:</span> {e.source} -&gt;{" "}
                          {e.target}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparisonResult.isIdentical && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-lg text-center text-xs">
                    Workflow structures are completely identical. No node or
                    edge changes detected.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
