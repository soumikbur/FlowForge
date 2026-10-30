import { app } from "./app.js";
import { config } from "@flowforge/config";

const port = config.PORT || 4000;

const server = app.listen(port, () => {
  console.log(
    `[FlowForge API] Server listening on port ${port} (env: ${config.NODE_ENV})`,
  );
});

// Graceful shutdown
export function handleShutdown(signal: string) {
  console.log(
    `[FlowForge API] Received ${signal}, starting graceful shutdown...`,
  );
  server.close(() => {
    console.log("[FlowForge API] HTTP server closed cleanly.");
    process.exit(0);
  });

  // Force close if connections don't drain within 5s
  setTimeout(() => {
    console.error("[FlowForge API] Forcefully shutting down after timeout.");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
