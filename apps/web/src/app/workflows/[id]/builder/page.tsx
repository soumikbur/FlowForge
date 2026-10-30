"use client";

import React, { useState, useCallback } from "react";
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
} from "reactflow";
import {
  Save,
  CheckCircle,
  AlertCircle,
  Play,
  ArrowLeft,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { validateWorkflowGraph } from "@flowforge/workflow-engine";

const initialNodes: Node[] = [
  {
    id: "node_trigger",
    type: "default",
    data: {
      label: "⚡ Order Webhook Trigger",
      nodeType: "TRIGGER",
      config: { triggerType: "WEBHOOK" },
    },
    position: { x: 250, y: 50 },
    style: {
      background: "#f0fdf4",
      borderColor: "#22c55e",
      borderRadius: "8px",
      fontWeight: 600,
    },
  },
  {
    id: "node_condition",
    type: "default",
    data: {
      label: "❓ Check Order > $10,000",
      nodeType: "CONDITION",
      config: { expression: "trigger.payload.orderValue > 10000" },
    },
    position: { x: 250, y: 160 },
    style: {
      background: "#fefce8",
      borderColor: "#eab308",
      borderRadius: "8px",
      fontWeight: 600,
    },
  },
  {
    id: "node_approval",
    type: "default",
    data: {
      label: "👤 Manager Approval",
      nodeType: "APPROVAL",
      config: { title: "Approve High Value Order" },
    },
    position: { x: 420, y: 280 },
    style: {
      background: "#eff6ff",
      borderColor: "#3b82f6",
      borderRadius: "8px",
      fontWeight: 600,
    },
  },
  {
    id: "node_email",
    type: "default",
    data: {
      label: "✉️ Send Confirmation Email",
      nodeType: "EMAIL",
      config: { to: "customer@example.com", subject: "Order Received" },
    },
    position: { x: 80, y: 280 },
    style: {
      background: "#faf5ff",
      borderColor: "#a855f7",
      borderRadius: "8px",
      fontWeight: 600,
    },
  },
  {
    id: "node_end",
    type: "default",
    data: { label: "🏁 Workflow Complete", nodeType: "END", config: {} },
    position: { x: 250, y: 420 },
    style: {
      background: "#f1f5f9",
      borderColor: "#64748b",
      borderRadius: "8px",
      fontWeight: 600,
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "node_trigger", target: "node_condition" },
  {
    id: "e2_true",
    source: "node_condition",
    sourceHandle: "true",
    target: "node_approval",
    label: "True (> $10k)",
  },
  {
    id: "e2_false",
    source: "node_condition",
    sourceHandle: "false",
    target: "node_email",
    label: "False (<= $10k)",
  },
  { id: "e3", source: "node_approval", target: "node_end" },
  { id: "e4", source: "node_email", target: "node_end" },
];

export default function WorkflowBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [],
  );

  const handleValidate = () => {
    const formattedDef = {
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.data.label,
        type: n.data.nodeType || "END",
        config: n.data.config || {},
        position: n.position,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle:
          e.sourceHandle ||
          (e.id.includes("true")
            ? "true"
            : e.id.includes("false")
              ? "false"
              : undefined),
      })),
    };

    const res = validateWorkflowGraph(formattedDef as any);
    if (!res.isValid) {
      setValidationErrors(res.errors.map((e) => `${e.code}: ${e.message}`));
      setPublishMessage(null);
    } else {
      setValidationErrors([]);
      setPublishMessage("Workflow graph is valid and ready for execution!");
    }
  };

  const handlePublish = async () => {
    handleValidate();
    setPublishMessage(
      "Successfully published version 2! Workflow is now active.",
    );
  };

  const addNode = (type: string, label: string) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id,
      type: "default",
      data: { label, nodeType: type, config: {} },
      position: { x: 250, y: 150 + nodes.length * 40 },
      style: {
        background: "#ffffff",
        borderColor: "#0d9488",
        borderRadius: "8px",
        fontWeight: 600,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* Top action bar */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Link
            href="/workflows"
            className="text-slate-500 hover:text-slate-800 p-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-slate-900">
              Order Processing & Manager Approval
            </h1>
            <p className="text-xs text-slate-400">Draft • ID: {params.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleValidate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <CheckCircle className="w-4 h-4 text-slate-600" />
            <span>Validate</span>
          </button>
          <button
            onClick={handlePublish}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-medium shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            <span>Publish Version</span>
          </button>
        </div>
      </div>

      {/* Main Canvas and Sidebars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 space-y-4 text-white overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Node Palette
          </p>
          <div className="space-y-2">
            {[
              { type: "CONDITION", label: "❓ Condition Branch" },
              { type: "HTTP_REQUEST", label: "🌐 HTTP API Request" },
              { type: "EMAIL", label: "✉️ Email Notification" },
              { type: "APPROVAL", label: "👤 Human Approval" },
              { type: "DELAY", label: "⏳ Delay Timer" },
              { type: "END", label: "🏁 End Leaf" },
            ].map((item) => (
              <button
                key={item.type}
                onClick={() => addNode(item.type, item.label)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium flex items-center justify-between transition"
              >
                <span>{item.label}</span>
                <Plus className="w-3.5 h-3.5 text-teal-400" />
              </button>
            ))}
          </div>

          {validationErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded-lg text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Validation Issues
              </p>
              {validationErrors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}

          {publishMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500 text-emerald-400 p-3 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>{publishMessage}</span>
            </div>
          )}
        </div>

        {/* React Flow Graph Surface */}
        <div className="flex-1 h-full bg-slate-50 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            fitView
          >
            <Background color="#cbd5e1" gap={16} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Node Properties Panel */}
        {selectedNode && (
          <div className="w-80 bg-white border-l border-slate-200 p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-600" />
                <span>Node Configuration</span>
              </h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Node ID
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedNode.id}
                  className="mt-1 w-full bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Display Label
                </label>
                <input
                  type="text"
                  value={selectedNode.data.label}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, data: { ...n.data, label: newLabel } }
                          : n,
                      ),
                    );
                    setSelectedNode((curr) =>
                      curr
                        ? { ...curr, data: { ...curr.data, label: newLabel } }
                        : null,
                    );
                  }}
                  className="mt-1 w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {selectedNode.data.nodeType === "CONDITION" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Condition Expression
                  </label>
                  <input
                    type="text"
                    placeholder="trigger.payload.orderValue > 10000"
                    value={selectedNode.data.config?.expression || ""}
                    onChange={(e) => {
                      const expr = e.target.value;
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? {
                                ...n,
                                data: {
                                  ...n.data,
                                  config: {
                                    ...n.data.config,
                                    expression: expr,
                                  },
                                },
                              }
                            : n,
                        ),
                      );
                    }}
                    className="mt-1 w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
