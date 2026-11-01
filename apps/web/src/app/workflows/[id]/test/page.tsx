"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Bug,
  Split,
  Plus,
  Trash2,
  RefreshCw,
  StepForward,
  Pause,
  FastForward,
  ChevronRight,
  FileCode,
  Lock,
} from "lucide-react";

interface NodeSimulationResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status:
    | "PASSED"
    | "FAILED"
    | "SKIPPED"
    | "MOCKED"
    | "UNSUPPORTED"
    | "BLOCKED"
    | "NOT_REACHED";
  durationMs: number;
  inputPayload?: unknown;
  outputPayload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  mocked: boolean;
  branchTaken?: string;
  redactedFields?: string[];
}

interface SimulationRunResult {
  simulationId: string;
  workflowId: string;
  workflowVersionId?: string;
  mode:
    | "STATIC_VALIDATION"
    | "SIMULATION"
    | "MOCKED_INTEGRATION"
    | "ISOLATED_REAL_INTEGRATION";
  status: "COMPLETED" | "FAILED" | "BLOCKED";
  durationMs: number;
  totalNodes: number;
  executedNodes: number;
  mockedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  unreachableNodes: string[];
  executionPath: string[];
  nodeResults: Record<string, NodeSimulationResult>;
  outputPayload?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  sideEffectsPrevented: boolean;
  realIntegrationExecuted: boolean;
}

interface AssertionRule {
  id?: string;
  type: string;
  nodeId?: string;
  targetPath?: string;
  expectedValue?: unknown;
  operator?: string;
}

interface WorkflowTestCaseRecord {
  id: string;
  name: string;
  description?: string;
  mode: string;
  inputData?: Record<string, unknown>;
  assertionRules: AssertionRule[];
  lastRunStatus?: "PASSED" | "FAILED" | "ERROR";
  lastRunAt?: string;
}

interface PublishingGateEvaluation {
  passed: boolean;
  checks: {
    staticValidation: { passed: boolean; message?: string };
    testSuite: {
      passed: boolean;
      totalTests: number;
      passedTests: number;
      message?: string;
    };
    regressionCheck: { passed: boolean; message?: string };
    policyCheck: { passed: boolean; message?: string };
  };
  reasons: string[];
}

