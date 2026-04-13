export const PHASE_KEYS = [
  "onboarding",
  "diagnosis",
  "framework",
  "draft",
  "validation",
  "deliverables",
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export const TOTAL_PHASES = PHASE_KEYS.length;

const PHASE_NUMBER_TO_KEY = new Map<number, PhaseKey>(
  PHASE_KEYS.map((phaseKey, index) => [index + 1, phaseKey]),
);

const PHASE_KEY_TO_NUMBER = new Map<PhaseKey, number>(
  PHASE_KEYS.map((phaseKey, index) => [phaseKey, index + 1]),
);

export function phaseNumberToKey(phaseNumber: number): PhaseKey | null {
  return PHASE_NUMBER_TO_KEY.get(phaseNumber) ?? null;
}

export function phaseKeyToNumber(phaseKey: PhaseKey): number {
  return PHASE_KEY_TO_NUMBER.get(phaseKey) ?? 1;
}

export function normalizePhaseNumber(phaseNumber: number): number {
  if (!Number.isFinite(phaseNumber)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(phaseNumber), 1), TOTAL_PHASES);
}
