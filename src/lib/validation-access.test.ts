import assert from "node:assert/strict";
import test from "node:test";
import { ROLES } from "./auth.ts";
import { canEditValidation, evaluateValidationMutationAccess } from "./validation-access.ts";

test("evaluateValidationMutationAccess allows ngo admins in their org when unlocked", () => {
  const result = evaluateValidationMutationAccess({
    role: ROLES.NGO_ADMIN,
    sessionOrganizationId: "org-1",
    targetOrganizationId: "org-1",
    isLocked: false,
  });

  assert.deepEqual(result, { allowed: true });
});

test("evaluateValidationMutationAccess denies facilitator edits", () => {
  const result = evaluateValidationMutationAccess({
    role: ROLES.FACILITATOR,
    sessionOrganizationId: "org-1",
    targetOrganizationId: "org-1",
    isLocked: false,
  });

  assert.deepEqual(result, { allowed: false, reason: "permission_denied" });
});

test("evaluateValidationMutationAccess denies focus coordinator edits", () => {
  const result = evaluateValidationMutationAccess({
    role: ROLES.FOCUS_COORDINATOR,
    sessionOrganizationId: "org-1",
    targetOrganizationId: "org-1",
    isLocked: false,
  });

  assert.deepEqual(result, { allowed: false, reason: "permission_denied" });
});

test("evaluateValidationMutationAccess denies cross-organization writes", () => {
  const result = evaluateValidationMutationAccess({
    role: ROLES.NGO_ADMIN,
    sessionOrganizationId: "org-1",
    targetOrganizationId: "org-2",
    isLocked: false,
  });

  assert.deepEqual(result, { allowed: false, reason: "organization_scope_denied" });
});

test("evaluateValidationMutationAccess denies writes when validation is locked", () => {
  const result = evaluateValidationMutationAccess({
    role: ROLES.NGO_ADMIN,
    sessionOrganizationId: "org-1",
    targetOrganizationId: "org-1",
    isLocked: true,
  });

  assert.deepEqual(result, { allowed: false, reason: "validation_locked" });
});

test("canEditValidation keeps validation read-only for non-ngo roles", () => {
  assert.equal(canEditValidation(ROLES.NGO_ADMIN), true);
  assert.equal(canEditValidation(ROLES.FACILITATOR), false);
  assert.equal(canEditValidation(ROLES.FOCUS_COORDINATOR), false);
});
