import { apiStore } from "../store.js";

export interface ReliabilityMetrics {
  timestamp: string;
  uptimeSeconds: number;
  requests: {
    total: number;
    byCategory: {
      auth: number;
      execute: number;
      search: number;
      default: number;
    };
  };
  errors: {
    total4xx: number;
    total5xx: number;
    rateLimited: number;
  };
  idempotency: {
    cacheHits: number;
    inFlightConflicts: number;
    mismatches: number;
    recorded: number;
  };
  inboundWebhooks: {
    received: number;
    verified: number;
    invalidSignatures: number;
    expiredTimestamps: number;
    replaysDetected: number;
    disabledOrNotFound: number;
  };
  outboundWebhooks: {
    attempts: number;
    delivered: number;
    retriesScheduled: number;
    permanentFailures: number;
    deadLettered: number;
    replayed: number;
    activeDeadLetterCount: number;
  };
}

export class ApiReliabilityService {
  private startTime = Date.now();

  private requestCounts = {
    total: 0,
    auth: 0,
    execute: 0,
    search: 0,
    default: 0,
  };

  private errorCounts = {
    total4xx: 0,
    total5xx: 0,
    rateLimited: 0,
  };

  private idempotencyCounts = {
    cacheHits: 0,
    inFlightConflicts: 0,
    mismatches: 0,
    recorded: 0,
  };

  private inboundWebhookCounts = {
    received: 0,
    verified: 0,
    invalidSignatures: 0,
    expiredTimestamps: 0,
    replaysDetected: 0,
    disabledOrNotFound: 0,
  };

  private outboundWebhookCounts = {
    attempts: 0,
    delivered: 0,
    retriesScheduled: 0,
    permanentFailures: 0,
    deadLettered: 0,
    replayed: 0,
  };

  public recordRequest(
    category: "auth" | "execute" | "search" | "default" = "default",
  ): void {
    this.requestCounts.total++;
    this.requestCounts[category]++;
  }

  public recordError(statusCode: number): void {
    if (statusCode >= 400 && statusCode < 500) {
      this.errorCounts.total4xx++;
    } else if (statusCode >= 500) {
      this.errorCounts.total5xx++;
    }
  }

  public recordRateLimitHit(): void {
    this.errorCounts.rateLimited++;
    this.errorCounts.total4xx++;
  }

  public recordIdempotencyHit(
    type: "cache_hit" | "in_flight" | "mismatch" | "recorded",
  ): void {
    if (type === "cache_hit") this.idempotencyCounts.cacheHits++;
    else if (type === "in_flight") this.idempotencyCounts.inFlightConflicts++;
    else if (type === "mismatch") this.idempotencyCounts.mismatches++;
    else if (type === "recorded") this.idempotencyCounts.recorded++;
  }

  public recordInboundWebhook(
    status:
      | "received"
      | "verified"
      | "invalid_signature"
      | "expired_timestamp"
      | "replay_detected"
      | "disabled_or_not_found",
  ): void {
    if (status === "received") this.inboundWebhookCounts.received++;
    else if (status === "verified") this.inboundWebhookCounts.verified++;
    else if (status === "invalid_signature")
      this.inboundWebhookCounts.invalidSignatures++;
    else if (status === "expired_timestamp")
      this.inboundWebhookCounts.expiredTimestamps++;
    else if (status === "replay_detected")
      this.inboundWebhookCounts.replaysDetected++;
    else if (status === "disabled_or_not_found")
      this.inboundWebhookCounts.disabledOrNotFound++;
  }

  public recordOutboundWebhook(
    status:
      | "attempt"
      | "delivered"
      | "retry_scheduled"
      | "permanent_failure"
      | "dead_lettered"
      | "replayed",
  ): void {
    if (status === "attempt") this.outboundWebhookCounts.attempts++;
    else if (status === "delivered") this.outboundWebhookCounts.delivered++;
    else if (status === "retry_scheduled")
      this.outboundWebhookCounts.retriesScheduled++;
    else if (status === "permanent_failure")
      this.outboundWebhookCounts.permanentFailures++;
    else if (status === "dead_lettered")
      this.outboundWebhookCounts.deadLettered++;
    else if (status === "replayed") this.outboundWebhookCounts.replayed++;
  }

  public getActiveDeadLetterCount(): number {
    return Array.from(apiStore.webhookDeliveries.values()).filter(
      (d) => d.status === "DEAD_LETTERED",
    ).length;
  }

  public getMetrics(): ReliabilityMetrics {
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      requests: {
        total: this.requestCounts.total,
        byCategory: {
          auth: this.requestCounts.auth,
          execute: this.requestCounts.execute,
          search: this.requestCounts.search,
          default: this.requestCounts.default,
        },
      },
      errors: {
        total4xx: this.errorCounts.total4xx,
        total5xx: this.errorCounts.total5xx,
        rateLimited: this.errorCounts.rateLimited,
      },
      idempotency: {
        cacheHits: this.idempotencyCounts.cacheHits,
        inFlightConflicts: this.idempotencyCounts.inFlightConflicts,
        mismatches: this.idempotencyCounts.mismatches,
        recorded: this.idempotencyCounts.recorded,
      },
      inboundWebhooks: {
        received: this.inboundWebhookCounts.received,
        verified: this.inboundWebhookCounts.verified,
        invalidSignatures: this.inboundWebhookCounts.invalidSignatures,
        expiredTimestamps: this.inboundWebhookCounts.expiredTimestamps,
        replaysDetected: this.inboundWebhookCounts.replaysDetected,
        disabledOrNotFound: this.inboundWebhookCounts.disabledOrNotFound,
      },
      outboundWebhooks: {
        attempts: this.outboundWebhookCounts.attempts,
        delivered: this.outboundWebhookCounts.delivered,
        retriesScheduled: this.outboundWebhookCounts.retriesScheduled,
        permanentFailures: this.outboundWebhookCounts.permanentFailures,
        deadLettered: this.outboundWebhookCounts.deadLettered,
        replayed: this.outboundWebhookCounts.replayed,
        activeDeadLetterCount: this.getActiveDeadLetterCount(),
      },
    };
  }

  public reset(): void {
    this.startTime = Date.now();
    this.requestCounts = {
      total: 0,
      auth: 0,
      execute: 0,
      search: 0,
      default: 0,
    };
    this.errorCounts = { total4xx: 0, total5xx: 0, rateLimited: 0 };
    this.idempotencyCounts = {
      cacheHits: 0,
      inFlightConflicts: 0,
      mismatches: 0,
      recorded: 0,
    };
    this.inboundWebhookCounts = {
      received: 0,
      verified: 0,
      invalidSignatures: 0,
      expiredTimestamps: 0,
      replaysDetected: 0,
      disabledOrNotFound: 0,
    };
    this.outboundWebhookCounts = {
      attempts: 0,
      delivered: 0,
      retriesScheduled: 0,
      permanentFailures: 0,
      deadLettered: 0,
      replayed: 0,
    };
  }
}

export const apiReliabilityService = new ApiReliabilityService();
