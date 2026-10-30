import { ExecutionStatus } from "@flowforge/shared";

export const VALID_TRANSITIONS: Record<
  ExecutionStatus,
  readonly ExecutionStatus[]
> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: [
    "WAITING_APPROVAL",
    "WAITING_DELAY",
    "RETRYING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ],
  WAITING_APPROVAL: ["QUEUED", "RUNNING", "FAILED", "CANCELLED"],
  WAITING_DELAY: ["QUEUED", "RUNNING", "CANCELLED"],
  RETRYING: ["RUNNING", "FAILED", "CANCELLED"],
  SUCCEEDED: [], // Terminal
  FAILED: [], // Terminal
  CANCELLED: [], // Terminal
};

export function canTransition(
  current: ExecutionStatus,
  next: ExecutionStatus,
): boolean {
  if (current === next) return true;
  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function assertTransition(
  current: ExecutionStatus,
  next: ExecutionStatus,
): void {
  if (!canTransition(current, next)) {
    throw new Error(
      `Invalid execution state transition from '${current}' to '${next}'.`,
    );
  }
}

export function isTerminalState(status: ExecutionStatus): boolean {
  return (
    status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED"
  );
}
