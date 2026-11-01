"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  UserPlus,
  Trash2,
  Crown,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { CollaboratorRole } from "@flowforge/shared";

interface UserProfile {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface Collaborator {
  id: string;
  workflowId: string;
  userId: string;
  role: CollaboratorRole;
  user?: UserProfile | null;
  createdAt: string;
}

interface CollaborationModalProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
  canManageCollaborators: boolean;
  isOwner: boolean;
  currentOwner?: UserProfile | null;
}

export function CollaborationModal({
  workflowId,
  isOpen,
  onClose,
  canManageCollaborators,
  isOwner,
  currentOwner,
}: CollaborationModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add collaborator form
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<CollaboratorRole>("EDITOR");
  const [isAdding, setIsAdding] = useState(false);

  // Transfer ownership form
  const [transferUserId, setTransferUserId] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadCollaborators();
  }, [isOpen, workflowId]);

  async function loadCollaborators() {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/v1/workflows/${workflowId}/collaborators`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCollaborators(json.data);
        }
      }
    } catch {
      // In mock/test environments
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCollaborator(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserId.trim()) return;

    try {
      setIsAdding(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/v1/workflows/${workflowId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newUserId.trim(), role: newRole }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to add collaborator.");
      }

      setSuccessMsg("Collaborator added successfully.");
      setNewUserId("");
      loadCollaborators();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleUpdateRole(userId: string, role: CollaboratorRole) {
    try {
      setErrorMsg(null);
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/collaborators/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (res.ok) {
        loadCollaborators();
      }
    } catch {
      // Handle silently
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    try {
      setErrorMsg(null);
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/collaborators/${userId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        loadCollaborators();
      }
    } catch {
      // Handle silently
    }
  }

  async function handleTransferOwnership(e: React.FormEvent) {
    e.preventDefault();
    if (!transferUserId.trim()) return;

    try {
      setIsTransferring(true);
      setErrorMsg(null);

      const res = await fetch(
        `/api/v1/workflows/${workflowId}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newOwnerId: transferUserId.trim() }),
        },
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to transfer ownership.");
      }

      setSuccessMsg("Workflow ownership transferred successfully.");
      setShowTransferConfirm(false);
      setTransferUserId("");
      loadCollaborators();
    } catch (err: any) {
      setErrorMsg(err.message || "Transfer failed.");
    } finally {
      setIsTransferring(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Manage Collaborators
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Current Owner Banner */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-bold text-xs">
              <Crown className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Workflow Owner
              </span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {currentOwner?.firstName
                  ? `${currentOwner.firstName} ${currentOwner.lastName || ""}`
                  : currentOwner?.email || "Primary Owner"}
              </p>
            </div>
          </div>

          {isOwner && (
            <button
              onClick={() => setShowTransferConfirm(!showTransferConfirm)}
              className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline"
            >
              Transfer
            </button>
          )}
        </div>

        {/* Transfer Ownership Form */}
        {showTransferConfirm && (
          <form
            onSubmit={handleTransferOwnership}
            className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2"
          >
            <h4 className="text-xs font-bold text-amber-900">
              Transfer Workflow Ownership
            </h4>
            <p className="text-[11px] text-amber-700">
              Enter the User ID of the organization member who will become the
              new owner.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="User ID (e.g. usr_123)"
                value={transferUserId}
                onChange={(e) => setTransferUserId(e.target.value)}
                className="flex-1 bg-white dark:bg-slate-900 border border-amber-300 rounded px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-600"
              />
              <button
                type="submit"
                disabled={isTransferring}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
              >
                {isTransferring ? "Transferring..." : "Confirm"}
              </button>
            </div>
          </form>
        )}

        {/* Add Collaborator Form */}
        {canManageCollaborators && (
          <form
            onSubmit={handleAddCollaborator}
            className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"
          >
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Add Team Member
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Enter member's User ID..."
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as CollaboratorRole)}
                className="border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="VIEWER">Viewer (Read-only)</option>
                <option value="EDITOR">Editor (Edit Drafts)</option>
                <option value="MAINTAINER">
                  Maintainer (Publish & Manage)
                </option>
              </select>
              <button
                type="submit"
                disabled={isAdding}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>
        )}

        {/* Collaborators List */}
        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Active Collaborators ({collaborators.length})
          </h4>

          {loading ? (
            <div className="text-center py-4 text-xs text-slate-400">
              Loading team...
            </div>
          ) : collaborators.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-400">
              No additional collaborators assigned yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  className="p-3 flex items-center justify-between bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                      {c.user?.firstName
                        ? c.user.firstName[0].toUpperCase()
                        : "U"}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {c.user?.firstName
                          ? `${c.user.firstName} ${c.user.lastName || ""}`
                          : c.user?.email || c.userId}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {c.user?.email || c.userId}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManageCollaborators ? (
                      <select
                        value={c.role}
                        onChange={(e) =>
                          handleUpdateRole(
                            c.userId,
                            e.target.value as CollaboratorRole,
                          )
                        }
                        className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
                      >
                        <option value="VIEWER">Viewer</option>
                        <option value="EDITOR">Editor</option>
                        <option value="MAINTAINER">Maintainer</option>
                      </select>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {c.role}
                      </span>
                    )}

                    {canManageCollaborators && (
                      <button
                        onClick={() => handleRemoveCollaborator(c.userId)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                        title="Remove collaborator"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
