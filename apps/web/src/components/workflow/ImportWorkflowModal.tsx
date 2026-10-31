"use client";

import React, { useState, useEffect } from "react";
import {
  Upload,
  X,
  AlertTriangle,
  CheckCircle,
  FileText,
  Loader2,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface ImportWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workflow: any) => void;
}

export function ImportWorkflowModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportWorkflowModalProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [packageJson, setPackageJson] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Form inputs
  const [conflictStrategy, setConflictStrategy] = useState<
    "CREATE_NEW" | "RENAME" | "REPLACE_DRAFT"
  >("CREATE_NEW");
  const [targetName, setTargetName] = useState("");
  const [targetWorkflowId, setTargetWorkflowId] = useState("");
  const [connectorMappings, setConnectorMappings] = useState<
    Record<string, string>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPackageJson(null);
      setPreview(null);
      setPreviewError(null);
      setSubmitError(null);
      setTargetName("");
      setTargetWorkflowId("");
      setConnectorMappings({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewError(null);
    setSubmitError(null);
    setLoadingPreview(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        setPackageJson(parsed);

        // Fetch dry-run import preview from backend
        const res = await fetch("/api/v1/workflows/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: parsed }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          setPreviewError(data.error?.message || "Failed to analyze package.");
          setPreview(null);
        } else {
          setPreview(data.data);
          setTargetName(data.data.suggestedName || data.data.workflowName);
          if (data.data.conflict?.hasConflict) {
            setConflictStrategy("RENAME");
            setTargetWorkflowId(data.data.conflict.conflictingWorkflowId || "");
          } else {
            setConflictStrategy("CREATE_NEW");
          }

          // Pre-populate default connector mappings where matching connections exist
          const defaultMappings: Record<string, string> = {};
          data.data.connectorRequirements?.forEach((req: any) => {
            if (req.matchingOrgConnections?.length > 0) {
              const key = req.sourceConnectionId || req.connectorId;
              defaultMappings[key] = req.matchingOrgConnections[0].id;
            }
          });
          setConnectorMappings(defaultMappings);
        }
      } catch (err: any) {
        setPreviewError("Invalid JSON file. Please select a valid FlowForge package.");
      } finally {
        setLoadingPreview(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageJson || !preview) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        package: packageJson,
        conflictStrategy,
        targetWorkflowName: targetName.trim() || undefined,
        targetWorkflowId:
          conflictStrategy === "REPLACE_DRAFT"
            ? targetWorkflowId || preview.conflict?.conflictingWorkflowId
            : undefined,
        connectorMappings,
      };

      const res = await fetch("/api/v1/workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setSubmitError(result.error?.message || "Failed to import workflow.");
      } else {
        if (onSuccess) onSuccess(result.data.workflow);
        onClose();
        router.push(`/workflows/${result.data.workflow.id}/builder`);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Network error while importing workflow.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPATIBLE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3.5 h-3.5" /> Fully Compatible
          </span>
        );
      case "COMPATIBLE_WITH_WARNINGS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Compatible with Warnings
          </span>
        );
      case "REQUIRES_MAPPING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <AlertCircle className="w-3.5 h-3.5" /> Requires Connector Mapping
          </span>
        );
      case "UNSUPPORTED":
      case "INVALID_PACKAGE":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <AlertTriangle className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Import Workflow Package
              </h3>
              <p className="text-xs text-slate-500">
                Upload a portable FlowForge package to inspect and import into your organization.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Upload Stage */}
        {!preview && (
          <div className="space-y-4">
            <label className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition bg-slate-50/50 hover:bg-teal-50/30">
              <FileText className="w-10 h-10 text-slate-400" />
              <div className="text-center">
                <span className="text-sm font-semibold text-teal-600">
                  Click to select package file
                </span>
                <span className="text-sm text-slate-500"> or drag and drop</span>
                <p className="text-xs text-slate-400 mt-1">
                  Supports *.flowforge.json or *.json packages (max 5MB)
                </p>
              </div>
              <input
                type="file"
                accept=".json,.flowforge.json"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {loadingPreview && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span>Validating package structure and dependencies...</span>
              </div>
            )}

            {previewError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{previewError}</span>
              </div>
            )}
          </div>
        )}

        {/* Compatibility Preview & Mapping Stage */}
        {preview && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Package Overview Card */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {preview.workflowName}
                  </h4>
                  {preview.description && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {preview.description}
                    </p>
                  )}
                </div>
                {getStatusBadge(preview.status)}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200">
                <span className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  {preview.nodeSummary?.totalNodes || 0} nodes
                </span>
                <span>Format: {preview.packageFormatVersion}</span>
                {preview.integrityVerified && (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" /> Hash verified
                  </span>
                )}
              </div>
            </div>

            {/* Warnings or Blocking Errors */}
            {preview.blockingErrors?.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Import Blocked:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.blockingErrors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings?.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Compatibility Warnings:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.warnings.map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Connector Mappings Section */}
            {preview.connectorRequirements?.length > 0 && (
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Required Connector Mappings
                </label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                  {preview.connectorRequirements.map((req: any, idx: number) => {
                    const key = req.sourceConnectionId || req.connectorId;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800">
                            {req.connectorId}
                          </span>
                          {req.sourceConnectionId && (
                            <span className="text-slate-400 ml-1.5">
                              ({req.sourceConnectionId})
                            </span>
                          )}
                        </div>
                        <div className="w-1/2">
                          {req.matchingOrgConnections?.length > 0 ? (
                            <select
                              value={connectorMappings[key] || ""}
                              onChange={(e) =>
                                setConnectorMappings({
                                  ...connectorMappings,
                                  [key]: e.target.value,
                                })
                              }
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500 bg-white"
                            >
                              <option value="">-- Select Connection --</option>
                              {req.matchingOrgConnections.map((c: any) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-rose-600 font-medium italic">
                              No connections in org
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conflict Strategy & Destination Name */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Destination Workflow Configuration
              </label>

              {preview.conflict?.hasConflict && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    Conflict Resolution Strategy:
                  </span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="RENAME"
                        checked={conflictStrategy === "RENAME"}
                        onChange={() => setConflictStrategy("RENAME")}
                        className="text-teal-600"
                      />
                      <span>Rename imported workflow</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="CREATE_NEW"
                        checked={conflictStrategy === "CREATE_NEW"}
                        onChange={() => setConflictStrategy("CREATE_NEW")}
                        className="text-teal-600"
                      />
                      <span>Create as new workflow</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="REPLACE_DRAFT"
                        checked={conflictStrategy === "REPLACE_DRAFT"}
                        onChange={() => setConflictStrategy("REPLACE_DRAFT")}
                        className="text-teal-600"
                      />
                      <span>
                        Replace draft of &apos;{preview.conflict.conflictingWorkflowName}&apos;
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {conflictStrategy !== "REPLACE_DRAFT" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              )}
            </div>

            {submitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setSelectedFile(null);
                }}
                className="text-xs text-slate-600 hover:text-slate-800 font-medium px-3 py-1.5"
              >
                Change Package
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!preview.canImport || submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm &amp; Import Workflow</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
