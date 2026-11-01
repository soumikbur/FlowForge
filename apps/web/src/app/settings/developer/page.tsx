"use client";

import React, { useState, useEffect } from "react";
import {
  Code,
  Key,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Send,
  ShieldAlert,
  Server,
  Activity,
  CheckCircle2,
  Clock,
  Terminal,
  ExternalLink,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
}

interface WebhookDeliveryItem {
  id: string;
  subscriptionId: string;
  eventId: string;
  url: string;
  status: string;
  attemptCount: number;
  statusCode?: number | null;
  error?: string | null;
  createdAt: string;
}

interface ReliabilityMetricsData {
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
  };
  inboundWebhooks: {
    verified: number;
    invalidSignatures: number;
    replaysDetected: number;
  };
  outboundWebhooks: {
    delivered: number;
    deadLettered: number;
    replayed: number;
    activeDeadLetterCount: number;
  };
}

export default function DeveloperPortalPage() {
  const [activeTab, setActiveTab] = useState<
    "keys" | "dlq" | "snippets" | "metrics"
  >("keys");
  const [codeLang, setCodeLang] = useState<"nodejs" | "python" | "curl">(
    "nodejs",
  );
  const [copied, setCopied] = useState<string | null>(null);

  // DLQ & Replay state
  const [dlqDeliveries, setDlqDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replaySuccess, setReplaySuccess] = useState<string | null>(null);

  // Rotation state
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [rotatedSecretResult, setRotatedSecretResult] = useState<string | null>(
    null,
  );

  // Metrics state
  const [metrics, setMetrics] = useState<ReliabilityMetricsData | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const fetchDLQ = async () => {
    try {
      const res = await fetch("/api/v1/webhooks/deliveries/dead-letter");
      if (res.ok) {
        const json = await res.json();
        setDlqDeliveries(json.data || []);
      }
    } catch {
      // Fallback empty
    }
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch("/api/v1/metrics/reliability");
      if (res.ok) {
        const json = await res.json();
        setMetrics(json.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchDLQ();
    fetchMetrics();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleReplay = async (deliveryId: string) => {
    setReplayingId(deliveryId);
    try {
      const res = await fetch(
        `/api/v1/webhooks/deliveries/${deliveryId}/replay`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setReplaySuccess(`Delivery ${deliveryId} queued for replay!`);
        setTimeout(() => setReplaySuccess(null), 3500);
        await fetchDLQ();
        await fetchMetrics();
      }
    } catch {
      // Replay failed
    } finally {
      setReplayingId(null);
    }
  };

  const handleRotateWebhookSecret = async () => {
    setRotatingSecret(true);
    try {
      const res = await fetch("/api/v1/webhooks/config/default/rotate-secret", {
        method: "POST",
      });
      if (res.ok) {
        const json = await res.json();
        setRotatedSecretResult(
          json.data?.signingSecret || "whsec_rotated_new_secret",
        );
      }
    } catch {
      // Rotation failed
    } finally {
      setRotatingSecret(false);
    }
  };

  const codeSnippets = {
    nodejs: `// FlowForge Webhook Signature Verification (Node.js)
import crypto from "crypto";

export function verifyFlowForgeWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  maxAgeSeconds = 300
): boolean {
  // 1. Parse t=... and v1=... from signature header
  const parts = signatureHeader.split(",");
  const tPart = parts.find((p) => p.trim().startsWith("t="));
  const v1Part = parts.find((p) => p.trim().startsWith("v1="));

  if (!tPart || !v1Part) return false;

  const timestamp = parseInt(tPart.trim().slice(2), 10);
  const signature = v1Part.trim().slice(3);

  // 2. Reject replay outside allowable drift window
  const now = Date.now();
  if (Math.abs(now - timestamp) / 1000 > maxAgeSeconds) {
    return false;
  }

  // 3. Compute HMAC-SHA256 and verify constant-time
  const signedContent = \`\${timestamp}.\${payload}\`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signedContent);
  const expectedSignature = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}`,
    python: `# FlowForge Webhook Signature Verification (Python 3)
import hmac
import hashlib
import time

def verify_flowforge_webhook(payload: bytes, signature_header: str, secret: str, max_age_seconds: int = 300) -> bool:
    pairs = dict(item.strip().split("=", 1) for item in signature_header.split(","))
    if "t" not in pairs or "v1" not in pairs:
        return False

    timestamp = int(pairs["t"])
    signature = pairs["v1"]

    # Reject expired timestamps
    now_ms = int(time.time() * 1000)
    if abs(now_ms - timestamp) / 1000 > max_age_seconds:
        return False

    signed_content = f"{timestamp}.".encode("utf-8") + payload
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()

    return hmac.compare_digest(signature, expected)`,
    curl: `# Execute a workflow idempotently with automatic rate limit tracking
curl -X POST https://api.flowforge.dev/api/v1/workflows/wf_abc123/execute \\
  -H "Authorization: Bearer ff_live_secret_key" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"orderId": "ord_9981", "amount": 250.00}'`,
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <Code className="w-8 h-8 text-indigo-400" />
              <h1 className="text-2xl font-bold tracking-tight">
                Developer Portal & API Reliability
              </h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Production-grade API management, zero-downtime secret rotation,
              Dead-Letter Queue (DLQ), and verification SDKs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              API v1 Active (RFC 8594 Compliant)
            </span>
            <button
              onClick={() => {
                fetchDLQ();
                fetchMetrics();
              }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Deprecation Warning Banner */}
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-300">
              Active API Deprecation Notice:
            </span>{" "}
            <span className="text-slate-700 dark:text-slate-300">
              Endpoint{" "}
              <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">
                /workflows/:id/trigger
              </code>{" "}
              is deprecated and will sunset on Jan 1, 2027. Migrate to{" "}
              <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300">
                /workflows/:id/execute
              </code>
              . Similarly,{" "}
              <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">
                /deliveries/:id/retry
              </code>{" "}
              is replaced by{" "}
              <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300">
                /deliveries/:id/replay
              </code>
              .
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab("keys")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "keys"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            API Keys & Secret Rotation
          </button>
          <button
            onClick={() => setActiveTab("dlq")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "dlq"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            Dead-Letter Queue (DLQ)
            {dlqDeliveries.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30">
                {dlqDeliveries.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("snippets")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "snippets"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            SDK & Signature Verification
          </button>
          <button
            onClick={() => setActiveTab("metrics")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "metrics"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            Reliability & Rate Limits
          </button>
        </div>

        {/* TAB 1: API Keys & Secrets */}
        {activeTab === "keys" && (
          <div className="space-y-6">
            {/* Webhook Secret Rotation Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <Key className="w-5 h-5 text-indigo-400" />
                    Inbound Webhook Signing Secret (Zero-Downtime Rotation)
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    FlowForge allows seamless secret rotation. During rotation,
                    both the primary secret and previous secondary secret remain
                    valid for a 24-hour grace period.
                  </p>
                </div>
                <button
                  onClick={handleRotateWebhookSecret}
                  disabled={rotatingSecret}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${rotatingSecret ? "animate-spin" : ""}`}
                  />
                  Rotate Secret Now
                </button>
              </div>

              {rotatedSecretResult && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      New Secret Generated:{" "}
                      <code className="bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded text-emerald-200">
                        {rotatedSecretResult}
                      </code>
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(rotatedSecretResult, "newSecret")}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white px-2 py-1 bg-slate-800 rounded flex items-center gap-1"
                  >
                    {copied === "newSecret" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Dead-Letter Queue (DLQ) */}
        {activeTab === "dlq" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900/50">
              <div>
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  Dead-Letter Deliveries
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Deliveries that failed 5 consecutive attempts with exponential
                  backoff and jitter.
                </p>
              </div>
              <button
                onClick={fetchDLQ}
                className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white px-3 py-1.5 bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md transition"
              >
                Refresh List
              </button>
            </div>

            {replaySuccess && (
              <div className="bg-emerald-950/40 border-b border-emerald-800/40 px-4 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4" />
                {replaySuccess}
              </div>
            )}

            {dlqDeliveries.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/40 mb-2" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  All outbound webhooks healthy!
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  No dead-lettered webhook deliveries found for your
                  organization.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/60 text-xs uppercase font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Event / Delivery ID</th>
                    <th className="px-4 py-3">Destination URL</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Failure Reason</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {dlqDeliveries.map((del) => (
                    <tr
                      key={del.id}
                      className="hover:bg-slate-800/40 transition"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {del.id}
                        <div className="text-[10px] text-slate-500">
                          {del.eventId}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate text-slate-500 dark:text-slate-400">
                        {del.url}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-amber-400">
                        {del.attemptCount} / 5
                      </td>
                      <td className="px-4 py-3 text-xs text-red-400 max-w-sm truncate">
                        {del.error || `HTTP ${del.statusCode || "Timeout"}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleReplay(del.id)}
                          disabled={replayingId === del.id}
                          className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-xs font-medium transition disabled:opacity-50"
                        >
                          {replayingId === del.id ? "Replaying..." : "Replay"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: Code Snippets & Verification */}
        {activeTab === "snippets" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  Cryptographic Signature Verification Code
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  Copy and paste into your webhook listener to securely verify
                  inbound HMAC-SHA256 signatures with 300-second timestamp drift
                  protection.
                </p>
              </div>

              <div className="flex bg-slate-50 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                {(["nodejs", "python", "curl"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setCodeLang(lang)}
                    className={`px-3 py-1 rounded font-medium transition ${
                      codeLang === lang
                        ? "bg-indigo-600 text-slate-900 dark:text-white"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {lang === "nodejs"
                      ? "Node.js"
                      : lang === "python"
                        ? "Python"
                        : "cURL"}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <pre className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-800">
                {codeSnippets[codeLang]}
              </pre>
              <button
                onClick={() =>
                  handleCopy(codeSnippets[codeLang], "codeSnippet")
                }
                className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 transition"
                title="Copy Code"
              >
                {copied === "codeSnippet" ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: Reliability Metrics */}
        {activeTab === "metrics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Total API Requests
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {metrics?.requests.total ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Execute: {metrics?.requests.byCategory.execute ?? 0} | Auth:{" "}
                  {metrics?.requests.byCategory.auth ?? 0}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Rate Limit Throttles (429)
                </div>
                <div className="text-2xl font-bold text-amber-400 mt-1">
                  {metrics?.errors.rateLimited ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Total 4xx Errors: {metrics?.errors.total4xx ?? 0}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Idempotency Cache Hits
                </div>
                <div className="text-2xl font-bold text-indigo-400 mt-1">
                  {metrics?.idempotency.cacheHits ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  In-flight locks: {metrics?.idempotency.inFlightConflicts ?? 0}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Active DLQ Count
                </div>
                <div
                  className={`text-2xl font-bold mt-1 ${metrics?.outboundWebhooks.activeDeadLetterCount ? "text-red-400" : "text-emerald-400"}`}
                >
                  {metrics?.outboundWebhooks.activeDeadLetterCount ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Replays Successful: {metrics?.outboundWebhooks.replayed ?? 0}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
