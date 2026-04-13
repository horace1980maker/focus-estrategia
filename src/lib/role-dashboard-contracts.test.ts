import assert from "node:assert/strict";
import test from "node:test";
import { ROLES } from "./auth.ts";
import {
  DASHBOARD_ANALYTICS_CONTRACTS,
  LANDING_WORKSPACE_ENTRY_ORDER,
  getRoleDashboardPath,
  getRoleViewContract,
  parseRequestedDashboardContract,
  validateRequestedDashboardContract,
} from "./role-dashboard-contracts.ts";

test("role dashboard defaults map to expected destinations", () => {
  assert.deepEqual(LANDING_WORKSPACE_ENTRY_ORDER, [
    "organizations",
    "facilitator",
    "officials",
  ]);
  assert.equal(getRoleDashboardPath(ROLES.NGO_ADMIN, "es"), "/es/dashboard");
  assert.equal(
    getRoleDashboardPath(ROLES.FACILITATOR, "en"),
    "/en/dashboard?queue=pending",
  );
  assert.equal(getRoleDashboardPath(ROLES.FOCUS_COORDINATOR, "es"), "/es/cohort");
});

test("role dashboard contract exposes expected analytics scope", () => {
  assert.equal(
    getRoleViewContract(ROLES.NGO_ADMIN).analyticsContract,
    DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION,
  );
  assert.equal(
    getRoleViewContract(ROLES.FACILITATOR).analyticsContract,
    DASHBOARD_ANALYTICS_CONTRACTS.FACILITATOR_REVIEW,
  );
  assert.equal(
    getRoleViewContract(ROLES.FOCUS_COORDINATOR).analyticsContract,
    DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
  );
});

test("requested contract parsing accepts known contracts only", () => {
  assert.equal(
    parseRequestedDashboardContract(DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION),
    DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION,
  );
  assert.equal(parseRequestedDashboardContract("bad-contract"), null);
  assert.equal(parseRequestedDashboardContract(null), null);
});

test("contract validation rejects role mismatch", () => {
  const denied = validateRequestedDashboardContract({
    role: ROLES.NGO_ADMIN,
    requestedContract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(
      denied.expectedContract,
      DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION,
    );
  }
});
