import { FailureCategory } from "@flowforge/shared";

export interface DurationStats {
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

export interface ExecutionMetricsSummary {
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  running: number;
  waitingApproval: number;
  waitingDelay: number;
  successRate: number;
  failureRate: number;
  retryCount: number;
  retryRate: number;
  timeoutCount: number;
  durations: DurationStats;
  byWorkflow: Record<string, { total: number; successful: number; failed: number }>;
  byTriggerType: Record<string, number>;
  byStatus: Record<string, number>;
  byEnvironment: Record<string, number>;
}

export interface NodePerformanceSummary {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executionCount: number;
  failureCount: number;
  failureRate: number;
  retryCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  percentageOfTotalDuration: number;
  isBottleneck: boolean;
}

export interface TimeSeriesBucket {
  timestamp: string; // ISO string
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  avgDurationMs: number;
}

const SENSITIVE_REGEXES = [
  /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
  /(password|secret|token|api_?key)\s*[:=\s]\s*["']?[^"'\s,;]+["']?/gi,
  /eyJ[A-Za-z0-9_\-\.]+/gi,
  /[a-f0-9]{32,64}/gi, // raw hashes/tokens
];

/**
 * Redacts sensitive credentials, tokens, and passwords from error messages.
 */
export function sanitizeErrorMessage(message?: string): string {
  if (!message) return "Unknown error";
  let sanitized = message;
  for (const regex of SENSITIVE_REGEXES) {
    sanitized = sanitized.replace(regex, "[REDACTED]");
  }
  return sanitized;
}

/**
 * Calculates a specific percentile from an array of numbers using linear interpolation.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const p = Math.max(0, Math.min(100, percentile));
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sorted[lower];
  return Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 100) / 100;
}

/**
 * Classifies an error into a structured FailureCategory based on error details, message, and node type.
 */
export function classifyFailure(
  errorDetails: any,
  errorMessage?: string,
  nodeType?: string,
): FailureCategory {
  const combined = (
    `${errorMessage || ""} ${JSON.stringify(errorDetails || "")} ${nodeType || ""}`
  ).toLowerCase();

  if (
    combined.includes("cancel") ||
    combined.includes("abort") ||
    errorDetails?.cancellationReason
  ) {
    return "CANCELLATION";
  }

  if (
    combined.includes("validation") ||
    combined.includes("invalid workflow") ||
    combined.includes("invalid plan") ||
    combined.includes("graph error") ||
    combined.includes("cycle detected") ||
    combined.includes("missing terminal")
  ) {
    return "VALIDATION_ERROR";
  }

  if (
    combined.includes("unauthorized") ||
    combined.includes("forbidden") ||
    combined.includes("401") ||
    combined.includes("403") ||
    combined.includes("signature") ||
    combined.includes("decrypt") ||
    combined.includes("credential")
  ) {
    return "AUTH_ERROR";
  }

  if (
    combined.includes("timed out") ||
    combined.includes("timeout") ||
    combined.includes("etimedout") ||
    combined.includes("deadline") ||
    errorDetails?.timeoutPolicy
  ) {
    return "HTTP_TIMEOUT";
  }

  if (
    combined.includes("429") ||
    combined.includes("rate limit") ||
    combined.includes("too many requests")
  ) {
    return "RATE_LIMITED";
  }

  if (
    combined.includes("ssrf") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("dns") ||
    combined.includes("private network") ||
    combined.includes("fetch failed")
  ) {
    return "INTEGRATION_ERROR";
  }

  if (
    combined.includes("500") ||
    combined.includes("502") ||
    combined.includes("503") ||
    combined.includes("504") ||
    combined.includes("server error") ||
    combined.includes("external service")
  ) {
    return "SERVICE_ERROR";
  }

  if (
    combined.includes("config") ||
    combined.includes("missing required") ||
    combined.includes("schema violation")
  ) {
    return "NODE_CONFIG_ERROR";
  }

  if (
    combined.includes("queue") ||
    combined.includes("step limit") ||
    combined.includes("backlog") ||
    combined.includes("out of memory")
  ) {
    return "QUEUE_ERROR";
  }

  if (
    combined.includes("referenceerror") ||
    combined.includes("typeerror") ||
    combined.includes("syntaxerror") ||
    combined.includes("runtime") ||
    combined.includes("eval")
  ) {
    return "RUNTIME_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * Calculates comprehensive execution metrics from an authoritative list of execution records.
 */
export function calculateExecutionStats(
  executions: any[],
  options?: { from?: Date; to?: Date },
): ExecutionMetricsSummary {
  let filtered = executions;
  if (options?.from) {
    filtered = filtered.filter((e) => new Date(e.createdAt) >= options.from!);
  }
  if (options?.to) {
    filtered = filtered.filter((e) => new Date(e.createdAt) < options.to!);
  }

  let total = filtered.length;
  let successful = 0;
  let failed = 0;
  let cancelled = 0;
  let running = 0;
  let waitingApproval = 0;
  let waitingDelay = 0;
  let timeoutCount = 0;
  let totalRetries = 0;

  const durations: number[] = [];
  const byWorkflow: Record<string, { total: number; successful: number; failed: number }> = {};
  const byTriggerType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byEnvironment: Record<string, number> = {};

  for (const exec of filtered) {
    // Status counts
    const st = exec.status as string;
    byStatus[st] = (byStatus[st] || 0) + 1;

    // Trigger counts
    const tr = exec.triggerType || "MANUAL";
    byTriggerType[tr] = (byTriggerType[tr] || 0) + 1;

    // Environment counts
    const env = exec.environment || "development";
    byEnvironment[env] = (byEnvironment[env] || 0) + 1;

    // Workflow counts
    const wfId = exec.workflowId;
    if (wfId) {
      if (!byWorkflow[wfId]) {
        byWorkflow[wfId] = { total: 0, successful: 0, failed: 0 };
      }
      byWorkflow[wfId].total++;
    }

    if (st === "SUCCEEDED") {
      successful++;
      if (wfId) byWorkflow[wfId].successful++;
    } else if (st === "FAILED") {
      failed++;
      if (wfId) byWorkflow[wfId].failed++;
    } else if (st === "CANCELLED") {
      cancelled++;
    } else if (st === "RUNNING") {
      running++;
    } else if (st === "WAITING_APPROVAL") {
      waitingApproval++;
    } else if (st === "WAITING_DELAY") {
      waitingDelay++;
    }

    // Check timeouts
    const errStr = JSON.stringify(exec.errorDetails || "");
    if (errStr.toLowerCase().includes("timeout")) {
      timeoutCount++;
    }

    // Retries
    if (exec.retryCount && exec.retryCount > 0) {
      totalRetries += exec.retryCount;
    }

    // Duration calculation for completed terminal executions
    if ((st === "SUCCEEDED" || st === "FAILED" || st === "CANCELLED") && exec.completedAt) {
      const start = new Date(exec.startedAt || exec.createdAt).getTime();
      const end = new Date(exec.completedAt).getTime();
      const durationMs = Math.max(0, end - start);
      durations.push(durationMs);
    }
  }

  // Eligible terminal executions for rate denominators (only SUCCEEDED + FAILED)
  const eligibleTerminal = successful + failed;
  const successRate =
    eligibleTerminal > 0 ? Math.round((successful / eligibleTerminal) * 1000) / 10 : 100;
  const failureRate =
    eligibleTerminal > 0 ? Math.round((failed / eligibleTerminal) * 1000) / 10 : 0;
  const retryRate =
    total > 0 ? Math.round((totalRetries / total) * 1000) / 10 : 0;

  // Duration stats
  let avgDuration = 0;
  let medianDuration = 0;
  let p95Duration = 0;
  let p99Duration = 0;
  let minDuration = 0;
  let maxDuration = 0;

  if (durations.length > 0) {
    const sum = durations.reduce((acc, d) => acc + d, 0);
    avgDuration = Math.round(sum / durations.length);
    medianDuration = calculatePercentile(durations, 50);
    p95Duration = calculatePercentile(durations, 95);
    p99Duration = calculatePercentile(durations, 99);
    minDuration = Math.min(...durations);
    maxDuration = Math.max(...durations);
  }

  return {
    total,
    successful,
    failed,
    cancelled,
    running,
    waitingApproval,
    waitingDelay,
    successRate,
    failureRate,
    retryCount: totalRetries,
    retryRate,
    timeoutCount,
    durations: {
      averageMs: avgDuration,
      medianMs: medianDuration,
      p95Ms: p95Duration,
      p99Ms: p99Duration,
      minMs: minDuration,
      maxMs: maxDuration,
    },
    byWorkflow,
    byTriggerType,
    byStatus,
    byEnvironment,
  };
}

/**
 * Calculates node-level performance metrics from execution steps.
 */
export function calculateNodePerformance(
  steps: any[],
): NodePerformanceSummary[] {
  const nodeMap = new Map<
    string,
    {
      nodeId: string;
      nodeName: string;
      nodeType: string;
      count: number;
      failureCount: number;
      retryCount: number;
      durations: number[];
    }
  >();

  let cumulativeWorkflowDurationMs = 0;

  for (const step of steps) {
    const key = step.nodeId;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        nodeId: step.nodeId,
        nodeName: step.nodeName || step.nodeId,
        nodeType: step.nodeType || "UNKNOWN",
        count: 0,
        failureCount: 0,
        retryCount: 0,
        durations: [],
      });
    }

    const item = nodeMap.get(key)!;
    item.count++;

    if (step.status === "FAILED") {
      item.failureCount++;
    }

    if (step.attempt && step.attempt > 1) {
      item.retryCount += step.attempt - 1;
    }

    if (step.startedAt && step.completedAt) {
      const dur = Math.max(
        0,
        new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime(),
      );
      item.durations.push(dur);
      cumulativeWorkflowDurationMs += dur;
    }
  }

