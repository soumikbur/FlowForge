"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  X,
  CheckCircle2,
  CornerDownRight,
  Send,
  Trash2,
  Clock,
  Tag,
  Filter,
} from "lucide-react";

interface CommentAuthor {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface WorkflowCommentItem {
  id: string;
  workflowId: string;
  userId: string;
  content: string;
  nodeId?: string | null;
  draftRevision?: number | null;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: CommentAuthor | null;
  replies?: WorkflowCommentItem[];
}

interface CommentsDrawerProps {
  workflowId: string;
  draftRevision?: number;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function CommentsDrawer({
  workflowId,
  draftRevision = 1,
  isOpen,
  onClose,
  currentUserId,
}: CommentsDrawerProps) {
  const [comments, setComments] = useState<WorkflowCommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [newContent, setNewContent] = useState("");
  const [newNodeId, setNewNodeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    loadComments();
  }, [isOpen, workflowId, filter]);

  async function loadComments() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/comments?status=${filter}`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setComments(json.data);
        }
      }
    } catch {
      // Mock / fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/workflows/${workflowId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          nodeId: newNodeId.trim() || undefined,
          draftRevision,
        }),
      });

      if (res.ok) {
        setNewContent("");
        setNewNodeId("");
        await loadComments();
      }
    } catch {
      // Handle error
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!replyContent.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/workflows/${workflowId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
          draftRevision,
        }),
      });

      if (res.ok) {
        setReplyContent("");
        setReplyingToId(null);
        await loadComments();
      }
    } catch {
      // Handle error
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleResolve(
    commentId: string,
    currentResolved: boolean,
  ) {
    try {
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/comments/${commentId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isResolved: !currentResolved }),
        },
      );

      if (res.ok) {
        await loadComments();
      }
    } catch {
      // Handle error
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/comments/${commentId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        await loadComments();
      }
    } catch {
      // Handle error
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Discussions & Notes
          </h2>
          <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
            Rev {draftRevision}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-md hover:bg-slate-200 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-xs bg-white dark:bg-slate-900">
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          <button
            onClick={() => setFilter("open")}
            className={`px-2.5 py-1 rounded font-medium ${
              filter === "open"
                ? "bg-indigo-50 text-indigo-700 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setFilter("resolved")}
            className={`px-2.5 py-1 rounded font-medium ${
              filter === "resolved"
                ? "bg-indigo-50 text-indigo-700 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            }`}
          >
            Resolved
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded font-medium ${
              filter === "all"
                ? "bg-indigo-50 text-indigo-700 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            }`}
          >
            All
          </button>
        </div>
        <span className="text-slate-400 text-[11px]">
          {comments.length} threads
        </span>
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              No comments yet
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Leave feedback, pin node notes, or discuss changes.
            </p>
          </div>
        ) : (
          comments.map((item) => (
            <div
              key={item.id}
              className={`border rounded-lg p-3 text-xs ${
                item.isResolved
                  ? "bg-slate-50/70 border-slate-200 dark:border-slate-800 opacity-80"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs"
              }`}
            >
              {/* Comment Header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                    {item.author?.firstName?.[0] ||
                      item.author?.email?.[0] ||
                      "U"}
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.author?.firstName
                      ? `${item.author.firstName} ${item.author.lastName || ""}`
                      : item.author?.email || "Unknown User"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.draftRevision && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                      <Tag className="w-2.5 h-2.5" />
                      Rev {item.draftRevision}
                    </span>
                  )}
                  {item.nodeId && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-mono">
                      #{item.nodeId.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>

              {/* Comment Body */}
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {item.content}
              </p>

              {/* Comment Footer & Actions */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleToggleResolve(item.id, item.isResolved)
                    }
                    className={`inline-flex items-center gap-1 font-semibold ${
                      item.isResolved
                        ? "text-emerald-600 hover:text-emerald-700"
                        : "text-slate-500 dark:text-slate-400 hover:text-indigo-600"
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {item.isResolved ? "Resolved" : "Resolve"}
                  </button>

                  <button
                    onClick={() =>
                      setReplyingToId(replyingToId === item.id ? null : item.id)
                    }
                    className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 font-medium"
                  >
                    Reply
                  </button>

                  {(currentUserId === item.userId || !currentUserId) && (
                    <button
                      onClick={() => handleDeleteComment(item.id)}
                      className="text-slate-400 hover:text-red-600 p-0.5"
                      title="Delete comment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Nested Replies */}
              {item.replies && item.replies.length > 0 && (
                <div className="mt-3 pl-3 border-l-2 border-indigo-100 space-y-2.5">
                  {item.replies.map((reply) => (
                    <div key={reply.id} className="pt-1">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {reply.author?.firstName ||
                            reply.author?.email ||
                            "User"}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          {new Date(reply.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Form */}
              {replyingToId === item.id && (
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                  <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleReply(item.id);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleReply(item.id)}
                    disabled={isSubmitting || !replyContent.trim()}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Top-Level Comment Form */}
      <form
        onSubmit={handleAddComment}
        className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
      >
        <div className="mb-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a comment or design note..."
            rows={2}
            className="w-full border border-slate-300 rounded-md p-2 text-xs focus:outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={newNodeId}
            onChange={(e) => setNewNodeId(e.target.value)}
            placeholder="Node ID (optional)"
            className="w-36 border border-slate-300 rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={isSubmitting || !newContent.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md shadow-xs transition"
          >
            <Send className="w-3 h-3" />
            <span>Post</span>
          </button>
        </div>
      </form>
    </div>
  );
}
