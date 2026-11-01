import React, { useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  RotateCw,
  Send,
  Loader2,
  Lock,
  Edit2,
  Eye,
  BookOpen,
  X,
  Users,
  MessageSquare,
  History,
  Download,
  HelpCircle,
  Keyboard,
} from "lucide-react";
import { CollaborationModal } from "./CollaborationModal";
import { CommentsDrawer } from "./CommentsDrawer";
import { ActivityDrawer } from "./ActivityDrawer";
import { Modal } from "../ui/Modal";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

interface EditorToolbarProps {
  workflowId: string;
  name: string;
  onNameChange: (newName: string) => void;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  versionNumber?: number;
  isReadOnly?: boolean;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  onSave: () => void;
  onPublish: () => void;
  onReturnToDraft?: () => void;
  hasErrors?: boolean;
  accessLevel?: "OWNER" | "MAINTAINER" | "EDITOR" | "VIEWER";
  draftRevision?: number;
  owner?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  workflowId,
  name,
  onNameChange,
  status,
  versionNumber,
  isReadOnly = false,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onValidate,
  onSave,
  onPublish,
  onReturnToDraft,
  hasErrors = false,
  accessLevel,
  draftRevision,
  owner,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showCommentsDrawer, setShowCommentsDrawer] = useState(false);
  const [showActivityDrawer, setShowActivityDrawer] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [templateShortDesc, setTemplateShortDesc] = useState("");
  const [templateCategory, setTemplateCategory] = useState("General");
  const [templateVisibility, setTemplateVisibility] = useState<
    "PRIVATE" | "ORGANIZATION"
  >("PRIVATE");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSuccess, setTemplateSuccess] = useState(false);

  const handleExport = (target: "draft" | "published") => {
    const apiUrl = getApiBaseUrl();
    const url =
      target === "published" && versionNumber
        ? `${apiUrl}/api/v1/workflows/${workflowId}/export?target=version&versionNumber=${versionNumber}`
        : `${apiUrl}/api/v1/workflows/${workflowId}/export?target=${target}`;
    window.open(url, "_blank");
  };

  const handleSaveAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingTemplate(true);
      const res = await fetch("/api/v1/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          shortDescription:
            templateShortDesc.trim() ||
            `Template created from workflow ${name}`,
          category: templateCategory,
          visibility: templateVisibility,
          workflowId,
        }),
      });
      if (res.ok) {
        setTemplateSuccess(true);
        setTimeout(() => {
          setShowTemplateModal(false);
          setTemplateSuccess(false);
        }, 1500);
      }
    } catch {
      // Ignore network errors in demo/mock mode
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (tempName.trim() && tempName.trim() !== name) {
      onNameChange(tempName.trim());
    } else {
      setTempName(name);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameBlur();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setTempName(name);
    }
  };

  return (
    <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between z-10 shrink-0">
      {/* Left: Back Link & Workflow Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/workflows"
          title="Return to Workflows"
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="h-4 w-px bg-slate-200" />

        <div className="flex items-center gap-2">
          {isEditingName && !isReadOnly ? (
            <input
              type="text"
              value={tempName}
              autoFocus
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className="text-sm font-bold text-slate-900 dark:text-slate-100 border border-indigo-500 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <button
              onClick={() => {
                if (!isReadOnly) {
                  setTempName(name);
                  setIsEditingName(true);
                }
              }}
              disabled={isReadOnly}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-700 transition group"
            >
              <span className="truncate max-w-[280px]">{name}</span>
              {!isReadOnly && (
                <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition" />
              )}
            </button>
          )}

          {/* Status Badge */}
          {isReadOnly ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              <Eye className="w-3 h-3" />
              Version {versionNumber ?? 1} (Read-only)
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : status === "DRAFT"
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Center: Save Status Indicator */}
      <div className="flex items-center gap-3">
        {!isReadOnly ? (
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                Save failed
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Historical Snapshot
            </span>
            {onReturnToDraft && (
              <button
                onClick={onReturnToDraft}
                className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline underline-offset-2"
              >
                Switch to Editable Draft
              </button>
            )}
          </div>
        )}

        {/* Undo / Redo controls */}
        {!isReadOnly && (
          <div className="flex items-center gap-0.5 border border-slate-200 dark:border-slate-800 rounded-md p-0.5 bg-slate-50 dark:bg-slate-800/60">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo canvas change"
              className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-600 dark:text-slate-400 rounded transition focus-ring"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo canvas change"
              className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-600 dark:text-slate-400 rounded transition focus-ring"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {!isReadOnly && (
          <>
            <button
              onClick={onValidate}
              aria-label="Validate workflow"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold transition focus-ring shrink-0 ${
                hasErrors
                  ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                  : "border-slate-300 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60"
              }`}
            >
              <CheckCircle
                className={`w-3.5 h-3.5 ${hasErrors ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}
              />
              <span>Validate</span>
            </button>

            <button
              onClick={onSave}
              disabled={saveStatus === "saving"}
              aria-label="Save draft"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 disabled:opacity-50 transition focus-ring shrink-0"
            >
              <Save className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Save Draft</span>
            </button>

            <button
              onClick={() => setShowTemplateModal(true)}
              aria-label="Save this workflow as a reusable template"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
              title="Save this workflow as a reusable template"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Save as Template</span>
            </button>

            <button
              onClick={onPublish}
              disabled={saveStatus === "saving" || hasErrors}
              aria-label="Publish workflow version"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-xs transition focus-ring shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish</span>
            </button>
          </>
        )}

        <button
          onClick={() => handleExport(isReadOnly ? "published" : "draft")}
          aria-label={`Export ${isReadOnly ? "Version " + (versionNumber ?? 1) : "Draft"} Package`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
          title={`Export ${isReadOnly ? "Version " + (versionNumber ?? 1) : "Draft"} Package`}
        >
          <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          <span>Export</span>
        </button>

        {/* Collaboration, Discussions & Activity Controls */}
        <div className="h-4 w-px bg-slate-200 mx-1 shrink-0" />

        <button
          onClick={() => setShowCollabModal(true)}
          aria-label="Manage Collaborators & Permissions"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
          title="Manage Collaborators & Permissions"
        >
          <Users className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          <span>Team</span>
        </button>

        <button
          onClick={() => setShowCommentsDrawer(true)}
          aria-label="Workflow Discussions & Comments"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
          title="Workflow Discussions & Comments"
        >
          <MessageSquare className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          <span>Comments</span>
        </button>

        <button
          onClick={() => setShowActivityDrawer(true)}
          aria-label="Activity & Audit Feed"
          className="inline-flex items-center gap-1 px-2 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
          title="Activity & Audit Feed"
        >
          <History className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
        </button>

        <button
          onClick={() => setShowShortcutsModal(true)}
          aria-label="Keyboard Shortcuts"
          className="inline-flex items-center gap-1 px-2 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60 transition focus-ring shrink-0"
          title="Keyboard Shortcuts"
        >
          <HelpCircle className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Collaboration Modal */}
      <CollaborationModal
        workflowId={workflowId}
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        canManageCollaborators={
          accessLevel === "OWNER" ||
          accessLevel === "MAINTAINER" ||
          !accessLevel
        }
        isOwner={accessLevel === "OWNER" || !accessLevel}
        currentOwner={owner}
      />

      {/* Comments Drawer */}
      <CommentsDrawer
        workflowId={workflowId}
        draftRevision={draftRevision}
        isOpen={showCommentsDrawer}
        onClose={() => setShowCommentsDrawer(false)}
      />

      {/* Activity Drawer */}
      <ActivityDrawer
        workflowId={workflowId}
        isOpen={showActivityDrawer}
        onClose={() => setShowActivityDrawer(false)}
      />

      {/* Save As Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveAsTemplate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Save Workflow as Template
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {templateSuccess ? (
              <div className="py-8 text-center text-emerald-600 text-xs font-semibold">
                âœ“ Template saved successfully! Credentials have been safely
                scrubbed.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    disabled
                    value={name}
                    className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Short Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={templateShortDesc}
                    onChange={(e) => setTemplateShortDesc(e.target.value)}
                    placeholder="Briefly describe what this workflow accomplishes..."
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="DevOps">DevOps</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="Customer Support">Customer Support</option>
                      <option value="Security">Security</option>
                      <option value="Marketing">Marketing</option>
                      <option value="General">General</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Visibility
                    </label>
                    <select
                      value={templateVisibility}
                      onChange={(e) =>
                        setTemplateVisibility(e.target.value as any)
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="PRIVATE">Private to Me</option>
                      <option value="ORGANIZATION">Organization Shared</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded p-2 text-[10px] text-slate-500 dark:text-slate-400">
                  Note: All passwords, API keys, tokens, and active execution
                  state will be automatically redacted before template
                  persistence.
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTemplate}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded shadow-xs"
                  >
                    {isSavingTemplate ? "Saving..." : "Save Template"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
      {/* Keyboard Shortcuts Modal */}
      <Modal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        title="Workflow Builder Keyboard Shortcuts"
      >
        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
          <p className="text-slate-500 dark:text-slate-400">
            Use these keyboard shortcuts to navigate and edit workflows faster.
          </p>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100">
            {[
              { keys: ["Ctrl", "S"], desc: "Save workflow draft" },
              { keys: ["Ctrl", "Z"], desc: "Undo last canvas edit" },
              { keys: ["Ctrl", "Y"], desc: "Redo undone canvas edit" },
              { keys: ["Delete"], desc: "Delete selected node or connection" },
              { keys: ["Escape"], desc: "Deselect node / close drawer" },
              {
                keys: ["Enter / Space"],
                desc: "Place selected palette node on canvas",
              },
              { keys: ["Shift + Drag"], desc: "Multi-select nodes" },
            ].map((shortcut, i) => (
              <div key={i} className="flex items-center justify-between p-2.5">
                <span className="text-slate-600 dark:text-slate-400">
                  {shortcut.desc}
                </span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((k) => (
                    <kbd
                      key={k}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 rounded font-mono text-[11px] text-slate-800 dark:text-slate-200 shadow-xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
