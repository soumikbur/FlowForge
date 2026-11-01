import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { IdempotencyRecord } from "@flowforge/shared";
import { apiStore } from "../store.js";
import { apiReliabilityService } from "../services/api-reliability.service.js";

/**
 * Enterprise Idempotency Middleware.
 * Captures non-idempotent operations, caches successful responses,
 * detects in-flight concurrent execution, and handles mismatched payloads.
 */
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Only apply to mutating HTTP methods
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  const idempotencyKey =
    (req.headers["idempotency-key"] as string) ||
    (req.headers["x-idempotency-key"] as string) ||
    undefined;

  if (!idempotencyKey) {
    return next();
  }

  const requestId =
    (req as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    `req_${crypto.randomUUID()}`;

  // Validate key format
  if (idempotencyKey.length < 1 || idempotencyKey.length > 256) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency key must be between 1 and 256 characters.",
        details: { keyLength: idempotencyKey.length },
        requestId,
        retryable: false,
        docUrl: "https://docs.flowforge.dev/errors#INVALID_IDEMPOTENCY_KEY",
      },
    });
    return;
  }

  let orgId =
    req.organizationId ||
    (req.headers["x-organization-id"] as string) ||
    undefined;

  if (!orgId && req.headers.authorization) {
    const token = req.headers.authorization.replace(/^Bearer /i, "").trim();
    const session = apiStore.sessions.get(token);
    if (session) {
      const membership = Array.from(apiStore.memberships.values()).find(
        (m) => m.userId === session.userId,
      );
      if (membership) {
        orgId = membership.organizationId;
      }
    }
  }

  if (!orgId) {
    orgId = "org_default";
  }

  const principalId = req.user?.id || req.apiKey?.id || "anonymous";

  // Compute normalized request payload hash
  const requestBodyStr = req.body ? JSON.stringify(req.body) : "";
  const requestHash = crypto
    .createHash("sha256")
    .update(`${req.method}:${req.path}:${requestBodyStr}`)
    .digest("hex");

  const storageKey = `${orgId}:${idempotencyKey}`;
  const existingRecord = apiStore.idempotencyRecords.get(storageKey);

  const now = new Date();

  if (existingRecord) {
    // Check if not expired
    if (new Date(existingRecord.expiresAt) > now) {
      // 1. Conflict check: Has the request payload materially changed?
      if (existingRecord.requestHash !== requestHash) {
        apiReliabilityService.recordIdempotencyHit("mismatch");
        res.status(409).json({
          success: false,
          data: null,
          error: {
            code: "IDEMPOTENCY_MISMATCH",
            message:
              "Idempotency key was previously used with different request parameters or endpoint.",
            details: {
              originalMethod: existingRecord.requestMethod,
              originalPath: existingRecord.requestPath,
            },
            requestId,
            retryable: false,
            docUrl: "https://docs.flowforge.dev/errors#IDEMPOTENCY_MISMATCH",
          },
        });
        return;
      }

      // 2. In-flight check: concurrent processing lock
      if (
        existingRecord.responseStatus === undefined ||
        existingRecord.responseStatus === null
      ) {
        apiReliabilityService.recordIdempotencyHit("in_flight");
        res.status(409).json({
          success: false,
          data: null,
          error: {
            code: "IDEMPOTENCY_IN_FLIGHT",
            message:
              "A request with this idempotency key is currently being processed. Please retry shortly.",
            details: {
              idempotencyKey,
              inFlightSince: existingRecord.createdAt,
            },
            requestId,
            retryable: true,
            docUrl: "https://docs.flowforge.dev/errors#IDEMPOTENCY_IN_FLIGHT",
          },
        });
        return;
      }

      // 3. Replay cached response
      apiReliabilityService.recordIdempotencyHit("cache_hit");
      res.setHeader("Idempotent-Replayed", "true");
      res.setHeader("X-Idempotency-Key", idempotencyKey);
      if (existingRecord.responseHeaders) {
        for (const [hKey, hVal] of Object.entries(
          existingRecord.responseHeaders,
        )) {
          if (
            hVal &&
            typeof hVal === "string" &&
            !res.hasHeader(hKey) &&
            hKey.toLowerCase() !== "content-length"
          ) {
            res.setHeader(hKey, hVal);
          }
        }
      }

      const replayStatus =
        existingRecord.responseStatus === 201 ||
        existingRecord.responseStatus === 202
          ? 200
          : existingRecord.responseStatus;
      const replayBody =
        typeof existingRecord.responseBody === "object" &&
        existingRecord.responseBody !== null
          ? {
              ...existingRecord.responseBody,
              meta: {
                ...((existingRecord.responseBody as any).meta || {}),
                idempotent: true,
              },
            }
          : existingRecord.responseBody;

      res.status(replayStatus).json(replayBody);
      return;
    }
  }

  // Create in-flight record with 24 hours TTL
  const recordId = `idem_${crypto.randomUUID()}`;
  const newRecord: IdempotencyRecord = {
    id: recordId,
    organizationId: orgId,
    principalId,
    idempotencyKey,
    requestMethod: req.method,
    requestPath: req.path,
    requestHash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h retention
    createdAt: now,
  };

  apiStore.idempotencyRecords.set(storageKey, newRecord);
  apiReliabilityService.recordIdempotencyHit("recorded");

  // Hook response to capture status and JSON payload
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    newRecord.responseStatus = res.statusCode;
    newRecord.responseBody = body;
    const ct = res.getHeader("content-type");
    if (ct && typeof ct === "string") {
      newRecord.responseHeaders = { "content-type": ct };
    }
    apiStore.idempotencyRecords.set(storageKey, newRecord);
    res.setHeader("X-Idempotency-Key", idempotencyKey);
    return originalJson(body);
  };

  next();
}