  const results: NodePerformanceSummary[] = [];

  for (const item of nodeMap.values()) {
    const totalDurationMs = item.durations.reduce((acc, d) => acc + d, 0);
    const avgDurationMs =
      item.durations.length > 0 ? Math.round(totalDurationMs / item.durations.length) : 0;
    const medianDurationMs = calculatePercentile(item.durations, 50);
    const p95DurationMs = calculatePercentile(item.durations, 95);
    const failureRate =
      item.count > 0 ? Math.round((item.failureCount / item.count) * 1000) / 10 : 0;
    const percentageOfTotalDuration =
      cumulativeWorkflowDurationMs > 0
        ? Math.round((totalDurationMs / cumulativeWorkflowDurationMs) * 1000) / 10
        : 0;

    // A node is flagged as a potential bottleneck if it accounts for >= 40% of runtime or failureRate >= 25%
    const isBottleneck = percentageOfTotalDuration >= 40 || failureRate >= 25;

    results.push({
      nodeId: item.nodeId,
      nodeName: item.nodeName,
      nodeType: item.nodeType,
      executionCount: item.count,
      failureCount: item.failureCount,
      failureRate,
      retryCount: item.retryCount,
      totalDurationMs,
      avgDurationMs,
      medianDurationMs,
      p95DurationMs,
      percentageOfTotalDuration,
      isBottleneck,
    });
  }

