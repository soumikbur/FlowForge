import { Request, Response, NextFunction } from "express";
import { resilienceService } from "../services/resilience.service.js";

/**
 * Tracks in-flight HTTP requests and sheds new non-health traffic when the server enters graceful shutdown.
 */
export function requestDrainingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Always permit health and readiness probes so orchestrators/LBs can detect state transitions
  if (
    req.path === "/health" ||
    req.path === "/ready" ||
    req.path.startsWith("/health/")
  ) {
    return next();
  }

  if (resilienceService.isShuttingDown()) {
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: "SERVER_SHUTTING_DOWN",
        message:
          "Server is currently draining connections for shutdown or failover.",
      },
    });
    return;
  }

  resilienceService.incrementActiveRequests();

  let decremented = false;
  const onDone = () => {
    if (!decremented) {
      decremented = true;
      resilienceService.decrementActiveRequests();
    }
  };

  res.on("finish", onDone);
  res.on("close", onDone);

  next();
}
