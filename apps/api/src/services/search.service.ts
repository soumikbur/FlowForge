import crypto from "crypto";
import {
  InMemoryDatabase,
  SearchQuery,
  SearchResultItem,
  SearchableResourceType,
  UnifiedSearchResponse,
  SavedSearchRecord,
  CreateSavedSearchRequest,
  SearchMetricsSummary,
} from "@flowforge/test-utils";
import { hasPermission, Role } from "@flowforge/shared";
import { apiStore } from "../store.js";

function safeSnippet(text: string, query?: string, maxLength = 160): string {
  if (!text) return "";
  // Strip potential credential patterns
  const sanitized = text
    .replace(
      /(?:bearer|basic|key|secret|password|token)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]",
    )
    .trim();

  if (!query || query.length < 2) {
    return sanitized.length > maxLength
      ? sanitized.slice(0, maxLength) + "..."
      : sanitized;
  }

  const idx = sanitized.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return sanitized.length > maxLength
      ? sanitized.slice(0, maxLength) + "..."
      : sanitized;
  }

  const start = Math.max(0, idx - 40);
  const end = Math.min(sanitized.length, idx + query.length + 80);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < sanitized.length ? "..." : "";
  return prefix + sanitized.slice(start, end).trim() + suffix;
}

function computeScore(
  id: string,
  title: string,
  description?: string,
  tags: string[] = [],
  query?: string,
): { score: number; matchedFields: string[] } {
  if (!query || query.trim() === "") {
    return { score: 10, matchedFields: [] };
  }

  const q = query.toLowerCase().trim();
  const idLower = id.toLowerCase();
  const titleLower = title.toLowerCase();
  const descLower = (description || "").toLowerCase();

  let score = 0;
  const matchedFields: string[] = [];

  if (idLower === q) {
    score += 100;
    matchedFields.push("id");
  } else if (idLower.includes(q)) {
    score += 40;
    matchedFields.push("id");
  }

  if (titleLower === q) {
    score += 90;
    matchedFields.push("title");
  } else if (titleLower.startsWith(q)) {
    score += 50;
    matchedFields.push("title");
  } else if (titleLower.includes(q)) {
    score += 30;
    matchedFields.push("title");
  }

  if (descLower.includes(q)) {
    score += 15;
    matchedFields.push("description");
  }

  if (tags.some((t) => t.toLowerCase().includes(q))) {
    score += 15;
    matchedFields.push("tags");
  }

  return { score, matchedFields };
}

function matchesDateRange(
  date?: Date | string | null,
  startDate?: string,
  endDate?: string,
): boolean {
  if (!date) return true;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return true;

  if (startDate) {
    const s = new Date(startDate);
    if (!isNaN(s.getTime()) && d.getTime() < s.getTime()) return false;
  }
  if (endDate) {
    const e = new Date(endDate);
    if (!isNaN(e.getTime()) && d.getTime() > e.getTime()) return false;
  }
  return true;
}

export class SearchService {
  private totalSearches = 0;
  private searchDurations: number[] = [];
  private slowQueriesCount = 0;
  private searchesByType: Record<string, number> = {};

  constructor(private db: InMemoryDatabase = apiStore) {}

