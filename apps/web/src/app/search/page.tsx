"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Workflow,
  PlayCircle,
  CheckSquare,
  BookOpen,
  Radio,
  Plug,
  Package,
  ShieldAlert,
  Clock,
  Bookmark,
  Trash2,
  Filter,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface SearchResultItem {
  id: string;
  resourceType: string;
  title: string;
  summary: string;
  status?: string;
  organizationId: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt?: string;
  navigationUrl: string;
  matchedFields: string[];
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

interface UnifiedSearchResponse {
  query: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: SearchResultItem[];
  facets: {
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  executionTimeMs: number;
}

interface SavedSearchRecord {
  id: string;
  name: string;
  query: string;
  types: string[];
  isShared: boolean;
  createdAt: string;
}

const RESOURCE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; bgColor: string }
> = {
  workflow: {
    label: "Workflow",
    icon: Workflow,
    color: "text-indigo-400",
    bgColor: "bg-indigo-950/60 border-indigo-800/60",
  },
  workflow_version: {
    label: "Version",
    icon: Clock,
    color: "text-cyan-400",
    bgColor: "bg-cyan-950/60 border-cyan-800/60",
  },
  execution: {
    label: "Execution",
    icon: PlayCircle,
    color: "text-blue-400",
    bgColor: "bg-blue-950/60 border-blue-800/60",
  },
  approval: {
    label: "Approval",
    icon: CheckSquare,
    color: "text-purple-400",
    bgColor: "bg-purple-950/60 border-purple-800/60",
  },
  template: {
    label: "Template",
    icon: BookOpen,
    color: "text-emerald-400",
    bgColor: "bg-emerald-950/60 border-emerald-800/60",
  },
  event: {
    label: "Event",
    icon: Radio,
    color: "text-amber-400",
    bgColor: "bg-amber-950/60 border-amber-800/60",
  },
  connector: {
    label: "Connector",
    icon: Plug,
    color: "text-green-400",
    bgColor: "bg-green-950/60 border-green-800/60",
  },
  extension: {
    label: "Extension",
    icon: Package,
    color: "text-indigo-400",
    bgColor: "bg-indigo-950/60 border-indigo-800/60",
  },
  audit_log: {
    label: "Audit Log",
    icon: ShieldAlert,
    color: "text-rose-400",
    bgColor: "bg-rose-950/60 border-rose-800/60",
  },
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("relevance");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<UnifiedSearchResponse | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newSearchName, setNewSearchName] = useState("");
  const [saveShared, setSaveShared] = useState(false);

  const fetchSearch = useCallback(
    async (q: string, type: string, status: string, sort: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("query", q);
        if (type && type !== "all") params.set("types", type);
        if (status) params.set("status", status);
        if (sort) params.set("sortBy", sort);
        params.set("pageSize", "30");

        const res = await fetch(`/api/v1/search?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setResponse(json.data);
          }
        }
      } catch (err) {
        console.error("Search fetch failed", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchSavedSearches = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/search/saved");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSavedSearches(json.data);
        }
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    fetchSearch(query, selectedType, statusFilter, sortBy);
    fetchSavedSearches();
  }, [
    fetchSearch,
    fetchSavedSearches,
    query,
    selectedType,
    statusFilter,
    sortBy,
  ]);

  const handleSaveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSearchName.trim()) return;

    try {
      const res = await fetch("/api/v1/search/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSearchName.trim(),
          query: query,
          types: selectedType !== "all" ? [selectedType] : [],
          filters: { status: statusFilter },
          isShared: saveShared,
        }),
      });
      if (res.ok) {
        setSaveModalOpen(false);
        setNewSearchName("");
        fetchSavedSearches();
      }
    } catch (err) {
      console.error("Failed to save search", err);
    }
  };

  const handleDeleteSavedSearch = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/search/saved/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchSavedSearches();
      }
    } catch (err) {
      console.error("Failed to delete saved search", err);
    }
  };

  const applySavedSearch = (saved: SavedSearchRecord) => {
    setQuery(saved.query || "");
    setSelectedType(
      saved.types && saved.types.length > 0 ? saved.types[0] : "all",
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-indigo-400" />
              <span>Unified Enterprise Search & Discovery</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Search and inspect workflows, versions, executions, approvals,
              templates, events, connectors, and audit logs across your tenant.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSaveModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 transition"
              title="Save current search criteria"
            >
              <Bookmark className="w-4 h-4 text-indigo-400" />
              <span>Save Search</span>
            </button>
          </div>
        </div>

        {/* Search Bar Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, name, description, trigger type, or tags (e.g. 'Payment', 'Order', 'exec_123', 'HTTP')..."
            className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base transition shadow-lg"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Toolbar & Resource Types */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                selectedType === "all"
                  ? "bg-indigo-500 text-slate-950 border-indigo-400 shadow"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-800"
              }`}
            >
              All Types {response ? `(${response.total})` : ""}
            </button>

            {Object.entries(RESOURCE_TYPE_CONFIG).map(([typeKey, cfg]) => {
              const Icon = cfg.icon;
              const count = response?.facets.byType[typeKey] || 0;
              const isSelected = selectedType === typeKey;
              return (
                <button
                  key={typeKey}
                  onClick={() => setSelectedType(isSelected ? "all" : typeKey)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    isSelected
                      ? `${cfg.bgColor} ${cfg.color} border-current shadow`
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-800 hover:text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cfg.label}</span>
                  {count > 0 && (
                    <span className="ml-1 text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <span>Filters:</span>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="SUCCEEDED">SUCCEEDED</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
                <option value="WAITING_APPROVAL">WAITING_APPROVAL</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="relevance">Sort by: Relevance</option>
                <option value="createdAt">Sort by: Newest</option>
                <option value="updatedAt">Sort by: Recently Updated</option>
              </select>
            </div>

            {response && (
              <div className="text-slate-500 dark:text-slate-400">
                Found{" "}
                <strong className="text-slate-900 dark:text-white">
                  {response.total}
                </strong>{" "}
                results in{" "}
                <span className="text-indigo-400">
                  {response.executionTimeMs}ms
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Results Column */}
          <div className="lg:col-span-3 space-y-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : response && response.results.length > 0 ? (
              <div className="space-y-3">
                {response.results.map((item) => {
                  const cfg =
                    RESOURCE_TYPE_CONFIG[item.resourceType] ||
                    RESOURCE_TYPE_CONFIG.workflow;
                  const Icon = cfg.icon;

                  return (
                    <Link
                      key={`${item.resourceType}_${item.id}`}
                      href={item.navigationUrl}
                      className="block group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 rounded-xl transition shadow hover:shadow-indigo-950/20"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-lg border ${cfg.bgColor} ${cfg.color} mt-0.5`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${cfg.bgColor} ${cfg.color}`}
                              >
                                {cfg.label}
                              </span>
                              <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-indigo-400 transition flex items-center gap-1.5">
                                <span>{item.title}</span>
                                <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition text-indigo-400" />
                              </h3>
                              {item.status && (
                                <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-800 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700">
                                  {item.status}
                                </span>
                              )}
                            </div>

                            {item.snippet && (
                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 font-mono bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/60 p-2 rounded border border-slate-200 dark:border-slate-200 dark:border-slate-800/80">
                                {item.snippet}
                              </p>
                            )}

                            <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
                              <span>ID: {item.id}</span>
                              <span>
                                Created:{" "}
                                {new Date(item.createdAt).toLocaleDateString()}
                              </span>
                              {item.matchedFields.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span>Matched:</span>
                                  {item.matchedFields.map((f) => (
                                    <span
                                      key={f}
                                      className="text-indigo-400 bg-indigo-950/40 px-1 rounded text-[10px]"
                                    >
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <Search className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  No matching resources found
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Try broadening your search term, clearing status filters, or
                  selecting &quot;All Types&quot;.
                </p>
              </div>
            )}
          </div>

          {/* Sidebar / Saved Searches */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <Bookmark className="w-4 h-4 text-indigo-400" />
                <span>Saved Searches</span>
              </h2>

              {savedSearches.length > 0 ? (
                <div className="space-y-2">
                  {savedSearches.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 text-xs transition"
                    >
                      <button
                        onClick={() => applySavedSearch(s)}
                        className="text-left flex-1 truncate pr-2 text-slate-700 dark:text-slate-300 hover:text-indigo-400 font-medium"
                      >
                        <div className="truncate">{s.name}</div>
                        {s.query && (
                          <div className="text-[10px] text-slate-500 truncate">
                            &quot;{s.query}&quot;
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteSavedSearch(s.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition"
                        title="Delete saved search"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No saved searches yet. Save your frequent query filters for
                  one-click discovery.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Search Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-indigo-400" />
              <span>Save Current Search</span>
            </h3>

            <form onSubmit={handleSaveSearch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Search Name
                </label>
                <input
                  type="text"
                  required
                  value={newSearchName}
                  onChange={(e) => setNewSearchName(e.target.value)}
                  placeholder="e.g. Failed Payment Executions"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1">
                <div>
                  Query:{" "}
                  <span className="text-slate-900 dark:text-white font-mono">
                    {query || "(None)"}
                  </span>
                </div>
                <div>
                  Type:{" "}
                  <span className="text-slate-900 dark:text-white font-mono">
                    {selectedType}
                  </span>
                </div>
                <div>
                  Status:{" "}
                  <span className="text-slate-900 dark:text-white font-mono">
                    {statusFilter || "(Any)"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shareSearch"
                  checked={saveShared}
                  onChange={(e) => setSaveShared(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-300 dark:border-slate-700 text-indigo-500 focus:ring-indigo-500"
                />
                <label
                  htmlFor="shareSearch"
                  className="text-xs text-slate-700 dark:text-slate-300"
                >
                  Share with other organization members
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 text-xs font-bold rounded shadow transition"
                >
                  Save Search
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
