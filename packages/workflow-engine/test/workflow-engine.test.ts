import { describe, it, expect } from 'vitest';
import {
  validateWorkflowGraph,
  evaluateCondition,
  interpolateTemplate,
  canTransition,
  assertTransition,
  defaultRegistry,
  resolveNextNodes,
  getTriggerNode
} from '../src/index.js';
import { WorkflowDefinition } from '@flowforge/shared';

describe('Workflow Graph Validation', () => {
  it('rejects empty graphs', () => {
    const res = validateWorkflowGraph({ nodes: [], edges: [] });
    expect(res.isValid).toBe(false);
    expect(res.errors[0].code).toBe('EMPTY_GRAPH');
  });

  it('rejects graph missing trigger node', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: '1', type: 'END', name: 'End', config: {} }
      ],
      edges: []
    };
    const res = validateWorkflowGraph(def);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'MISSING_TRIGGER_NODE')).toBe(true);
  });

  it('detects duplicate node IDs', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 't1', type: 'TRIGGER', name: 'Trigger 1', config: {} },
        { id: 't1', type: 'END', name: 'Duplicate', config: {} }
      ],
      edges: []
    };
    const res = validateWorkflowGraph(def);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_NODE_ID')).toBe(true);
  });

  it('detects unreachable nodes and cycles', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 't', type: 'TRIGGER', name: 'Trigger', config: {} },
        { id: 'a', type: 'END', name: 'Node A', config: {} },
        { id: 'b', type: 'END', name: 'Node B', config: {} } // unreachable
      ],
      edges: [
        { id: 'e1', source: 't', target: 'a' }
      ]
    };
    const res = validateWorkflowGraph(def);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNREACHABLE_NODE')).toBe(true);
  });

  it('detects cycle in graph', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 't', type: 'TRIGGER', name: 'Trigger', config: {} },
        { id: 'n1', type: 'DELAY', name: 'Delay 1', config: { durationSeconds: 5 } },
        { id: 'n2', type: 'DELAY', name: 'Delay 2', config: { durationSeconds: 5 } }
      ],
      edges: [
        { id: 'e1', source: 't', target: 'n1' },
        { id: 'e2', source: 'n1', target: 'n2' },
        { id: 'e3', source: 'n2', target: 'n1' } // cycle!
      ]
    };
    const res = validateWorkflowGraph(def);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('validates condition handles', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 't', type: 'TRIGGER', name: 'Trigger', config: {} },
        { id: 'c', type: 'CONDITION', name: 'Condition', config: { expression: 'orderValue > 100' } },
        { id: 'e1', type: 'END', name: 'End True', config: {} },
        { id: 'e2', type: 'END', name: 'End False', config: {} }
      ],
      edges: [
        { id: 'edge_tc', source: 't', target: 'c' },
        { id: 'edge_ct', source: 'c', sourceHandle: 'true', target: 'e1' },
        { id: 'edge_cf', source: 'c', sourceHandle: 'false', target: 'e2' }
      ]
    };
    const res = validateWorkflowGraph(def);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });
});

describe('Expression Evaluator', () => {
  const ctx = {
    trigger: {
      payload: {
        orderValue: 15000,
        customer: 'Acme Corp',
        isVIP: true
      }
    }
  };

  it('evaluates numeric comparisons correctly', () => {
    expect(evaluateCondition('trigger.payload.orderValue > 10000', ctx)).toBe(true);
    expect(evaluateCondition('trigger.payload.orderValue < 10000', ctx)).toBe(false);
    expect(evaluateCondition('trigger.payload.orderValue >= 15000', ctx)).toBe(true);
  });

  it('evaluates string equality and boolean flags', () => {
    expect(evaluateCondition('trigger.payload.customer === "Acme Corp"', ctx)).toBe(true);
    expect(evaluateCondition('trigger.payload.isVIP === true', ctx)).toBe(true);
  });

  it('blocks prototype pollution safely', () => {
    expect(evaluateCondition('trigger.__proto__.isAdmin === true', ctx)).toBe(false);
  });

  it('interpolates templates safely', () => {
    const res = interpolateTemplate('Hello {{trigger.payload.customer}}, value: ${{trigger.payload.orderValue}}', ctx);
    expect(res).toBe('Hello Acme Corp, value: $15000');
  });
});

describe('Execution State Machine', () => {
  it('allows valid state transitions', () => {
    expect(canTransition('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'WAITING_APPROVAL')).toBe(true);
    expect(canTransition('WAITING_APPROVAL', 'QUEUED')).toBe(true);
    expect(canTransition('RUNNING', 'SUCCEEDED')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(canTransition('FAILED', 'RUNNING')).toBe(false);
    expect(() => assertTransition('SUCCEEDED', 'QUEUED')).toThrow();
  });
});

describe('Execution Planner & Handlers', () => {
  it('resolves trigger and branch routing', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 't', type: 'TRIGGER', name: 'Trigger', config: {} },
        { id: 'c', type: 'CONDITION', name: 'Cond', config: { expression: 'trigger.payload.orderValue > 1000' } },
        { id: 'true_node', type: 'END', name: 'High Value', config: {} },
        { id: 'false_node', type: 'END', name: 'Low Value', config: {} }
      ],
      edges: [
        { id: 'e1', source: 't', target: 'c' },
        { id: 'e_true', source: 'c', sourceHandle: 'true', target: 'true_node' },
        { id: 'e_false', source: 'c', sourceHandle: 'false', target: 'false_node' }
      ]
    };

    const triggerNode = getTriggerNode(def);
    expect(triggerNode?.id).toBe('t');

    // Execute condition node handler with high value
    const condNode = def.nodes[1];
    const condHandler = defaultRegistry.get('CONDITION');
    const result = await condHandler(condNode, { trigger: { payload: { orderValue: 2000 } } });

    expect(result.status).toBe('COMPLETED');
    expect(result.selectedHandle).toBe('true');

    const nextPlan = resolveNextNodes(def, condNode.id, result);
    expect(nextPlan.nextNodes.length).toBe(1);
    expect(nextPlan.nextNodes[0].id).toBe('true_node');
  });
});
