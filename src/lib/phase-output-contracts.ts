import { type PhaseKey, phaseNumberToKey } from "./phase-model";

export type PhaseOutputContract = {
  key: string;
  label: string;
};

const CONTRACTS_BY_PHASE: Record<PhaseKey, PhaseOutputContract[]> = {
  onboarding: [
    { key: "memorandum-of-understanding", label: "Memorandum de Entendimiento" },
    { key: "organization-documentation", label: "Organization Documentation" },
  ],
  diagnosis: [
    { key: "diagnosis-survey", label: "Diagnosis Survey" },
  ],
  framework: [
    { key: "facilitation-session-1", label: "Facilitation, Session 1" },
    { key: "materials", label: "Materials, Session 1" },
    { key: "facilitation-session-2", label: "Facilitation, Session 2" },
    { key: "materials-session-2", label: "Materials, Session 2" },
    { key: "facilitation-session-3", label: "Facilitation, Session 3" },
    { key: "materials-session-3", label: "Materials, Session 3" },
    { key: "facilitation-session-4", label: "Facilitation, Session 4" },
    { key: "materials-session-4", label: "Materials, Session 4" },
  ],
  draft: [
    { key: "strategic-plan-draft", label: "Strategic Plan Draft" },
    { key: "implementation-roadmap", label: "Implementation Roadmap" },
  ],
  validation: [
    { key: "facilitator-review-response", label: "Facilitator Review Response" },
    { key: "validated-plan", label: "Validated Plan" },
  ],
  deliverables: [
    { key: "delivery-package", label: "Delivery Package" },
    { key: "final-export", label: "Final Export" },
  ],
};

export function getOutputContractsForPhaseNumber(phaseNumber: number): PhaseOutputContract[] {
  const phaseKey = phaseNumberToKey(phaseNumber);
  if (!phaseKey) {
    return [];
  }
  return CONTRACTS_BY_PHASE[phaseKey];
}
