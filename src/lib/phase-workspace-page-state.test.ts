import assert from "node:assert/strict";
import test from "node:test";
import { resolvePhaseWorkspacePageState } from "./phase-workspace-page-state.ts";

test("phase workspace page state resolves access branches", () => {
  assert.equal(
    resolvePhaseWorkspacePageState({
      hasOrganizationId: false,
      hasPhaseStatus: false,
      hasPhase: false,
      accessAllowed: false,
    }),
    "missing_org",
  );

  assert.equal(
    resolvePhaseWorkspacePageState({
      hasOrganizationId: true,
      hasPhaseStatus: false,
      hasPhase: false,
      accessAllowed: false,
    }),
    "missing_tracker",
  );

  assert.equal(
    resolvePhaseWorkspacePageState({
      hasOrganizationId: true,
      hasPhaseStatus: true,
      hasPhase: false,
      accessAllowed: false,
    }),
    "missing_phase",
  );

  assert.equal(
    resolvePhaseWorkspacePageState({
      hasOrganizationId: true,
      hasPhaseStatus: true,
      hasPhase: true,
      accessAllowed: false,
    }),
    "blocked",
  );

  assert.equal(
    resolvePhaseWorkspacePageState({
      hasOrganizationId: true,
      hasPhaseStatus: true,
      hasPhase: true,
      accessAllowed: true,
    }),
    "ready",
  );
});
