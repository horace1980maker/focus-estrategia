import assert from "node:assert/strict";
import test from "node:test";
import {
  getPhaseGateMessage,
  getPhaseStatusLabel,
  getWorkspaceStateHint,
} from "./phase-workspace-copy.ts";

test("phase status labels are localized and fallback on unknown values", () => {
  assert.equal(getPhaseStatusLabel("en", "review_requested"), "Review Requested");
  assert.equal(getPhaseStatusLabel("es", "review_requested"), "Revision solicitada");
  assert.equal(getPhaseStatusLabel("en", "custom_state"), "custom_state");
});

test("phase gate messages switch between warning and ready states", () => {
  assert.equal(
    getPhaseGateMessage("en", 2),
    "This phase cannot request review yet. 2 required outputs are still missing.",
  );
  assert.equal(
    getPhaseGateMessage("es", 2),
    "La fase no puede solicitar revision todavia. Faltan 2 salidas requeridas.",
  );
  assert.equal(
    getPhaseGateMessage("en", 0),
    "Required outputs are complete and this phase can move to review.",
  );
});

test("workspace state hints are standardized per state", () => {
  assert.equal(
    getWorkspaceStateHint("en", "blocked"),
    "This action is blocked by phase progression rules.",
  );
  assert.equal(
    getWorkspaceStateHint("en", "pending_review"),
    "Review has been requested. Waiting for facilitator decision.",
  );
  assert.equal(
    getWorkspaceStateHint("es", "approved"),
    "Esta fase esta aprobada. Las salidas quedan en modo solo lectura.",
  );
  assert.equal(
    getWorkspaceStateHint("es", "role_restricted"),
    "Tu rol puede ver esta seccion, pero no ejecutar esta accion.",
  );
});
