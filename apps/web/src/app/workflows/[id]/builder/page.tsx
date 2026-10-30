"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
  ReactFlowProvider,
} from "reactflow";
import { useSearchParams, useRouter } from "next/navigation";
import { validateWorkflowGraph } from "@flowforge/workflow-engine";
import { NodeType } from "@flowforge/shared";

import { WorkflowCustomNode } from "../../../../components/workflow/WorkflowCustomNode";
import { NodePalette } from "../../../../components/workflow/NodePalette";
import { NodeConfigPanel } from "../../../../components/workflow/NodeConfigPanel";
import {
  EditorToolbar,
  SaveStatus,
} from "../../../../components/workflow/EditorToolbar";
import {
  workflowDefinitionToReactFlow,
  reactFlowToWorkflowDefinition,
} from "../../../../lib/graph-serializer";
import { getNodeRegistryItem } from "../../../../lib/node-registry";
import { AlertTriangle, CheckCircle, Zap } from "lucide-react";

interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  publishedVersionId?: string;
  draftDefinition?: any;
}

function WorkflowBuilderContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const versionIdParam = searchParams.get("versionId");

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [workflowName, setWorkflowName] = useState<string>("Loading Workflow...");
  const [versionNumber, setVersionNumber] = useState<number | undefined>(undefined);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(Boolean(versionIdParam));

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [validationErrors, setValidationErrors] = useState<
    Array<{ code: string; message: string; nodeId?: string }>
  >([]);
  const [validationBanner, setValidationBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Undo / Redo History Stacks
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const futureRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );

  const nodeTypes = useMemo(() => ({ customNode: WorkflowCustomNode }), []);

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    futureRef.current = [];
    setSaveStatus("unsaved");
  }, [nodes, edges]);

  // Load Workflow on Mount or on versionId change
  useEffect(() => {
    setIsLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    if (versionIdParam) {
      // Historical published version
      fetch(`${apiUrl}/api/v1/workflows/${params.id}/versions/${versionIdParam}`, {
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && data?.data) {
            const ver = data.data;
            setVersionNumber(ver.versionNumber);
            setIsReadOnly(true);
            const { nodes: rfNodes, edges: rfEdges } =
              workflowDefinitionToReactFlow(ver.definition);
            setNodes(rfNodes);
            setEdges(rfEdges);
            setWorkflowName(`Workflow (v${ver.versionNumber})`);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      // Editable draft
      fetch(`${apiUrl}/api/v1/workflows/${params.id}`, {
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && data?.data) {
            const wf = data.data;
            setWorkflow(wf);
            setWorkflowName(wf.name);
            setIsReadOnly(false);

            if (wf.draftDefinition) {
              const { nodes: rfNodes, edges: rfEdges } =
                workflowDefinitionToReactFlow(wf.draftDefinition);
              setNodes(rfNodes);
              setEdges(rfEdges);
            }
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [params.id, versionIdParam]);

  // Node Changes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isReadOnly) return;
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        return next;
      });
      setSaveStatus("unsaved");
    },
    [isReadOnly],
  );

  // Edge Changes
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isReadOnly) return;
      setEdges((eds) => applyEdgeChanges(changes, eds));
      setSaveStatus("unsaved");
    },
    [isReadOnly],
  );

  // Connect Edges
  const onConnect = useCallback(
    (params: Connection) => {
      if (isReadOnly) return;
      pushHistory();

      let edgeLabel: string | undefined = undefined;
      if (params.sourceHandle === "true") edgeLabel = "True";
      else if (params.sourceHandle === "false") edgeLabel = "False";

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            label: edgeLabel,
            animated: true,
            style: { strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [isReadOnly, pushHistory],
  );

  // Selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Add Node from Palette
  const handleAddNode = useCallback(
    (type: NodeType, positionOverride?: { x: number; y: number }) => {
      if (isReadOnly) return;
      pushHistory();

      const registryItem = getNodeRegistryItem(type);
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let pos = positionOverride;
      if (!pos) {
        if (reactFlowInstance) {
          pos = reactFlowInstance.screenToFlowPosition({
            x: window.innerWidth / 2 - 100,
            y: window.innerHeight / 2 - 50,
          });
        } else {
          pos = { x: 250, y: 100 + nodes.length * 80 };
        }
      }

      const newNode: Node = {
        id: newId,
        type: "customNode",
        position: pos,
        data: {
          id: newId,
          name: registryItem.label,
          type,
          config: JSON.parse(JSON.stringify(registryItem.defaultConfig)),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newId);
    },
    [isReadOnly, pushHistory, reactFlowInstance, nodes.length],
  );

  // Drag & Drop to Canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isReadOnly || !reactFlowWrapper.current || !reactFlowInstance) return;

      const type = event.dataTransfer.getData("application/reactflow") as NodeType;
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      handleAddNode(type, position);
    },
    [isReadOnly, reactFlowInstance, handleAddNode],
  );

  // Update Node config & label
  const handleUpdateNode = useCallback(
    (id: string, name: string, config: Record<string, unknown>) => {
      if (isReadOnly) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  name,
                  config,
                },
              }
            : n,
        ),
      );
      setSaveStatus("unsaved");
    },
    [isReadOnly],
  );

  // Delete Node
  const handleDeleteNode = useCallback(
    (id: string) => {
      if (isReadOnly) return;
      pushHistory();

      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [isReadOnly, pushHistory, selectedNodeId],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (isReadOnly || historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    futureRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSaveStatus("unsaved");
  }, [isReadOnly, nodes, edges]);

  const handleRedo = useCallback(() => {
    if (isReadOnly || futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    setSaveStatus("unsaved");
  }, [isReadOnly, nodes, edges]);

  // Client & Server Validation
  const handleValidate = useCallback(async (): Promise<boolean> => {
    const ast = reactFlowToWorkflowDefinition(nodes, edges);
    const localValidation = validateWorkflowGraph(ast);

    if (!localValidation.isValid) {
      setValidationErrors(
        localValidation.errors.map((e) => ({
          code: e.code,
          message: e.message,
          nodeId: e.nodeId,
        })),
      );

      // Attach error indicators to node data
      setNodes((nds) =>
        nds.map((n) => {
          const matchingErr = localValidation.errors.find((e) => e.nodeId === n.id);
          return {
            ...n,
            data: {
              ...n.data,
              error: matchingErr ? matchingErr.message : undefined,
            },
          };
        }),
      );

      setValidationBanner({
        type: "error",
        message: `Graph validation failed with ${localValidation.errors.length} issue(s).`,
      });
      return false;
    }

    // Call server-side validation endpoint
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/api/v1/workflows/${params.id}/validate`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const body = await res.json();
        if (body.success && !body.data.isValid) {
          setValidationErrors(body.data.errors);
          setValidationBanner({
            type: "error",
            message: "Server graph validation rejected the draft.",
          });
          return false;
        }
      }
    } catch {
      // Offline fallback: local validation passed
    }

    // Clear errors
    setValidationErrors([]);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, error: undefined },
      })),
    );
    setValidationBanner({
      type: "success",
      message: "Workflow graph structure is valid and ready to publish!",
    });
    return true;
  }, [nodes, edges, params.id]);

  // Save Draft API
  const handleSaveDraft = useCallback(async (): Promise<boolean> => {
    if (isReadOnly) return false;
    setSaveStatus("saving");

    const ast = reactFlowToWorkflowDefinition(nodes, edges);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/v1/workflows/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: workflowName,
          nodes: ast.nodes,
          edges: ast.edges,
        }),
      });

      if (!res.ok) {
        throw new Error("Save request failed");
      }

      setSaveStatus("saved");
      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }, [isReadOnly, nodes, edges, workflowName, params.id]);

  // Publish Workflow API
  const handlePublish = useCallback(async () => {
    if (isReadOnly) return;

    // 1. Validate
    const isValid = await handleValidate();
    if (!isValid) return;

    // 2. Save
    const isSaved = await handleSaveDraft();
    if (!isSaved) return;

    // 3. Publish
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      const res = await fetch(`${apiUrl}/api/v1/workflows/${params.id}/publish`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const body = await res.json();
        const newVer = body.data?.version?.versionNumber || 1;
        setWorkflow((prev) => (prev ? { ...prev, status: "ACTIVE" } : null));
        setValidationBanner({
          type: "success",
          message: `Successfully published version ${newVer}! Workflow is now active.`,
        });
      } else {
        const err = await res.json();
        setValidationBanner({
          type: "error",
          message: err.error?.message || "Publishing failed.",
        });
      }
    } catch {
      setValidationBanner({
        type: "error",
        message: "Network error occurred while publishing.",
      });
    }
  }, [isReadOnly, handleValidate, handleSaveDraft, params.id]);

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+Z, Ctrl+Y, Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReadOnly) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        handleDeleteNode(selectedNodeId);
      } else if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        handleRedo();
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSaveDraft();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isReadOnly,
    selectedNodeId,
    handleDeleteNode,
    handleUndo,
    handleRedo,
    handleSaveDraft,
  ]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const selectedNodeErrors = useMemo(
    () =>
      validationErrors
        .filter((e) => e.nodeId === selectedNodeId)
        .map((e) => e.message),
    [validationErrors, selectedNodeId],
  );

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center bg-slate-50 text-slate-500 text-xs">
        Loading workflow editor...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden select-none">
      {/* Top Editor Toolbar */}
      <EditorToolbar
        workflowId={params.id}
        name={workflowName}
        onNameChange={(name) => {
          setWorkflowName(name);
          setSaveStatus("unsaved");
        }}
        status={workflow?.status || "DRAFT"}
        versionNumber={versionNumber}
        isReadOnly={isReadOnly}
        saveStatus={saveStatus}
        canUndo={historyRef.current.length > 0}
        canRedo={futureRef.current.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onValidate={handleValidate}
        onSave={handleSaveDraft}
        onPublish={handlePublish}
        onReturnToDraft={() => {
          router.push(`/workflows/${params.id}/builder`);
        }}
        hasErrors={validationErrors.length > 0}
        accessLevel={(workflow as any)?.accessLevel}
        draftRevision={(workflow as any)?.draftRevision}
        owner={(workflow as any)?.owner}
      />

      {/* Validation Banner */}
      {validationBanner && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
            validationBanner.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {validationBanner.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            )}
            <span>{validationBanner.message}</span>
          </div>
          <button
            onClick={() => setValidationBanner(null)}
            className="text-[11px] underline font-medium hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Canvas Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Node Palette */}
        {!isReadOnly && (
          <NodePalette onAddNode={(type) => handleAddNode(type)} disabled={isReadOnly} />
        )}

        {/* Central React Flow Canvas */}
        <div
          ref={reactFlowWrapper}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className="flex-1 h-full bg-slate-100 relative"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            nodesDraggable={!isReadOnly}
            nodesConnectable={!isReadOnly}
            elementsSelectable={true}
            fitView
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls className="!bg-white !border !border-slate-200 !shadow-sm !rounded-md" />
            <MiniMap
              nodeColor={(node) => {
                const reg = getNodeRegistryItem(node.data?.type);
                if (reg.category === "Triggers") return "#10b981";
                if (reg.category === "Logic") return "#f59e0b";
                if (reg.category === "Actions") return "#0ea5e9";
                return "#64748b";
              }}
              className="!border !border-slate-200 !rounded-md !bg-white"
            />
          </ReactFlow>

          {/* Empty Canvas Guidance */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="bg-white/90 backdrop-blur-xs p-6 rounded-xl border border-slate-200 shadow-md max-w-sm text-center space-y-3 pointer-events-auto">
                <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto text-teal-600">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Empty Workflow Canvas
                </h3>
                <p className="text-xs text-slate-500">
                  Drag a node from the left palette or click below to start building your automated process.
                </p>
                {!isReadOnly && (
                  <button
                    onClick={() => handleAddNode("TRIGGER")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-xs transition"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Add Webhook / Trigger</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Node Configuration Panel */}
        {selectedNode && (
          <NodeConfigPanel
            selectedNode={selectedNode}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
            nodeErrors={selectedNodeErrors}
            readOnly={isReadOnly}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkflowBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent params={params} />
    </ReactFlowProvider>
  );
}
