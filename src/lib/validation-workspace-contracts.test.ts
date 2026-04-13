import assert from "node:assert/strict";
import test from "node:test";
import { getPhaseWorkspacePanels } from "./phase-workspace-routing.ts";
import { evaluateValidationReadiness } from "./validation-readiness.ts";

test("phase workspace routing enables validation panel only for phase 5", () => {
  assert.equal(getPhaseWorkspacePanels(4).showValidationPanel, false);
  assert.equal(getPhaseWorkspacePanels(5).showValidationPanel, true);
  assert.equal(getPhaseWorkspacePanels(6).showValidationPanel, false);
});

test("validation readiness progress maps to 0/50/100 contract states", () => {
  assert.equal(
    evaluateValidationReadiness({
      hasFeedbackResponse: false,
      signatureCount: 0,
    }).progressPercentage,
    0,
  );

  assert.equal(
    evaluateValidationReadiness({
      hasFeedbackResponse: true,
      signatureCount: 0,
    }).progressPercentage,
    50,
  );

  assert.equal(
    evaluateValidationReadiness({
      hasFeedbackResponse: true,
      signatureCount: 1,
    }).progressPercentage,
    100,
  );
});
