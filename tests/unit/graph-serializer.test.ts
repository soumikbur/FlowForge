import { describe, it, expect } from "vitest";
import { WorkflowDefinition } from "@flowforge/shared";
import {
  workflowDefinitionToReactFlow,
  reactFlowToWorkflowDefinition,
} from "../../apps/web/src/lib/graph-serializer";

describe("Workflow Graph Serialization & Deserialization", () => {
  const sampleAst: WorkflowDefinition = {
    nodes: [
      {
        id: "node_trigger_1",
        type: "TRIGGER",
        name: "Order Webhook",
        config: { triggerType: "WEBHOOK", webhookPath: "/orders" },
        position: { x: 150, y: 80 },
      },
      {
        id: "node_condition_1",
        type: "CONDITION",
        name: "Check Amount > $500",
        config: { expression: "trigger.payload.amount > 500" },
        position: { x: 150, y: 220 },
      },
      {
        id: "node_approval_1",
        type: "APPROVAL",
        name: "Manager Approval",
        config: { title: "Approve Big Order", requiredRole: "ADMIN" },
        position: { x: 320, y: 360 },
      },
      {
        id: "node_end_1",
        type: "END",
        name: "Order Completed",
        config: {},
        position: { x: 150, y: 500 },
      },
    ],
    edges: [
      {
        id: "edge_t_to_c",
        source: "node_trigger_1",
        target: "node_condition_1",
      },
      {
        id: "edge_c_to_a_true",
        source: "node_condition_1",
        sourceHandle: "true",
        target: "node_approval_1",
      },
      {
        id: "edge_c_to_e_false",
        source: "node_condition_1",
        sourceHandle: "false",
        target: "node_end_1",
      },
      {
        id: "edge_a_to_e",
        source: "node_approval_1",
        target: "node_end_1",
      },
    ],
  };

  it("converts WorkflowDefinition AST to React Flow nodes and edges preserving all metadata", () => {
    const { nodes, edges } = workflowDefinitionToReactFlow(sampleAst);

    expect(nodes.length).toBe(4);
    expect(edges.length).toBe(4);

    // Verify node mapping
    const triggerNode = nodes.find((n) => n.id === "node_trigger_1");
    expect(triggerNode).toBeDefined();
    expect(triggerNode?.type).toBe("customNode");
    expect(triggerNode?.position).toEqual({ x: 150, y: 80 });
    expect(triggerNode?.data.name).toBe("Order Webhook");
    expect(triggerNode?.data.type).toBe("TRIGGER");
    expect(triggerNode?.data.config.triggerType).toBe("WEBHOOK");

    // Verify edge mapping and branch labels
    const trueEdge = edges.find((e) => e.id === "edge_c_to_a_true");
    expect(trueEdge).toBeDefined();
    expect(trueEdge?.source).toBe("node_condition_1");
    expect(trueEdge?.target).toBe("node_approval_1");
    expect(trueEdge?.sourceHandle).toBe("true");
    expect(trueEdge?.label).toBe("True");

    const falseEdge = edges.find((e) => e.id === "edge_c_to_e_false");
    expect(falseEdge).toBeDefined();
    expect(falseEdge?.sourceHandle).toBe("false");
    expect(falseEdge?.label).toBe("False");
  });

  it("converts React Flow nodes and edges back to WorkflowDefinition AST with zero ID churn", () => {
    const { nodes, edges } = workflowDefinitionToReactFlow(sampleAst);
    const restoredAst = reactFlowToWorkflowDefinition(nodes, edges);

    expect(restoredAst.nodes.length).toBe(4);
    expect(restoredAst.edges.length).toBe(4);

    // Verify exact ID preservation
    expect(restoredAst.nodes.map((n) => n.id)).toEqual([
      "node_trigger_1",
      "node_condition_1",
      "node_approval_1",
      "node_end_1",
    ]);

    // Verify position and config preservation
    expect(restoredAst.nodes[0].position).toEqual({ x: 150, y: 80 });
    expect(restoredAst.nodes[0].config).toEqual({
      triggerType: "WEBHOOK",
      webhookPath: "/orders",
    });

    // Verify edge handles
    const conditionTrueEdge = restoredAst.edges.find(
      (e) => e.source === "node_condition_1" && e.sourceHandle === "true",
    );
    expect(conditionTrueEdge).toBeDefined();
    expect(conditionTrueEdge?.target).toBe("node_approval_1");
  });

  it("handles empty or malformed input gracefully", () => {
    const emptyResult = workflowDefinitionToReactFlow({} as any);
    expect(emptyResult.nodes).toEqual([]);
    expect(emptyResult.edges).toEqual([]);

    const emptyRestored = reactFlowToWorkflowDefinition([], []);
    expect(emptyRestored.nodes).toEqual([]);
    expect(emptyRestored.edges).toEqual([]);
  });
});
