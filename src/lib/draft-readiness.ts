// Draft readiness computation for Phase 4 gate enforcement.
// Pure function — no DB access; receives pre-fetched counts.

export type DraftReadinessInput = {
  /** Number of DraftObjectiveResult rows with non-empty expectedResults */
  objectiveResultsWithExpected: number;
  /** Number of DraftLineOfAction rows with non-empty initiativesJson */
  linesOfActionWithInitiatives: number;
  /** Number of DraftAssumptionRisk rows of type "assumption" */
  assumptionCount: number;
  /** Number of DraftAssumptionRisk rows of type "risk" */
  riskCount: number;
  /** Number of DraftSnapshot rows */
  snapshotCount: number;
  /** Number of DraftLineOfAction rows with non-null timelineStart AND timelineEnd */
  linesWithTimeline: number;
};

export type DraftSectionStatus = {
  objectivesResults: boolean;
  linesOfAction: boolean;
  assumptionsRisks: boolean;
  narrative: boolean;
};

export type DraftReadinessResult = {
  percentage: number;
  sections: DraftSectionStatus;
  missingSections: string[];
  gateThreshold: number;
  passesGate: boolean;
  /** strategic-plan-draft output should be marked complete */
  strategicPlanDraftComplete: boolean;
  /** implementation-roadmap output should be marked complete */
  implementationRoadmapComplete: boolean;
};

export const GATE_4_THRESHOLD = 75;

const SECTION_WEIGHT = 25;

export function computeDraftReadiness(
  input: DraftReadinessInput,
): DraftReadinessResult {
  const sections: DraftSectionStatus = {
    objectivesResults: input.objectiveResultsWithExpected >= 1,
    linesOfAction: input.linesOfActionWithInitiatives >= 1,
    assumptionsRisks: input.assumptionCount >= 1 && input.riskCount >= 1,
    narrative: input.snapshotCount >= 1,
  };

  const completedCount = [
    sections.objectivesResults,
    sections.linesOfAction,
    sections.assumptionsRisks,
    sections.narrative,
  ].filter(Boolean).length;

  const percentage = completedCount * SECTION_WEIGHT;

  const missingSections: string[] = [];
  if (!sections.objectivesResults) missingSections.push("objectives-results");
  if (!sections.linesOfAction) missingSections.push("lines-of-action");
  if (!sections.assumptionsRisks) missingSections.push("assumptions-risks");
  if (!sections.narrative) missingSections.push("narrative");

  // strategic-plan-draft is complete when the 3 structured sections are done
  const strategicPlanDraftComplete =
    sections.objectivesResults &&
    sections.linesOfAction &&
    sections.assumptionsRisks;

  // implementation-roadmap is complete when at least one line has timeline data
  const implementationRoadmapComplete = input.linesWithTimeline >= 1;

  return {
    percentage,
    sections,
    missingSections,
    gateThreshold: GATE_4_THRESHOLD,
    passesGate: percentage >= GATE_4_THRESHOLD,
    strategicPlanDraftComplete,
    implementationRoadmapComplete,
  };
}
