import { describe, it, expect } from "vitest";
import {
  NODE_REGISTRY,
  PALETTE_CATEGORIES,
  getNodeRegistryItem,
} from "../../apps/web/src/lib/node-registry";
import {
  TriggerNodeConfigSchema,
  ConditionNodeConfigSchema,
  HttpRequestNodeConfigSchema,
  EmailNodeConfigSchema,
  ApprovalNodeConfigSchema,
  DelayNodeConfigSchema,
  EndNodeConfigSchema,
} from "@flowforge/shared";

describe("Node Registry Specifications & Contract Verification", () => {
  it("contains all 7 core workflow node types", () => {
    const registeredTypes = Object.keys(NODE_REGISTRY);
    expect(registeredTypes).toContain("TRIGGER");
    expect(registeredTypes).toContain("CONDITION");
    expect(registeredTypes).toContain("HTTP_REQUEST");
    expect(registeredTypes).toContain("EMAIL");
    expect(registeredTypes).toContain("APPROVAL");
    expect(registeredTypes).toContain("DELAY");
    expect(registeredTypes).toContain("END");
    expect(registeredTypes.length).toBe(7);
  });

  it("organizes nodes into standard UI categories", () => {
    expect(PALETTE_CATEGORIES).toEqual(["Triggers", "Logic", "Actions", "Control"]);
    expect(NODE_REGISTRY.TRIGGER.category).toBe("Triggers");
    expect(NODE_REGISTRY.CONDITION.category).toBe("Logic");
    expect(NODE_REGISTRY.DELAY.category).toBe("Logic");
    expect(NODE_REGISTRY.HTTP_REQUEST.category).toBe("Actions");
    expect(NODE_REGISTRY.EMAIL.category).toBe("Actions");
    expect(NODE_REGISTRY.APPROVAL.category).toBe("Actions");
    expect(NODE_REGISTRY.END.category).toBe("Control");
  });

  it("enforces handle invariants per node type", () => {
    // Triggers have no inputs
    expect(NODE_REGISTRY.TRIGGER.hasInput).toBe(false);
    expect(NODE_REGISTRY.TRIGGER.outputs.length).toBe(1);

    // End has no outputs
    expect(NODE_REGISTRY.END.hasInput).toBe(true);
    expect(NODE_REGISTRY.END.outputs.length).toBe(0);

    // Condition has 2 explicit branch outputs (True & False)
    expect(NODE_REGISTRY.CONDITION.hasInput).toBe(true);
    expect(NODE_REGISTRY.CONDITION.outputs.length).toBe(2);
    expect(NODE_REGISTRY.CONDITION.outputs[0].id).toBe("true");
    expect(NODE_REGISTRY.CONDITION.outputs[1].id).toBe("false");
  });

  it("verifies that all default configurations strictly satisfy their Zod schemas", () => {
    expect(() =>
      TriggerNodeConfigSchema.parse(NODE_REGISTRY.TRIGGER.defaultConfig),
    ).not.toThrow();

    expect(() =>
      ConditionNodeConfigSchema.parse(NODE_REGISTRY.CONDITION.defaultConfig),
    ).not.toThrow();

    expect(() =>
      HttpRequestNodeConfigSchema.parse(NODE_REGISTRY.HTTP_REQUEST.defaultConfig),
    ).not.toThrow();

    expect(() =>
      EmailNodeConfigSchema.parse(NODE_REGISTRY.EMAIL.defaultConfig),
    ).not.toThrow();

    expect(() =>
      ApprovalNodeConfigSchema.parse(NODE_REGISTRY.APPROVAL.defaultConfig),
    ).not.toThrow();

    expect(() =>
      DelayNodeConfigSchema.parse(NODE_REGISTRY.DELAY.defaultConfig),
    ).not.toThrow();

    expect(() =>
      EndNodeConfigSchema.parse(NODE_REGISTRY.END.defaultConfig),
    ).not.toThrow();
  });

  it("returns fallback END item when queried for an unknown node type", () => {
    const item = getNodeRegistryItem("UNKNOWN_TYPE" as any);
    expect(item).toBeDefined();
    expect(item.type).toBe("END");
  });
});

