import { prisma } from "./prisma";
import {
  computeDraftReadiness,
  type DraftReadinessInput,
  type DraftReadinessResult,
} from "./draft-readiness";
import { setPhaseOutputCompletion } from "./phase-outputs";

/**
 * Fetches current draft entity counts for an organization
 * and returns them in the shape expected by computeDraftReadiness.
 */
export async function fetchDraftReadinessInput(
  organizationId: string,
): Promise<DraftReadinessInput> {
  const [
    objectiveResultsWithExpected,
    linesOfActionWithInitiatives,
    assumptionCount,
    riskCount,
    snapshotCount,
    linesWithTimeline,
  ] = await Promise.all([
    prisma.draftObjectiveResult.count({
      where: {
        organizationId,
        expectedResults: { not: null },
        NOT: { expectedResults: "" },
      },
    }),
    prisma.draftLineOfAction.count({
      where: {
        organizationId,
        initiativesJson: { not: null },
        NOT: { initiativesJson: "" },
      },
    }),
    prisma.draftAssumptionRisk.count({
      where: { organizationId, type: "assumption" },
    }),
    prisma.draftAssumptionRisk.count({
      where: { organizationId, type: "risk" },
    }),
    prisma.draftSnapshot.count({
      where: { organizationId },
    }),
    prisma.draftLineOfAction.count({
      where: {
        organizationId,
        timelineStart: { not: null },
        timelineEnd: { not: null },
      },
    }),
  ]);

  return {
    objectiveResultsWithExpected,
    linesOfActionWithInitiatives,
    assumptionCount,
    riskCount,
    snapshotCount,
    linesWithTimeline,
  };
}

/**
 * Fetches draft readiness and synchronises PhaseOutputCompletion records.
 * Returns the readiness result for display purposes.
 */
export async function syncDraftOutputCompletion(
  organizationId: string,
): Promise<DraftReadinessResult> {
  const input = await fetchDraftReadinessInput(organizationId);
  const readiness = computeDraftReadiness(input);

  // Find the Phase 4 record for this organization
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: { where: { phaseNumber: 4 } } },
  });

  const phase4 = tracker?.phases[0];
  if (!phase4) {
    return readiness;
  }

  // Sync strategic-plan-draft output
  await setPhaseOutputCompletion({
    phaseId: phase4.id,
    phaseNumber: 4,
    outputKey: "strategic-plan-draft",
    isCompleted: readiness.strategicPlanDraftComplete,
  });

  // Sync implementation-roadmap output
  await setPhaseOutputCompletion({
    phaseId: phase4.id,
    phaseNumber: 4,
    outputKey: "implementation-roadmap",
    isCompleted: readiness.implementationRoadmapComplete,
  });

  return readiness;
}
