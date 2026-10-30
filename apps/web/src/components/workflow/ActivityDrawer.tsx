"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  X,
  PlusCircle,
  FileEdit,
  Send,
  Crown,
  UserPlus,
  UserMinus,
  ShieldAlert,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Clock,
} from "lucide-react";
import { WorkflowActivityType } from "@flowforge/shared";

interface ActivityActor {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface ActivityEvent {
  id: string;
  workflowId: string;
  userId: string;
  type: WorkflowActivityType;
  metadata?: Record<string, any> | null;
  createdAt: string;
  actor?: ActivityActor | null;
}

interface ActivityDrawerProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityDrawer({ workflowId, isOpen, onClose }: ActivityDrawerProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadActivities();
  }, [isOpen, workflowId]);

  async function loadActivities() {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/workflows/${workflowId}/activities`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setActivities(json.data);
        }
      }
    } catch {
      // Mock / fallback
    } finally {
      setLoading(false);
    }
  }

  function renderEventIcon(type: WorkflowActivityType) {
    switch (type) {
      case "WORKFLOW_CREATED":
        return <PlusCircle className="w-4 h-4 text-emerald-600" />;
      case "DRAFT_UPDATED":
        return <FileEdit className="w-4 h-4 text-blue-600" />;
      case "WORKFLOW_PUBLISHED":
        return <Send className="w-4 h-4 text-teal-600" />;
      case "OWNERSHIP_TRANSFERRED":
        return <Crown className="w-4 h-4 text-purple-600" />;
      case "COLLABORATOR_ADDED":
        return <UserPlus className="w-4 h-4 text-indigo-600" />;
      case "COLLABORATOR_REMOVED":
        return <UserMinus className="w-4 h-4 text-red-600" />;
      case "COLLABORATOR_ROLE_UPDATED":
        return <ShieldAlert className="w-4 h-4 text-amber-600" />;
      case "COMMENT_ADDED":
        return <MessageSquare className="w-4 h-4 text-slate-600" />;
      case "COMMENT_RESOLVED":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "COMMENT_DELETED":
        return <Trash2 className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  }

  function formatEventDescription(event: ActivityEvent) {
    const actorName = event.actor?.firstName
      ? `${event.actor.firstName} ${event.actor.lastName || ""}`
      : event.actor?.email || "Someone";

    switch (event.type) {
      case "WORKFLOW_CREATED":
        return `${actorName} created this workflow.`;
      case "DRAFT_UPDATED":
        return `${actorName} updated draft (revision ${event.metadata?.draftRevision ?? "new"}).`;
      case "WORKFLOW_PUBLISHED":
        return `${actorName} published version ${event.metadata?.versionNumber ?? "1"}.`;
      case "OWNERSHIP_TRANSFERRED":
        return `${actorName} transferred ownership to ${event.metadata?.newOwnerEmail ?? "new owner"}.`;
      case "COLLABORATOR_ADDED":
        return `${actorName} added ${event.metadata?.targetEmail ?? "a member"} as ${event.metadata?.role ?? "collaborator"}.`;
      case "COLLABORATOR_REMOVED":
        return `${actorName} removed a collaborator.`;
      case "COLLABORATOR_ROLE_UPDATED":
        return `${actorName} changed role to ${event.metadata?.role ?? "updated"}.`;
      case "COMMENT_ADDED":
        return `${actorName} posted a comment.`;
      case "COMMENT_RESOLVED":
        return `${actorName} resolved a comment.`;
      case "COMMENT_DELETED":
        return `${actorName} deleted a comment.`;
      default:
        return `${actorName} performed an action.`;
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-teal-600" />
          <h2 className="font-bold text-slate-800 text-sm">Activity & Audit Feed</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Activity Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading activity feed...</div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center">
            <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">No activity recorded yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Draft changes, publishes, and collaborator events will appear here.
            </p>
          </div>
        ) : (
          <div className="relative border-l border-slate-200 ml-3 space-y-5">
            {activities.map((item) => (
              <div key={item.id} className="relative pl-6">
                {/* Node icon bubble */}
                <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                  {renderEventIcon(item.type)}
                </div>

                {/* Event card */}
                <div>
                  <p className="text-xs text-slate-800 leading-snug font-medium">
                    {formatEventDescription(item)}
                  </p>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
