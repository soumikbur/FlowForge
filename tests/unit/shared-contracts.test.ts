import { describe, it, expect } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowNodeSchema,
  WorkflowEdgeSchema,
  NodeTypeEnum,
  ExecutionStatusEnum,
  RoleEnum,
  ApiResponse,
} from "@flowforge/shared";

describe("Shared Contracts & Zod Validation Schemas", () => {
  it("validates a correct workflow definition", () => {
    const validDef = {
      nodes: [
        {
          id: "n_trigger",
          type: "TRIGGER",
          name: "Manual Trigger",
          config: { triggerType: "MANUAL" },
        },
        {
          id: "n_end",
          type: "END",
          name: "Complete",
          config: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n_trigger",
          target: "n_end",
        },
      ],
    };

    const parseResult = WorkflowDefinitionSchema.safeParse(validDef);
    expect(parseResult.success).toBe(true);
  });

  it("rejects an invalid workflow definition missing required fields", () => {
    const invalidDef = {
      nodes: "not-an-array",
      edges: [],
    };

    const parseResult = WorkflowDefinitionSchema.safeParse(invalidDef);
    expect(parseResult.success).toBe(false);
  });

  it("rejects an invalid node type", () => {
    const invalidNode = {
      id: "node_1",
      type: "INVALID_UNKNOWN_TYPE",
      name: "Bad Node",
      config: {},
    };

    const parseResult = WorkflowNodeSchema.safeParse(invalidNode);
    expect(parseResult.success).toBe(false);
    expect(NodeTypeEnum.safeParse("INVALID_UNKNOWN_TYPE").success).toBe(false);
  });

  it("rejects a node missing its identifier", () => {
    const nodeMissingId = {
      id: "",
      type: "TRIGGER",
      name: "Trigger Without ID",
      config: {},
    };

    const parseResult = WorkflowNodeSchema.safeParse(nodeMissingId);
    expect(parseResult.success).toBe(false);
  });

  it("rejects malformed edges with missing source or target", () => {
    const malformedEdge = {
      id: "e1",
      source: "",
      target: "target_node",
    };

    const parseResult = WorkflowEdgeSchema.safeParse(malformedEdge);
    expect(parseResult.success).toBe(false);
  });

  it("validates execution status enum values and rejects invalid states", () => {
    expect(ExecutionStatusEnum.safeParse("QUEUED").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("RUNNING").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("WAITING_APPROVAL").success).toBe(
      true,
    );
    expect(ExecutionStatusEnum.safeParse("WAITING_DELAY").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("RETRYING").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("SUCCEEDED").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("FAILED").success).toBe(true);
    expect(ExecutionStatusEnum.safeParse("CANCELLED").success).toBe(true);

    expect(ExecutionStatusEnum.safeParse("INVALID_STATUS").success).toBe(false);
    expect(ExecutionStatusEnum.safeParse("PENDING").success).toBe(false); // Step status, not execution status
  });

  it("conforms to standardized ApiResponse error envelope contract", () => {
    const errorResponse: ApiResponse = {
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid payload provided",
        details: [{ path: "name", issue: "Required" }],
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.data).toBeNull();
    expect(errorResponse.error?.code).toBe("VALIDATION_FAILED");
    expect(errorResponse.error?.message).toBeDefined();
  });
});
