/**
 * Safe expression evaluator for workflow conditions and templates.
 * Disallows global access (process, require, Function, window, eval).
 */

export interface EvaluationContext {
  trigger?: {
    payload?: Record<string, unknown>;
    type?: string;
  };
  context?: Record<string, unknown>;
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  [key: string]: unknown;
}

export function evaluateCondition(
  expression: string,
  context: EvaluationContext,
): boolean {
  if (!expression || typeof expression !== "string") {
    return false;
  }

  const trimmed = expression.trim();

  // Basic boolean literals
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Comparison operator regex: operand1 (==, ===, !=, !==, >, <, >=, <=) operand2
  const compRegex = /^([a-zA-Z0-9_$.]+)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/;
  const match = trimmed.match(compRegex);

  if (!match) {
    // Single path truthiness check
    const val = resolvePath(trimmed, context);
    return Boolean(val);
  }

  const [, leftPath, operator, rightRaw] = match;
  const leftVal = resolvePath(leftPath.trim(), context);
  const rightVal = parseLiteralOrPath(rightRaw.trim(), context);

  switch (operator) {
    case "===":
    case "==":
      return leftVal == rightVal;
    case "!==":
    case "!=":
      return leftVal != rightVal;
    case ">":
      return Number(leftVal) > Number(rightVal);
    case ">=":
      return Number(leftVal) >= Number(rightVal);
    case "<":
      return Number(leftVal) < Number(rightVal);
    case "<=":
      return Number(leftVal) <= Number(rightVal);
    default:
      return false;
  }
}

export function resolvePath(path: string, obj: any): any {
  if (!path) return undefined;
  const parts = path.split(".");
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

  // Number literal
  if (!isNaN(Number(raw))) {
    return Number(raw);
  }

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;

  // Otherwise assume path in context
  return resolvePath(raw, context);
}

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
