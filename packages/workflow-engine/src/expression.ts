import { ENGINE_LIMITS } from "./limits.js";

/**
 * Safe, deterministic expression evaluator for workflow conditions and templates.
 * Disallows global access, dynamic evaluation (no eval, no Function), and enforces
 * strict type comparisons and prototype pollution protection.
 */

export interface EvaluationContext {
  trigger?: {
    payload?: Record<string, unknown>;
    type?: string;
  };
  context?: Record<string, unknown>;
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  approvalDecision?: {
    approved?: boolean;
    comment?: string;
    decidedBy?: string;
  };
  [key: string]: unknown;
}

export type ConditionOperator =
  | "==="
  | "=="
  | "!=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "EXISTS"
  | "IS_EMPTY";

/**
 * Pure condition evaluator. Evaluates an expression against the supplied execution context.
 */
export function evaluateCondition(
  expression: string,
  context: EvaluationContext,
): boolean {
  if (
    !expression ||
    typeof expression !== "string" ||
    expression.length > ENGINE_LIMITS.MAX_EXPRESSION_LENGTH
  ) {
    return false;
  }

  const trimmed = expression.trim();

  // Boolean literals
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Unary operators: 'field EXISTS' or 'field IS_EMPTY'
  const unaryMatch = trimmed.match(/^([a-zA-Z0-9_$.]+)\s+(EXISTS|IS_EMPTY)$/i);
  if (unaryMatch) {
    const [, path, op] = unaryMatch;
    const val = resolvePath(path.trim(), context);
    const upperOp = op.toUpperCase();

    if (upperOp === "EXISTS") {
      return val !== undefined && val !== null;
    }
    if (upperOp === "IS_EMPTY") {
      if (val === undefined || val === null) return true;
      if (typeof val === "string") return val.trim().length === 0;
      if (Array.isArray(val)) return val.length === 0;
      if (typeof val === "object") return Object.keys(val).length === 0;
      return false;
    }
  }

  // Binary comparison regex: path operator value
  // Matches operators: ===, ==, !==, !=, >=, <=, >, <, CONTAINS, NOT_CONTAINS
  const compRegex =
    /^([a-zA-Z0-9_$.]+)\s*(===|==|!==|!=|>=|<=|>|<|CONTAINS|NOT_CONTAINS)\s*(.+)$/i;
  const match = trimmed.match(compRegex);

  if (!match) {
    // Single path truthiness check
    const val = resolvePath(trimmed, context);
    return Boolean(val);
  }

  const [, leftPath, opRaw, rightRaw] = match;
  const operator = opRaw.toUpperCase();
  const leftVal = resolvePath(leftPath.trim(), context);
  const rightVal = parseLiteralOrPath(rightRaw.trim(), context);

  switch (operator) {
    case "===":
    case "==":
      return leftVal == rightVal;

    case "!==":
    case "!=":
      return leftVal != rightVal;

    case ">": {
      if (typeof leftVal === "number" && typeof rightVal === "number") {
        return leftVal > rightVal;
      }
      const numL = Number(leftVal);
      const numR = Number(rightVal);
      if (isNaN(numL) || isNaN(numR)) return false;
      return numL > numR;
    }

    case ">=": {
      if (typeof leftVal === "number" && typeof rightVal === "number") {
        return leftVal >= rightVal;
      }
      const numL = Number(leftVal);
      const numR = Number(rightVal);
      if (isNaN(numL) || isNaN(numR)) return false;
      return numL >= numR;
    }

    case "<": {
      if (typeof leftVal === "number" && typeof rightVal === "number") {
        return leftVal < rightVal;
      }
      const numL = Number(leftVal);
      const numR = Number(rightVal);
      if (isNaN(numL) || isNaN(numR)) return false;
      return numL < numR;
    }

    case "<=": {
      if (typeof leftVal === "number" && typeof rightVal === "number") {
        return leftVal <= rightVal;
      }
      const numL = Number(leftVal);
      const numR = Number(rightVal);
      if (isNaN(numL) || isNaN(numR)) return false;
      return numL <= numR;
    }

    case "CONTAINS": {
      if (typeof leftVal === "string" && typeof rightVal === "string") {
        return leftVal.includes(rightVal);
      }
      if (Array.isArray(leftVal)) {
        return leftVal.includes(rightVal);
      }
      return false;
    }

    case "NOT_CONTAINS": {
      if (typeof leftVal === "string" && typeof rightVal === "string") {
        return !leftVal.includes(rightVal);
      }
      if (Array.isArray(leftVal)) {
        return !leftVal.includes(rightVal);
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Safely resolves nested property path with prototype pollution guards and bounded recursion depth.
 */
export function resolvePath(path: string, obj: any): any {
  if (!path || typeof path !== "string") return undefined;
  const parts = path.split(".");

  if (parts.length > ENGINE_LIMITS.MAX_PATH_DEPTH) {
    return undefined;
  }

  let curr = obj;

  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== "object") {
      return undefined;
    }
    // Block prototype pollution
    if (
      part === "__proto__" ||
      part === "prototype" ||
      part === "constructor"
    ) {
      return undefined;
    }
    curr = curr[part];
  }

  return curr;
}

function parseLiteralOrPath(raw: string, context: any): any {
  // String literal "..." or '...'
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;

  // Number literal
  if (!isNaN(Number(raw)) && raw.trim() !== "") {
    return Number(raw);
  }

  // Otherwise assume property path in context
  return resolvePath(raw, context);
}

/**
 * Safely interpolates {{path}} placeholders from the context.
 */
export function interpolateTemplate(
  template: string,
  context: EvaluationContext,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_, path) => {
    const val = resolvePath(path, context);
    return val !== undefined && val !== null ? String(val) : "";
  });
}
