import { TOTAL_PHASES } from "./phase-model";

export const PHASE_STATUS = {
  LOCKED: "locked",
  IN_PROGRESS: "in_progress",
  REVIEW_REQUESTED: "review_requested",
  APPROVED: "approved",
} as const;

export type PhaseStatus = (typeof PHASE_STATUS)[keyof typeof PHASE_STATUS];

export function canRequestReview(status: string): status is typeof PHASE_STATUS.IN_PROGRESS {
  return status === PHASE_STATUS.IN_PROGRESS;
}

export function canApprove(status: string): status is typeof PHASE_STATUS.REVIEW_REQUESTED {
  return status === PHASE_STATUS.REVIEW_REQUESTED;
}

export function canReject(status: string): status is typeof PHASE_STATUS.REVIEW_REQUESTED {
  return status === PHASE_STATUS.REVIEW_REQUESTED;
}

export function getNextPhaseNumber(phaseNumber: number): number | null {
  const next = phaseNumber + 1;
  return next <= TOTAL_PHASES ? next : null;
}

export function isTerminalPhase(phaseNumber: number): boolean {
  return phaseNumber >= TOTAL_PHASES;
}