  public async search(
    params: SearchQuery & {
      organizationId: string;
      callerRole: Role;
      callerUserId?: string;
    },
  ): Promise<UnifiedSearchResponse> {
    const startTime = Date.now();
    const {
      organizationId,
      callerRole,
      query = "",
      types,
      workspaceId,
      status,
      category,
      ownerId,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      sortBy = "relevance",
      sortOrder = "desc",
    } = params;

    const q = query.trim();
    const allResults: SearchResultItem[] = [];

    // Determine target resource types to search
    const enabledTypes = new Set<SearchableResourceType>(
      types && types.length > 0
        ? types
        : [
            "workflow",
            "workflow_version",
            "execution",
            "event",
            "connector",
            "extension",
            "template",
            "approval",
            "audit_log",
          ],
    );

    // 1. Workflows
    if (
      enabledTypes.has("workflow") &&
      hasPermission(callerRole, "workflow:read")
    ) {
      for (const w of this.db.workflows.values()) {
        if (w.organizationId !== organizationId) continue;
        if ((w as any).deletedAt) continue;
        if (
          workspaceId &&
          (w as any).workspaceId &&
          (w as any).workspaceId !== workspaceId
        ) {
          continue;
        }
        if (status && w.status !== status) continue;
        if (ownerId && w.createdById && w.createdById !== ownerId) continue;
        if (!matchesDateRange(w.createdAt, startDate, endDate)) continue;

        const tags = (w as any).tags || [];
        const { score, matchedFields } = computeScore(
          w.id,
          w.name,
          w.description,
          tags,
          q,
        );

        if (q && score === 0) {
          // Check node names / types in definition
          const hasNodeMatch = w.draftDefinition?.nodes?.some(
            (n) =>
              n.name.toLowerCase().includes(q.toLowerCase()) ||
              n.type.toLowerCase().includes(q.toLowerCase()),
          );
          if (!hasNodeMatch) continue;
          matchedFields.push("definition.nodes");
        }

        allResults.push({
          id: w.id,
          resourceType: "workflow",
          title: w.name,
          summary: w.description || `Workflow in ${w.status} state.`,
          status: w.status,
          organizationId: w.organizationId,
          workspaceId: (w as any).workspaceId,
          createdAt: w.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: w.updatedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/workflows/${w.id}`,
          matchedFields,
          snippet: safeSnippet(w.description || w.name, q),
          score,
          metadata: {
            publishedVersionId: w.publishedVersionId,
            tags,
          },
        });
      }
    }

    // 2. Workflow Versions
    if (
      enabledTypes.has("workflow_version") &&
      hasPermission(callerRole, "workflow:read")
    ) {
      for (const v of this.db.versions.values()) {
        const wf = this.db.workflows.get(v.workflowId);
        if (!wf || wf.organizationId !== organizationId) continue;
        if ((wf as any).deletedAt) continue;
        const versionStatus =
          wf.publishedVersionId === v.id ? "PUBLISHED" : "SNAPSHOT";
        if (status && versionStatus !== status) continue;
        const versionDate = v.publishedAt || (v as any).createdAt;
        if (!matchesDateRange(versionDate, startDate, endDate)) continue;

        const title = `${wf.name} (v${v.versionNumber})`;
        const desc = `Version ${v.versionNumber} snapshot of workflow ${wf.name}`;
        const { score, matchedFields } = computeScore(v.id, title, desc, [], q);

        if (q && score === 0) continue;

        allResults.push({
          id: v.id,
          resourceType: "workflow_version",
          title,
          summary: desc,
          status: wf.publishedVersionId === v.id ? "PUBLISHED" : "SNAPSHOT",
          organizationId: wf.organizationId,
          workspaceId: (wf as any).workspaceId,
          createdAt: versionDate?.toISOString() || new Date().toISOString(),
          navigationUrl: `/workflows/${v.workflowId}`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            workflowId: v.workflowId,
            versionNumber: v.versionNumber,
          },
        });
      }
    }

    // 3. Executions
    if (
      enabledTypes.has("execution") &&
      hasPermission(callerRole, "workflow:read")
    ) {
      for (const e of this.db.executions.values()) {
        if (e.organizationId !== organizationId) continue;
        if (status && e.status !== status) continue;
        if (!matchesDateRange(e.createdAt || e.startedAt, startDate, endDate))
          continue;

        const wf = this.db.workflows.get(e.workflowId);
        const wfName = wf?.name || "Workflow";
        const title = `${wfName} Execution #${e.id.slice(0, 8)}`;
        const errMessage = (e.errorDetails as any)?.message;
        const desc = errMessage
          ? `Status: ${e.status}. Error: ${errMessage}`
          : `Execution triggered via ${e.triggerType} (${e.status})`;

        const { score, matchedFields } = computeScore(
          e.id,
          title,
          desc,
          [e.triggerType, e.status],
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: e.id,
          resourceType: "execution",
          title,
          summary: desc,
          status: e.status,
          organizationId: e.organizationId,
          createdAt: e.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: e.updatedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/executions/${e.id}`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            workflowId: e.workflowId,
            triggerType: e.triggerType,
            retryCount: e.retryCount || 0,
          },
        });
      }
    }

    // 4. Events
    if (enabledTypes.has("event") && hasPermission(callerRole, "events:read")) {
      for (const ev of this.db.streamEvents.values()) {
        if (ev.organizationId !== organizationId) continue;
        if (status && ev.status !== status) continue;
        if (!matchesDateRange(ev.ingestedAt, startDate, endDate)) continue;

        const title = `Event: ${ev.type}`;
        const desc = `Source: ${ev.source}. Status: ${ev.status}. CorrelationId: ${ev.correlationId || "N/A"}`;
        const { score, matchedFields } = computeScore(
          ev.id,
          title,
          desc,
          [ev.source, ev.type],
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: ev.id,
          resourceType: "event",
          title,
          summary: desc,
          status: ev.status,
          organizationId: ev.organizationId,
          createdAt: ev.ingestedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/events`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            eventType: ev.type,
            source: ev.source,
          },
        });
      }
    }

    // 5. Connectors / Integrations
    if (
      enabledTypes.has("connector") &&
      hasPermission(callerRole, "connections:read")
    ) {
      for (const c of this.db.connections.values()) {
        if (c.organizationId !== organizationId) continue;
        if (status && c.status !== status) continue;
        if (!matchesDateRange(c.createdAt, startDate, endDate)) continue;

        const connectorType = c.connectorId || c.authType || "CUSTOM";
        const title = `${c.name} (${connectorType})`;
        const desc = `Integration connector (${connectorType}). Status: ${c.status}.`;
        const { score, matchedFields } = computeScore(
          c.id,
          title,
          desc,
          [connectorType, c.status],
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: c.id,
          resourceType: "connector",
          title: c.name,
          summary: desc,
          status: c.status,
          organizationId: c.organizationId,
          createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: c.updatedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/settings`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            connectorId: c.connectorId,
            authType: c.authType,
          },
        });
      }
    }

    // 6. Extensions
    if (
      enabledTypes.has("extension") &&
      hasPermission(callerRole, "extensions:read")
    ) {
      for (const ext of this.db.extensionPackages.values()) {
        const isOrgOwned = ext.organizationId === organizationId;
        const isPublic = ext.isPublic || ext.status === "PUBLISHED";
        if (!isOrgOwned && !isPublic) continue;
        if (status && ext.status !== status) continue;
        if (category && (ext as any).category !== category) continue;
        if (!matchesDateRange(ext.createdAt, startDate, endDate)) continue;

        const tags = (ext as any).tags || [];
        const { score, matchedFields } = computeScore(
          ext.id,
          ext.name,
          ext.description,
          tags,
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: ext.id,
          resourceType: "extension",
          title: ext.name,
          summary: ext.description || "Extension package",
          status: ext.status,
          organizationId: ext.organizationId || organizationId,
          createdAt: ext.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: ext.updatedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/settings`,
          matchedFields,
          snippet: safeSnippet(ext.description || ext.name, q),
          score,
          metadata: {
            category: (ext as any).category,
            publisherName: ext.publisherName,
          },
        });
      }
    }

