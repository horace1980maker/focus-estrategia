import { prisma } from "./prisma";
import {
  evaluateValidationReadiness,
  type ValidationState,
  type ValidationReadiness,
} from "./validation-readiness";
import { setPhaseOutputCompletion } from "./phase-outputs";

/**
 * Fetches current validation entity counts for an organization
 * and returns them in the shape expected by evaluateValidationReadiness.
 */
export async function fetchValidationReadinessInput(
  organizationId: string,
): Promise<ValidationState> {
  const [
    feedbackResponseCount,
    signatureCount,
  ] = await Promise.all([
    prisma.validationFeedbackResponse.count({
      where: { organizationId },
    }),
    prisma.validationSignoff.count({
      where: { organizationId },
    }),
  ]);

  return {
    hasFeedbackResponse: feedbackResponseCount > 0,
    signatureCount,
  };
}

/**
 * Fetches validation readiness and synchronises PhaseOutputCompletion records.
 * Returns the readiness result for display purposes.
 */
export async function syncValidationOutputCompletion(
  organizationId: string,
): Promise<ValidationReadiness> {
  const input = await fetchValidationReadinessInput(organizationId);
  const readiness = evaluateValidationReadiness(input);

  // Find the Phase 5 record for this organization
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: { where: { phaseNumber: 5 } } },
  });

  const phase5 = tracker?.phases[0];
  if (!phase5) {
    return readiness;
  }

  // Sync facilitator-review-response output
  await setPhaseOutputCompletion({
    phaseId: phase5.id,
    phaseNumber: 5,
    outputKey: "facilitator-review-response",
    isCompleted: readiness.isFeedbackComplete,
  });

  // Sync validated-plan output
  await setPhaseOutputCompletion({
    phaseId: phase5.id,
    phaseNumber: 5,
    outputKey: "validated-plan",
    isCompleted: readiness.isValidatedPlanComplete,
  });

  return readiness;
}