  // Sort descending by total duration
  return results.sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

/**
 * Groups executions into contiguous time series buckets (hourly or daily).
 */
export function groupExecutionsByTimeBucket(
  executions: any[],
  bucketSize: "hour" | "day",
  from: Date,
  to: Date,
): TimeSeriesBucket[] {
  const bucketDurationMs =
    bucketSize === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  // Initialize buckets from 'from' to 'to'
  const buckets: TimeSeriesBucket[] = [];
  let currentStart = new Date(from.getTime());

  // Round down currentStart to boundary
  if (bucketSize === "hour") {
    currentStart.setMinutes(0, 0, 0);
  } else {
    currentStart.setHours(0, 0, 0, 0);
  }

  const bucketMap = new Map<number, { bucket: TimeSeriesBucket; durations: number[] }>();

  while (currentStart.getTime() < to.getTime()) {
    const bucketKey = currentStart.getTime();
    const bucket: TimeSeriesBucket = {
      timestamp: currentStart.toISOString(),
      total: 0,
      successful: 0,
      failed: 0,
      cancelled: 0,
      avgDurationMs: 0,
    };
    buckets.push(bucket);
    bucketMap.set(bucketKey, { bucket, durations: [] });
    currentStart = new Date(currentStart.getTime() + bucketDurationMs);
  }

  // Populate buckets
  for (const exec of executions) {
    const execTime = new Date(exec.createdAt).getTime();
    if (execTime < from.getTime() || execTime >= to.getTime()) continue;

    // Find bucket key
    const offset = execTime - from.getTime();
    const index = Math.floor(offset / bucketDurationMs);
    const targetBucket = buckets[index];

    if (targetBucket) {
      targetBucket.total++;
      if (exec.status === "SUCCEEDED") targetBucket.successful++;
      else if (exec.status === "FAILED") targetBucket.failed++;
      else if (exec.status === "CANCELLED") targetBucket.cancelled++;

      if (exec.completedAt) {
        const start = new Date(exec.startedAt || exec.createdAt).getTime();
        const end = new Date(exec.completedAt).getTime();
        const entry = bucketMap.get(new Date(targetBucket.timestamp).getTime());
        if (entry) {
          entry.durations.push(Math.max(0, end - start));
        }
      }
    }
  }

  // Compute average durations
  for (const entry of bucketMap.values()) {
    if (entry.durations.length > 0) {
      const sum = entry.durations.reduce((a, b) => a + b, 0);
      entry.bucket.avgDurationMs = Math.round(sum / entry.durations.length);
    }
  }

  return buckets;
}
