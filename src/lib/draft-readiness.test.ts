import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  computeDraftReadiness,
  GATE_4_THRESHOLD,
  type DraftReadinessInput,
} from "./draft-readiness";

function emptyInput(): DraftReadinessInput {
  return {
    objectiveResultsWithExpected: 0,
    linesOfActionWithInitiatives: 0,
    assumptionCount: 0,
    riskCount: 0,
    snapshotCount: 0,
    linesWithTimeline: 0,
  };
}

describe("computeDraftReadiness", () => {
  it("returns 0% when no draft content exists", () => {
    const result = computeDraftReadiness(emptyInput());
    assert.strictEqual(result.percentage, 0);
    assert.strictEqual(result.passesGate, false);
    assert.strictEqual(result.missingSections.length, 4);
    assert.strictEqual(result.strategicPlanDraftComplete, false);
    assert.strictEqual(result.implementationRoadmapComplete, false);
  });

  it("returns 25% when only objectives-results section is complete", () => {
    const input = { ...emptyInput(), objectiveResultsWithExpected: 2 };
    const result = computeDraftReadiness(input);
    assert.strictEqual(result.percentage, 25);
    assert.strictEqual(result.sections.objectivesResults, true);
    assert.strictEqual(result.sections.linesOfAction, false);
    assert.strictEqual(result.passesGate, false);
    assert.deepStrictEqual(result.missingSections, [
      "lines-of-action",
      "assumptions-risks",
      "narrative",
    ]);
  });

  it("returns 50% when two sections are complete", () => {
    const input = {
      ...emptyInput(),
      objectiveResultsWithExpected: 1,
      linesOfActionWithInitiatives: 1,
    };
    const result = computeDraftReadiness(input);
    assert.strictEqual(result.percentage, 50);
    assert.strictEqual(result.passesGate, false);
  });

  it("returns 75% and passes gate with 3 structured sections (no narrative)", () => {
    const input = {
      ...emptyInput(),
      objectiveResultsWithExpected: 1,
      linesOfActionWithInitiatives: 1,
      assumptionCount: 1,
      riskCount: 1,
    };
    const result = computeDraftReadiness(input);
    assert.strictEqual(result.percentage, 75);
    assert.strictEqual(result.passesGate, true);
    assert.deepStrictEqual(result.missingSections, ["narrative"]);
    assert.strictEqual(result.strategicPlanDraftComplete, true);
  });

  it("returns 100% when all 4 sections are complete", () => {
    const input: DraftReadinessInput = {
      objectiveResultsWithExpected: 3,
      linesOfActionWithInitiatives: 2,
      assumptionCount: 2,
      riskCount: 1,
      snapshotCount: 1,
      linesWithTimeline: 1,
    };
    const result = computeDraftReadiness(input);
    assert.strictEqual(result.percentage, 100);
    assert.strictEqual(result.passesGate, true);
    assert.strictEqual(result.missingSections.length, 0);
    assert.strictEqual(result.strategicPlanDraftComplete, true);
    assert.strictEqual(result.implementationRoadmapComplete, true);
  });

  it("assumptions-risks requires BOTH assumption and risk present", () => {
    const onlyAssumption = {
      ...emptyInput(),
      assumptionCount: 3,
      riskCount: 0,
    };
    assert.strictEqual(computeDraftReadiness(onlyAssumption).sections.assumptionsRisks, false);

    const onlyRisk = { ...emptyInput(), assumptionCount: 0, riskCount: 2 };
    assert.strictEqual(computeDraftReadiness(onlyRisk).sections.assumptionsRisks, false);

    const both = { ...emptyInput(), assumptionCount: 1, riskCount: 1 };
    assert.strictEqual(computeDraftReadiness(both).sections.assumptionsRisks, true);
  });

  it("marks implementation-roadmap complete when lines have timeline data", () => {
    const noTimeline = {
      ...emptyInput(),
      linesOfActionWithInitiatives: 1,
      linesWithTimeline: 0,
    };
    assert.strictEqual(computeDraftReadiness(noTimeline).implementationRoadmapComplete, false);

    const withTimeline = {
      ...emptyInput(),
      linesOfActionWithInitiatives: 1,
      linesWithTimeline: 1,
    };
    assert.strictEqual(computeDraftReadiness(withTimeline).implementationRoadmapComplete, true);
  });

  it("reverts when content is removed (sections become incomplete)", () => {
    const fullInput: DraftReadinessInput = {
      objectiveResultsWithExpected: 1,
      linesOfActionWithInitiatives: 1,
      assumptionCount: 1,
      riskCount: 1,
      snapshotCount: 1,
      linesWithTimeline: 1,
    };
    const full = computeDraftReadiness(fullInput);
    assert.strictEqual(full.percentage, 100);
    assert.strictEqual(full.strategicPlanDraftComplete, true);

    // Remove objectives
    const removed = computeDraftReadiness({
      ...fullInput,
      objectiveResultsWithExpected: 0,
    });
    assert.strictEqual(removed.percentage, 75);
    assert.strictEqual(removed.strategicPlanDraftComplete, false);
    assert.strictEqual(removed.sections.objectivesResults, false);
  });

  it("gate threshold constant is 75", () => {
    assert.strictEqual(GATE_4_THRESHOLD, 75);
  });
});