    // 7. Templates
    if (
      enabledTypes.has("template") &&
      hasPermission(callerRole, "templates:read")
    ) {
      for (const t of this.db.templates.values()) {
        const isOrgOwned = t.organizationId === organizationId;
        const isOfficial =
          t.visibility === "PLATFORM" || (t as any).isOfficial === true;
        if (!isOrgOwned && !isOfficial) continue;
        if (status && t.status !== status) continue;
        if (category && t.category !== category) continue;
        if (!matchesDateRange(t.createdAt, startDate, endDate)) continue;

        const desc = t.shortDescription || t.description || "Workflow template";
        const tags = t.tags || [];
        const { score, matchedFields } = computeScore(
          t.id,
          t.name,
          desc,
          tags,
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: t.id,
          resourceType: "template",
          title: t.name,
          summary: desc,
          organizationId: t.organizationId || organizationId,
          createdAt: t.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: t.updatedAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/templates`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            category: t.category,
            visibility: t.visibility,
            tags,
          },
        });
      }
    }

    // 8. Approvals
    if (
      enabledTypes.has("approval") &&
      hasPermission(callerRole, "approval:read")
    ) {
      for (const a of this.db.approvals.values()) {
        if (a.organizationId !== organizationId) continue;
        if (status && a.status !== status) continue;
        if (!matchesDateRange(a.createdAt, startDate, endDate)) continue;

        const title = a.title || "Approval Request";
        const desc =
          a.description ||
          `Required role: ${a.requiredRole}. Status: ${a.status}`;
        const { score, matchedFields } = computeScore(
          a.id,
          title,
          desc,
          [a.requiredRole, a.status],
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: a.id,
          resourceType: "approval",
          title,
          summary: desc,
          status: a.status,
          organizationId: a.organizationId,
          createdAt: a.createdAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/approvals`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            executionId: a.executionId,
            stepId: a.stepId,
            requiredRole: a.requiredRole,
          },
        });
      }
    }

    // 9. Audit Logs (Requires audit:read or compliance:read)
    if (
      enabledTypes.has("audit_log") &&
      (hasPermission(callerRole, "audit:read") ||
        hasPermission(callerRole, "compliance:read"))
    ) {
      for (const log of this.db.auditLogs) {
        if (log.organizationId !== organizationId) continue;
        const logStatus = log.outcome || "SUCCESS";
        if (status && logStatus !== status) continue;
        if (!matchesDateRange(log.createdAt, startDate, endDate)) continue;

        const title = `Audit: ${log.action}`;
        const desc = `Resource: ${log.resourceType} (${log.resourceId}). Outcome: ${log.outcome || "SUCCESS"}. Actor: ${log.userId || "System"}`;
        const { score, matchedFields } = computeScore(
          log.id,
          title,
          desc,
          [log.action, log.resourceType],
          q,
        );

        if (q && score === 0) continue;

        allResults.push({
          id: log.id,
          resourceType: "audit_log",
          title,
          summary: desc,
          status: log.outcome || "SUCCESS",
          organizationId: log.organizationId,
          createdAt: log.createdAt?.toISOString() || new Date().toISOString(),
          navigationUrl: `/settings`,
          matchedFields,
          snippet: safeSnippet(desc, q),
          score,
          metadata: {
            action: log.action,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
          },
        });
      }
    }

    // Compute Facets
    const facets = {
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };
    for (const r of allResults) {
      facets.byType[r.resourceType] = (facets.byType[r.resourceType] || 0) + 1;
      if (r.status) {
        facets.byStatus[r.status] = (facets.byStatus[r.status] || 0) + 1;
      }
    }

    // Sort Results
    allResults.sort((a, b) => {
      if (sortBy === "relevance") {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (sortBy === "updatedAt") {
        const aDate = new Date(a.updatedAt || a.createdAt).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      }
      // createdAt
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    });

    const total = allResults.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = allResults.slice(startIndex, startIndex + pageSize);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const executionTimeMs = Date.now() - startTime;

    // Track Metrics
    this.totalSearches += 1;
    this.searchDurations.push(executionTimeMs);
    if (executionTimeMs > 100) {
      this.slowQueriesCount += 1;
    }
    for (const t of Object.keys(facets.byType)) {
      this.searchesByType[t] = (this.searchesByType[t] || 0) + 1;
    }

    return {
      query: q,
      total,
      page,
      pageSize,
      totalPages,
      results: paginated,
      facets,
      executionTimeMs,
    };
  }

  // ==========================================
  // Saved Searches
  // ==========================================

  public createSavedSearch(
    params: CreateSavedSearchRequest & {
      organizationId: string;
      userId: string;
    },
  ): SavedSearchRecord {
    const id = `srch_${crypto.randomUUID()}`;
    const now = new Date();
    const record: SavedSearchRecord = {
      id,
      organizationId: params.organizationId,
      userId: params.userId,
      name: params.name,
      description: params.description || null,
      query: params.query || "",
      types: params.types || [],
      filters: params.filters || {},
      isShared: params.isShared ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.db.savedSearches.set(id, record);
    return record;
  }

  public listSavedSearches(
    organizationId: string,
    userId: string,
  ): SavedSearchRecord[] {
    const list: SavedSearchRecord[] = [];
    for (const s of this.db.savedSearches.values()) {
      if (s.organizationId !== organizationId) continue;
      // User can see their own saved searches, or shared searches in the organization
      if (s.userId === userId || s.isShared) {
        list.push(s);
      }
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list;
  }

  public deleteSavedSearch(
    id: string,
    organizationId: string,
    userId: string,
    callerRole: Role,
  ): boolean {
    const record = this.db.savedSearches.get(id);
    if (!record || record.organizationId !== organizationId) {
      return false;
    }
    // Owner of the saved search can delete it; Admins/Owners can delete shared searches
    const canDelete =
      record.userId === userId ||
      (record.isShared && (callerRole === "ADMIN" || callerRole === "OWNER"));

    if (!canDelete) {
      return false;
    }

    this.db.savedSearches.delete(id);
    return true;
  }

  // ==========================================
  // Observability & Metrics
  // ==========================================

  public getMetrics(): SearchMetricsSummary {
    const avgDuration =
      this.searchDurations.length > 0
        ? Math.round(
            this.searchDurations.reduce((a, b) => a + b, 0) /
              this.searchDurations.length,
          )
        : 0;

    return {
      totalSearches: this.totalSearches,
      avgDurationMs: avgDuration,
      slowQueriesCount: this.slowQueriesCount,
      searchesByType: { ...this.searchesByType },
    };
  }
}

export const searchService = new SearchService(apiStore);
