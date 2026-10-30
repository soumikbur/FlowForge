import http from "http";
import { config } from "@flowforge/config";
import { InMemoryDatabase } from "@flowforge/test-utils";
import { WorkflowExecutionRunner } from "./runner.js";

// Setup background worker server
const port = config.WORKER_PORT || 4001;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        service: "flowforge-worker",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(
    `[FlowForge Worker] Worker service running and healthy on port ${port}`,
  );
});

export { WorkflowExecutionRunner };
