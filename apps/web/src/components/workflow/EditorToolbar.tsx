import React, { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";

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
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);

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
    <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-10 shrink-0">
      {/* Left: Back Link & Workflow Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/workflows"
          title="Return to Workflows"
          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 transition"
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
              className="text-sm font-bold text-slate-900 border border-teal-500 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
              className="flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-teal-700 transition group"
            >
              <span className="truncate max-w-[280px]">{name}</span>
              {!isReadOnly && (
                <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-teal-600 opacity-0 group-hover:opacity-100 transition" />
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
                    : "bg-slate-100 text-slate-700 border border-slate-200"
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
              <span className="flex items-center gap-1 text-slate-500 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
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
            <span className="flex items-center gap-1 text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Historical Snapshot
            </span>
            {onReturnToDraft && (
              <button
                onClick={onReturnToDraft}
                className="text-xs text-teal-700 hover:text-teal-900 font-semibold underline underline-offset-2"
              >
                Switch to Editable Draft
              </button>
            )}
          </div>
        )}

        {/* Undo / Redo controls */}
        {!isReadOnly && (
          <div className="flex items-center gap-0.5 border border-slate-200 rounded-md p-0.5 bg-slate-50">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 rounded transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 rounded transition"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {!isReadOnly && (
          <>
            <button
              onClick={onValidate}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold transition ${
                hasErrors
                  ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                  : "border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
              }`}
            >
              <CheckCircle className={`w-3.5 h-3.5 ${hasErrors ? "text-red-500" : "text-slate-500"}`} />
              <span>Validate</span>
            </button>

            <button
              onClick={onSave}
              disabled={saveStatus === "saving"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <Save className="w-3.5 h-3.5 text-slate-600" />
              <span>Save Draft</span>
            </button>

            <button
              onClick={onPublish}
              disabled={saveStatus === "saving" || hasErrors}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-xs transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

