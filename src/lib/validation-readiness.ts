export interface ValidationState {
  hasFeedbackResponse: boolean;
  signatureCount: number;
}

export interface ValidationReadiness {
  isFeedbackComplete: boolean;
  isValidatedPlanComplete: boolean;
  progressPercentage: number;
}

// For MVP, we require 1 formal signature to unlock "Validated Plan"
const MIN_SIGNATURES_REQUIRED = 1;

export function evaluateValidationReadiness(state: ValidationState): ValidationReadiness {
  const isFeedbackComplete = state.hasFeedbackResponse;
  const isValidatedPlanComplete = state.signatureCount >= MIN_SIGNATURES_REQUIRED;

  let completeCount = 0;
  if (isFeedbackComplete) completeCount++;
  if (isValidatedPlanComplete) completeCount++;

  return {
    isFeedbackComplete,
    isValidatedPlanComplete,
    progressPercentage: Math.round((completeCount / 2) * 100),
  };
}
