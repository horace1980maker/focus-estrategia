import assert from "node:assert/strict";
import test from "node:test";
import { ROLES } from "./auth.ts";
import {
  dedupeOrganizationContextOptions,
  getRoleSidebarPrimaryNavKey,
  getRoleSidebarSystemNavKeys,
} from "./role-navigation.ts";

test("sidebar primary nav key is role-aware", () => {
  assert.equal(getRoleSidebarPrimaryNavKey(ROLES.NGO_ADMIN), "dashboard");
  assert.equal(getRoleSidebarPrimaryNavKey(ROLES.FACILITATOR), "dashboard");
  assert.equal(getRoleSidebarPrimaryNavKey(ROLES.FOCUS_COORDINATOR), "cohort");
});

test("sidebar system nav keys hide role-irrelevant entries", () => {
  assert.deepEqual(
    getRoleSidebarSystemNavKeys({
      role: ROLES.NGO_ADMIN,
      deliverablesEnabled: true,
    }),
    ["deliverables", "examples"],
  );

  assert.deepEqual(
    getRoleSidebarSystemNavKeys({
      role: ROLES.FACILITATOR,
      deliverablesEnabled: true,
    }),
    ["deliverables", "pending_approvals", "examples"],
  );

  assert.deepEqual(
    getRoleSidebarSystemNavKeys({
      role: ROLES.FOCUS_COORDINATOR,
      deliverablesEnabled: true,
    }),
    ["cohort", "examples"],
  );
});

test("organization context options keep unique org IDs and disambiguate duplicate names", () => {
  const options = dedupeOrganizationContextOptions(
    [
      { id: "org-03", name: "Beta Org" },
      { id: "org-01", name: "Alpha Org" },
      { id: "org-02", name: "Alpha Org" },
      { id: "org-04", name: "alpha org" },
    ],
    "org-02",
  );

  assert.deepEqual(options, [
    { id: "org-01", name: "Alpha Org (org-01)" },
    { id: "org-02", name: "Alpha Org (org-02)" },
    { id: "org-04", name: "alpha org (org-04)" },
    { id: "org-03", name: "Beta Org" },
  ]);
});
