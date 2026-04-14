import { type PhaseKey, phaseNumberToKey } from "./phase-model";

export type PhaseOutputContract = {
  key: string;
  label: string;
};

const CONTRACTS_BY_PHASE: Record<PhaseKey, PhaseOutputContract[]> = {
  onboarding: [
    { key: "organization-profile", label: "Organization Profile" },
    { key: "memorandum-of-understanding", label: "Memorandum de Entendimiento" },
  ],
  diagnosis: [
    { key: "diagnosis-survey", label: "Diagnosis Survey" },
    { key: "diagnosis-synthesis", label: "Diagnosis Synthesis" },
  ],
  framework: [
    { key: "theory-of-change", label: "Theory of Change" },
    { key: "strategic-objectives", label: "Strategic Objectives" },
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
