import assert from "node:assert/strict";
import test from "node:test";
import {
  getPhaseWorkspacePanels,
  isOversightRole,
  parsePhaseNumber,
  resolveRolePhaseAccess,
} from "./phase-workspace-routing.ts";

test("parsePhaseNumber accepts numeric values and rejects invalid input", () => {
  assert.equal(parsePhaseNumber("1"), 1);
  assert.equal(parsePhaseNumber("06"), 6);
  assert.equal(parsePhaseNumber("abc"), null);
});

test("workspace panel mapping is phase-specific", () => {
  assert.deepEqual(getPhaseWorkspacePanels(1), {
    showCoachPanel: true,
    showExampleLibraryPanel: false,
    showOnboardingPanel: false,
    showDiagnosisPanel: false,
    showDraftBuilderPanel: false,
    showValidationPanel: false,
    showDeliverablesPanel: false,
  });
  assert.deepEqual(getPhaseWorkspacePanels(2), {
    showCoachPanel: true,
    showExampleLibraryPanel: true,
    showOnboardingPanel: false,
    showDiagnosisPanel: true,
    showDraftBuilderPanel: false,
    showValidationPanel: false,
    showDeliverablesPanel: false,
  });
  assert.deepEqual(getPhaseWorkspacePanels(4), {
    showCoachPanel: true,
    showExampleLibraryPanel: true,
    showOnboardingPanel: false,
    showDiagnosisPanel: false,
    showDraftBuilderPanel: true,
    showValidationPanel: false,
    showDeliverablesPanel: false,
  });
  assert.deepEqual(getPhaseWorkspacePanels(5), {
    showCoachPanel: true,
    showExampleLibraryPanel: true,
    showOnboardingPanel: false,
    showDiagnosisPanel: false,
    showDraftBuilderPanel: false,
    showValidationPanel: true,
    showDeliverablesPanel: false,
  });
  assert.deepEqual(getPhaseWorkspacePanels(6), {
    showCoachPanel: true,
    showExampleLibraryPanel: true,
    showOnboardingPanel: false,
    showDiagnosisPanel: false,
    showDraftBuilderPanel: false,
    showValidationPanel: false,
    showDeliverablesPanel: true,
  });
});

test("oversight roles are recognized for cross-phase access", () => {
  assert.equal(isOversightRole("facilitator"), true);
  assert.equal(isOversightRole("focus_coordinator"), true);
  assert.equal(isOversightRole("ngo_admin"), false);
});

test("role access resolver preserves execution locks and bypasses for oversight roles", () => {
  const blockedExecution = resolveRolePhaseAccess({
    role: "ngo_admin",
    orgAccess: {
      allowed: false,
      currentPhase: 2,
      reason: "Phase 3 is locked. Current phase: 2",
    },
  });
  assert.equal(blockedExecution.allowed, false);
  assert.equal(blockedExecution.mode, "execution");

  const facilitatorOversight = resolveRolePhaseAccess({
    role: "facilitator",
    orgAccess: {
      allowed: false,
      currentPhase: 2,
      reason: "Phase 3 is locked. Current phase: 2",
    },
  });
  assert.equal(facilitatorOversight.allowed, true);
  assert.equal(facilitatorOversight.mode, "oversight");
  assert.equal(facilitatorOversight.currentPhase, 2);

  const coordinatorOversight = resolveRolePhaseAccess({
    role: "focus_coordinator",
    orgAccess: {
      allowed: false,
      currentPhase: 4,
      reason: "Phase 6 is locked. Current phase: 4",
    },
  });
  assert.equal(coordinatorOversight.allowed, true);
  assert.equal(coordinatorOversight.mode, "oversight");
  assert.equal(coordinatorOversight.currentPhase, 4);
});
