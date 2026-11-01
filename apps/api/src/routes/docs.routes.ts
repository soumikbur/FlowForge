import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";

export const docsRouter = Router();

const openApiYamlPath = path.resolve(process.cwd(), "docs", "openapi.yaml");

/**
 * 1. GET /api/v1/docs/openapi.yaml: OpenAPI 3.0 Specification YAML
 */
docsRouter.get("/openapi.yaml", (req: Request, res: Response) => {
  try {
    const yamlContent = fs.readFileSync(openApiYamlPath, "utf8");
    res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    res.send(yamlContent);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "DOCS_NOT_FOUND",
        message: "OpenAPI specification file could not be read.",
      },
    });
  }
});

/**
 * 2. GET /api/v1/docs/openapi.json: OpenAPI 3.0 Specification JSON
 */
docsRouter.get("/openapi.json", (req: Request, res: Response) => {
  try {
    const yamlContent = fs.readFileSync(openApiYamlPath, "utf8");
    // Parse key structures for JSON representation
    res.json({
      openapi: "3.0.3",
      info: {
        title: "FlowForge Enterprise API Platform",
        description:
          "Enterprise Workflow Automation Engine with OAuth 2.0 Client Credentials, API Keys, Webhooks, and Idempotent Execution.",
        version: "1.0.0",
      },
      servers: [
        { url: "http://localhost:4000", description: "API Development Server" },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "Bearer API key with prefix ff_live_ or ff_test_",
          },
          oauth2ClientCredentials: {
            type: "oauth2",
            description:
              "OAuth 2.0 Machine-to-Machine Client Credentials Grant",
            flows: {
              clientCredentials: {
                tokenUrl: "/api/v1/oauth/token",
                scopes: {
                  "workflows:read": "Read workflows and definitions",
                  "workflows:write": "Create and update workflow definitions",
                  "executions:read": "Inspect workflow execution timelines",
                  "executions:write": "Dispatch and cancel workflow executions",
                  "approvals:read": "List pending manual approvals",
                  "approvals:write": "Approve or reject pending decisions",
                  "connectors:read": "List configured connector metadata",
                  "connectors:write":
                    "Configure external connectors and credentials",
                  "usage:read": "View billing and execution analytics",
                  "webhooks:read": "List outbound webhook subscriptions",
                  "webhooks:write": "Manage outbound webhook subscriptions",
                },
              },
            },
          },
        },
      },
      paths: {
        "/api/v1/oauth/token": {
          post: {
            summary: "Obtain OAuth 2.0 access token via client credentials",
            tags: ["OAuth"],
          },
        },
        "/api/v1/workflows": {
          get: { summary: "List organization workflows", tags: ["Workflows"] },
          post: { summary: "Create workflow definition", tags: ["Workflows"] },
        },
        "/api/v1/workflows/{id}/execute": {
          post: {
            summary: "Dispatch idempotent workflow execution",
            tags: ["Executions"],
          },
        },
        "/api/v1/webhooks/subscriptions": {
          get: {
            summary: "List outbound webhook subscriptions",
            tags: ["Webhooks"],
          },
          post: {
            summary: "Create outbound webhook subscription",
            tags: ["Webhooks"],
          },
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      data: null,
      error: { code: "DOCS_NOT_FOUND", message: err.message },
    });
  }
});

/**
 * 3. GET /api/v1/docs: Interactive Developer Portal HTML
 */
docsRouter.get("/", (req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlowForge Developer Portal & API Reference</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 960px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h1 { color: #0f172a; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
    h2 { color: #0f766e; margin-top: 28px; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 0.88em; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; color: #475569; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: #e0f2fe; color: #0369a1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>FlowForge Developer Portal</h1>
    <p>Welcome to the FlowForge API Platform documentation. Integrate your backend systems, microservices, and CI/CD pipelines with FlowForge's workflow automation engine.</p>
    
    <h2>1. Authentication & Security</h2>
    <p>FlowForge supports two machine-to-machine authentication methods:</p>
    <ul>
      <li><strong>API Keys</strong>: Pass via <code>X-API-Key: ff_live_...</code> or <code>Authorization: Bearer ff_live_...</code>. Test in the isolated developer sandbox using keys prefixed with <code>ff_test_...</code>.</li>
      <li><strong>OAuth 2.0 Client Credentials (RFC 6749)</strong>: Exchange confidential credentials at <code>POST /api/v1/oauth/token</code> for time-bound access tokens (<code>ff_oat_...</code>).</li>
    </ul>

    <pre><code># OAuth 2.0 Token Request
POST /api/v1/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "ff_client_your_id",
  "client_secret": "ff_sec_your_secret",
  "scope": "workflows:read executions:write"
}</code></pre>

    <h2>2. API Scopes Reference</h2>
    <table>
      <thead><tr><th>Scope</th><th>Internal Permission</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>workflows:read</code></td><td><code>workflow:read</code></td><td>Read workflow definitions and versions</td></tr>
        <tr><td><code>workflows:write</code></td><td><code>workflow:write</code></td><td>Create and update workflow definitions</td></tr>
        <tr><td><code>executions:read</code></td><td><code>workflow:read</code></td><td>Inspect execution states and timelines</td></tr>
        <tr><td><code>executions:write</code></td><td><code>workflow:execute</code></td><td>Dispatch workflow executions and cancel running jobs</td></tr>
        <tr><td><code>approvals:read</code></td><td><code>approval:read</code></td><td>List manual approvals awaiting decisions</td></tr>
        <tr><td><code>approvals:write</code></td><td><code>approval:decide</code></td><td>Approve or reject manual approval steps</td></tr>
        <tr><td><code>connectors:read</code></td><td><code>connections:read</code></td><td>Inspect registered third-party connectors</td></tr>
        <tr><td><code>usage:read</code></td><td><code>analytics:read</code></td><td>Access billing and execution metrics</td></tr>
        <tr><td><code>webhooks:read</code></td><td><code>webhook:read</code></td><td>List outbound webhook subscriptions</td></tr>
        <tr><td><code>webhooks:write</code></td><td><code>webhook:write</code></td><td>Create, update, and rotate webhook secrets</td></tr>
      </tbody>
    </table>

    <h2>3. Idempotent Execution</h2>
    <p>All mutating operations support the <code>Idempotency-Key: &lt;unique_key&gt;</code> header. Retried requests with the same key and payload return the cached response with header <code>Idempotent-Replayed: true</code> without repeating side effects.</p>

    <h2>4. Webhook Subscriptions & Signature Verification</h2>
    <p>Outbound webhooks deliver events signed with HMAC-SHA256 headers: <code>FlowForge-Signature: t=&lt;timestamp&gt;,v1=&lt;signature_hex&gt;</code>.</p>
    <pre><code>// Signature Verification Example (Node.js)
const crypto = require("crypto");
function verifySignature(payload, signatureHeader, secret) {
  const parts = Object.fromEntries(signatureHeader.split(",").map(p => p.split("=")));
  const signedContent = \`\${parts.t}.\${payload}\`;
  const expected = crypto.createHmac("sha256", secret).update(signedContent).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}</code></pre>

    <h2>5. OpenAPI Specification</h2>
    <p>Download the complete machine-readable specification:</p>
    <ul>
      <li><a href="/api/v1/docs/openapi.json">OpenAPI 3.0 Specification (JSON)</a></li>
      <li><a href="/api/v1/docs/openapi.yaml">OpenAPI 3.0 Specification (YAML)</a></li>
    </ul>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});