export default function WorkflowTestPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const apiUrl = getApiBaseUrl();

  const [activeTab, setActiveTab] = useState<
    "simulate" | "tests" | "regression" | "gates"
  >("simulate");
  const [loading, setLoading] = useState(false);
  const [workflowName, setWorkflowName] = useState("Workflow Testing");

  // Simulation State
  const [mode, setMode] = useState<
    | "STATIC_VALIDATION"
    | "SIMULATION"
    | "MOCKED_INTEGRATION"
    | "ISOLATED_REAL_INTEGRATION"
  >("SIMULATION");
  const [inputPayloadStr, setInputPayloadStr] = useState(
    `{\n  "orderId": "ORD-9874",\n  "amount": 250.00,\n  "currency": "USD"\n}`,
  );
  const [simulationResult, setSimulationResult] =
    useState<SimulationRunResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Debugger State
  const [debugSessionId, setDebugSessionId] = useState<string | null>(null);
  const [debugStatus, setDebugStatus] = useState<string | null>(null);
  const [debugStepIndex, setDebugStepIndex] = useState(0);

  // Test Cases State
  const [testCases, setTestCases] = useState<WorkflowTestCaseRecord[]>([]);
  const [newTestName, setNewTestName] = useState("");
  const [newTestDesc, setNewTestDesc] = useState("");

  // Publishing Gate State
  const [gateEvaluation, setGateEvaluation] =
    useState<PublishingGateEvaluation | null>(null);

  // Regression State
  const [compareVersionId, setCompareVersionId] = useState("");
  const [regressionResult, setRegressionResult] = useState<any>(null);

  // Load Initial Data
  const loadInitialData = useCallback(async () => {
    try {
      // 1. Fetch Workflow Info
      const wfRes = await fetch(`${apiUrl}/api/v1/workflows/${workflowId}`, {
        credentials: "include",
      });
      if (wfRes.ok) {
        const wfData = await wfRes.json();
        if (wfData.data?.name) setWorkflowName(wfData.data.name);
      }

      // 2. Fetch Test Cases
      const tcRes = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/tests`,
        { credentials: "include" },
      );
      if (tcRes.ok) {
        const tcData = await tcRes.json();
        if (tcData.data) setTestCases(tcData.data);
      }

      // 3. Fetch Gate Status
      const gateRes = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/gate-status`,
        { credentials: "include" },
      );
      if (gateRes.ok) {
        const gateData = await gateRes.json();
        if (gateData.data) setGateEvaluation(gateData.data);
      }
    } catch {
      // Local fallback
    }
  }, [apiUrl, workflowId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Run Simulation Handler
  const handleRunSimulation = async () => {
    setLoading(true);
    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(inputPayloadStr);
      } catch {
        alert("Invalid JSON in input payload");
        setLoading(false);
        return;
      }

      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            mode,
            inputData: parsedInput,
            authorizedForRealIntegration: mode === "ISOLATED_REAL_INTEGRATION",
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        setSimulationResult(data.data);
        if (data.data.executionPath?.length > 0) {
          setSelectedNodeId(data.data.executionPath[0]);
        }
      } else {
        alert(`Simulation Error: ${data.error?.message || "Failed"}`);
      }
    } catch (err: any) {
      alert(`Simulation request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Start Debug Session Handler
  const handleStartDebug = async () => {
    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(inputPayloadStr);
      } catch {
        alert("Invalid JSON in input payload");
        return;
      }

      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/debug/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            mode,
            inputData: parsedInput,
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        setDebugSessionId(data.data.id);
        setDebugStatus(data.data.status);
        setDebugStepIndex(data.data.currentStepIndex);
      }
    } catch (err: any) {
      alert(`Debug error: ${err.message}`);
    }
  };

  // Step Debug Handler
  const handleStepDebug = async () => {
    if (!debugSessionId) return;
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/debug/session/${debugSessionId}/step`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (data.success) {
        setDebugStatus(data.data.status);
        setDebugStepIndex(data.data.currentStepIndex);
        if (data.data.simulationResult) {
          setSimulationResult(data.data.simulationResult);
        }
      }
    } catch (err: any) {
      alert(`Step error: ${err.message}`);
    }
  };

  // Resume Debug Handler
  const handleResumeDebug = async () => {
    if (!debugSessionId) return;
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/debug/session/${debugSessionId}/resume`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (data.success) {
        setDebugStatus(data.data.status);
        if (data.data.simulationResult) {
          setSimulationResult(data.data.simulationResult);
        }
      }
    } catch (err: any) {
      alert(`Resume error: ${err.message}`);
    }
  };

  // Create Test Case Handler
  const handleCreateTestCase = async () => {
    if (!newTestName) return;
    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(inputPayloadStr);
      } catch {
        // default
      }

      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/tests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: newTestName,
            description: newTestDesc,
            mode: "SIMULATION",
            inputData: parsedInput,
            assertionRules: [
              {
                type: "OUTPUT_EQUALS",
                targetPath: "status",
                expectedValue: "COMPLETED",
              },
            ],
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        setTestCases((prev) => [...prev, data.data]);
        setNewTestName("");
        setNewTestDesc("");
      }
    } catch (err: any) {
      alert(`Error creating test: ${err.message}`);
    }
  };

  // Run Single Test
  const handleRunTest = async (testId: string) => {
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/tests/${testId}/run`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (data.success) {
        setTestCases((prev) =>
          prev.map((t) =>
            t.id === testId
              ? {
                  ...t,
                  lastRunStatus: data.data.status,
                  lastRunAt: new Date().toISOString(),
                }
              : t,
          ),
        );
      }
    } catch (err: any) {
      alert(`Run error: ${err.message}`);
    }
  };

  // Run All Tests
  const handleRunAllTests = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/tests/run-all`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (data.success) {
        await loadInitialData();
      }
    } catch (err: any) {
      alert(`Run all error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Run Regression Diff
  const handleRunRegression = async () => {
    if (!compareVersionId) return;
    setLoading(true);
    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(inputPayloadStr);
      } catch {
        // ignore
      }

      const res = await fetch(
        `${apiUrl}/api/v1/workflows/${workflowId}/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetVersionId: compareVersionId,
            testInput: parsedInput,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setRegressionResult(data.data);
      }
    } catch (err: any) {
      alert(`Regression error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-white dark:bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between backdrop-blur transition-colors duration-150">
        <div className="flex items-center gap-4">
          <Link
            href={`/workflows/${workflowId}`}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                SAFE VALIDATION LAB
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic & Non-Mutating
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {workflowName} — Testing & Simulation
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/workflows/${workflowId}/builder`}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-800 transition"
          >
            Open Builder
          </Link>
          <Link
            href={`/workflows/${workflowId}`}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-800 transition"
          >
            Lifecycle & Releases
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 px-6 flex gap-6">
        <button
          onClick={() => setActiveTab("simulate")}
          className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "simulate"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
          }`}
        >
          <Play className="w-4 h-4" /> Simulation & Stepwise Debugger
        </button>
        <button
          onClick={() => setActiveTab("tests")}
          className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "tests"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Test Cases & Assertions (
          {testCases.length})
        </button>
        <button
          onClick={() => setActiveTab("regression")}
          className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "regression"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
          }`}
        >
          <Split className="w-4 h-4" /> Regression & Version Diff
        </button>
        <button
          onClick={() => setActiveTab("gates")}
          className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "gates"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
          }`}
        >
          <Lock className="w-4 h-4" /> Publishing Gates
          {gateEvaluation && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                gateEvaluation.passed
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {gateEvaluation.passed ? "PASSED" : "BLOCKED"}
            </span>
          )}
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === "simulate" && (
          <div className="grid grid-cols-12 gap-6">
            {/* Left Column: Configuration & Controls */}
            <div className="col-span-4 space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Play className="w-4 h-4 text-amber-400" /> Execution Mode
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setMode("SIMULATION")}
                    className={`p-2.5 rounded-lg border text-left font-medium transition ${
                      mode === "SIMULATION"
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      SIMULATION
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Synthetic input, zero side effects
                    </div>
                  </button>
                  <button
                    onClick={() => setMode("MOCKED_INTEGRATION")}
                    className={`p-2.5 rounded-lg border text-left font-medium transition ${
                      mode === "MOCKED_INTEGRATION"
                        ? "border-blue-500 bg-blue-500/10 text-blue-300"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      MOCKED
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Intercepted connector doubles
                    </div>
                  </button>
                  <button
                    onClick={() => setMode("STATIC_VALIDATION")}
                    className={`p-2.5 rounded-lg border text-left font-medium transition ${
                      mode === "STATIC_VALIDATION"
                        ? "border-purple-500 bg-purple-500/10 text-purple-300"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      STATIC
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Graph schema validation only
                    </div>
                  </button>
                  <button
                    onClick={() => setMode("ISOLATED_REAL_INTEGRATION")}
                    className={`p-2.5 rounded-lg border text-left font-medium transition ${
                      mode === "ISOLATED_REAL_INTEGRATION"
                        ? "border-rose-500 bg-rose-500/10 text-rose-300"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      REAL INTEGRATION
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Sandbox only (requires Admin)
                    </div>
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                    Synthetic Input Payload (JSON)
                  </label>
                  <textarea
                    rows={6}
                    value={inputPayloadStr}
                    onChange={(e) => setInputPayloadStr(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-amber-500 text-slate-700 dark:text-slate-300"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleRunSimulation}
                    disabled={loading}
                    className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 font-semibold text-xs text-slate-950 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Run Simulation
                  </button>
                </div>
              </div>

              {/* Stepwise Debugger Control Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Bug className="w-4 h-4 text-emerald-400" /> Stepwise
                    Debugger
                  </span>
                  {debugStatus && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-300 dark:border-slate-700">
                      {debugStatus} (Step {debugStepIndex})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pause execution on breakpoints, inspect intermediate node
                  variables, and step forward deterministically.
                </p>

                <div className="flex gap-2">
                  {!debugSessionId ? (
                    <button
                      onClick={handleStartDebug}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition"
                    >
                      <Bug className="w-3.5 h-3.5" /> Start Debug Session
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleStepDebug}
                        disabled={debugStatus === "COMPLETED"}
                        className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                      >
                        <StepForward className="w-3.5 h-3.5" /> Step Next
                      </button>
                      <button
                        onClick={handleResumeDebug}
                        disabled={debugStatus === "COMPLETED"}
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <FastForward className="w-3.5 h-3.5" /> Resume
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Execution Trace & Node Inspector */}
            <div className="col-span-8 space-y-5">
              {simulationResult ? (
                <>
                  {/* Summary Bar */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          simulationResult.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {simulationResult.status === "COMPLETED" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <XCircle className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          Status: {simulationResult.status}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            ({simulationResult.durationMs}ms)
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {simulationResult.executedNodes} nodes executed •{" "}
                          {simulationResult.mockedNodes} mocked •{" "}
                          {simulationResult.skippedNodes} skipped •{" "}
                          {simulationResult.unreachableNodes.length} unreachable
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Zero Side
                        Effects
                      </span>
                    </div>
                  </div>

                  {/* Execution Path Flow */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Execution Path Trace
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      {simulationResult.executionPath.map((nodeId, idx) => {
                        const nr = simulationResult.nodeResults[nodeId];
                        const isSelected = selectedNodeId === nodeId;
                        return (
                          <React.Fragment key={nodeId}>
                            <button
                              onClick={() => setSelectedNodeId(nodeId)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition ${
                                isSelected
                                  ? "border-amber-500 bg-amber-500/20 text-slate-900 dark:text-white"
                                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  nr?.status === "PASSED"
                                    ? "bg-emerald-400"
                                    : nr?.status === "FAILED"
                                      ? "bg-rose-400"
                                      : nr?.status === "MOCKED"
                                        ? "bg-blue-400"
                                        : "bg-slate-400"
                                }`}
                              />
                              {nr?.nodeName || nodeId}
                            </button>
                            {idx <
                              simulationResult.executionPath.length - 1 && (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Node Inspector Card */}
                  {selectedNodeId &&
                    simulationResult.nodeResults[selectedNodeId] && (
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-white dark:bg-slate-900 space-y-4">
                        {(() => {
                          const nr =
                            simulationResult.nodeResults[selectedNodeId];
                          return (
                            <>
                              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    {nr.nodeName}
                                    <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400">
                                      ({nr.nodeId})
                                    </span>
                                  </h4>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                    Type: {nr.nodeType}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs px-2.5 py-0.5 rounded font-mono font-semibold ${
                                      nr.status === "PASSED"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : nr.status === "FAILED"
                                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                          : nr.status === "MOCKED"
                                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                            : "bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/30"
                                    }`}
                                  >
                                    {nr.status}
                                  </span>
                                  {nr.mocked && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                                      Mocked Double
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Redaction Notice */}
                              {nr.redactedFields &&
                                nr.redactedFields.length > 0 && (
                                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>
                                      Sensitive credentials redacted:{" "}
                                      {nr.redactedFields.join(", ")}
                                    </span>
                                  </div>
                                )}

                              {/* Node Input & Output Payloads */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Resolved Node Inputs
                                  </h5>
                                  <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-56">
                                    {JSON.stringify(nr.inputPayload, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Evaluated Node Outputs
                                  </h5>
                                  <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-56">
                                    {JSON.stringify(nr.outputPayload, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                </>
              ) : (
                <div className="h-96 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                  <Play className="w-10 h-10 text-slate-600" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    No simulation executed yet
                  </p>
                  <p className="text-xs max-w-sm">
                    Configure your synthetic inputs or breakpoints and click
                    &quot;Run Simulation&quot; to test your workflow logic
                    safely.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "tests" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Automated Test Suite
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Regression test cases with assertions for node execution,
                  branching paths, and payload schemas.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRunAllTests}
                  disabled={loading || testCases.length === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-slate-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Run All Tests
                </button>
              </div>
            </div>

            {/* Test Case Creator */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 grid grid-cols-12 gap-3 items-end">
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Test Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Valid Order Approval Path"
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="col-span-6">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Validates conditional threshold branching when order &gt; $100"
                  value={newTestDesc}
                  onChange={(e) => setNewTestDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="col-span-2">
                <button
                  onClick={handleCreateTestCase}
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Test
                </button>
              </div>
            </div>

            {/* Test Case Cards */}
            <div className="space-y-3">
              {testCases.map((tc) => (
                <div
                  key={tc.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between hover:border-slate-300 dark:border-slate-700 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {tc.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-500 dark:text-slate-400">
                        {tc.mode}
                      </span>
                      {tc.lastRunStatus && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                            tc.lastRunStatus === "PASSED"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {tc.lastRunStatus}
                        </span>
                      )}
                    </div>
                    {tc.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tc.description}
                      </p>
                    )}
                    <div className="text-[11px] text-slate-500">
                      Assertions: {tc.assertionRules?.length || 0} checks
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunTest(tc.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1 transition"
                    >
                      <Play className="w-3 h-3" /> Run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "regression" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Version Regression Comparison
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Run identical test inputs across draft and historical versions
                to identify behavioral drift or unexpected branching
                regressions.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-end gap-3 max-w-xl">
              <div className="flex-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Target Version ID (to compare against draft)
                </label>
                <input
                  type="text"
                  placeholder="ver_1 or version ID"
                  value={compareVersionId}
                  onChange={(e) => setCompareVersionId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={handleRunRegression}
                disabled={loading || !compareVersionId}
                className="py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Split className="w-3.5 h-3.5" /> Compare Regressions
              </button>
            </div>

            {regressionResult && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Regression Status:
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        regressionResult.hasRegressions
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {regressionResult.hasRegressions
                        ? "REGRESSIONS DETECTED"
                        : "NO REGRESSIONS"}
                    </span>
                  </h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Path Match:{" "}
                    {regressionResult.pathIdentical ? "Identical" : "Diverged"}
                  </span>
                </div>

                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <p className="font-semibold mb-1">Path Comparison:</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Base: {regressionResult.basePath?.join(" → ")}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Target: {regressionResult.targetPath?.join(" → ")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "gates" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pre-Release Publishing Gates
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Governed safety policies that mandate automated testing, static
                validation, and zero regressions prior to publishing to
                production.
              </p>
            </div>

            {gateEvaluation ? (
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between ${
                    gateEvaluation.passed
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {gateEvaluation.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-rose-400" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {gateEvaluation.passed
                          ? "All Publishing Gates Passed"
                          : "Publishing Gates Blocked"}
                      </h4>
                      <p className="text-xs mt-0.5 opacity-90">
                        {gateEvaluation.passed
                          ? "Workflow draft meets all structural, test, and policy standards for production release."
                          : "Workflow cannot be published until all gate criteria are satisfied."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Gate Checklist */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 divide-y divide-slate-800 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        1. Static Graph Validation
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Validates graph topology, node schemas, and cycles
                      </p>
                    </div>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        gateEvaluation.checks.staticValidation.passed
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-rose-400 bg-rose-500/10"
                      }`}
                    >
                      {gateEvaluation.checks.staticValidation.passed
                        ? "PASSED"
                        : "FAILED"}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        2. Test Suite Pass Requirement
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Pass rate: {gateEvaluation.checks.testSuite.passedTests}{" "}
                        / {gateEvaluation.checks.testSuite.totalTests} tests
                        passed
                      </p>
                    </div>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        gateEvaluation.checks.testSuite.passed
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-rose-400 bg-rose-500/10"
                      }`}
                    >
                      {gateEvaluation.checks.testSuite.passed
                        ? "PASSED"
                        : "FAILED"}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        3. Regression Drift Check
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Ensures no unexpected breaking behavioral changes
                      </p>
                    </div>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        gateEvaluation.checks.regressionCheck.passed
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-rose-400 bg-rose-500/10"
                      }`}
                    >
                      {gateEvaluation.checks.regressionCheck.passed
                        ? "PASSED"
                        : "FAILED"}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        4. Enterprise Policy-as-Code Check
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Evaluates organizational governance policies
                      </p>
                    </div>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        gateEvaluation.checks.policyCheck.passed
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-rose-400 bg-rose-500/10"
                      }`}
                    >
                      {gateEvaluation.checks.policyCheck.passed
                        ? "PASSED"
                        : "FAILED"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs">
                Loading gate status...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
