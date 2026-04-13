import assert from "node:assert/strict";
import test from "node:test";
import { ROLES } from "./auth.ts";
import {
  buildLoginRedirectPath,
  buildPathWithQuery,
  resolvePostLoginRedirectPath,
} from "./auth-routing.ts";
import { getWorkspaceIntentPath } from "./role-dashboard-contracts.ts";

test("buildPathWithQuery keeps scalar and array query values", () => {
  const path = buildPathWithQuery("/es/examples", {
    phase: "2",
    org: ["org-a", "org-b"],
    empty: "",
  });
  assert.equal(path, "/es/examples?phase=2&org=org-a&org=org-b");
});

test("buildLoginRedirectPath encodes next path", () => {
  const path = buildLoginRedirectPath({
    locale: "es",
    nextPath: "/es/dashboard?queue=pending",
  });
  assert.equal(path, "/es/login?next=%2Fes%2Fdashboard%3Fqueue%3Dpending");
});

test("resolvePostLoginRedirectPath uses safe next and falls back to role defaults", () => {
  const safeNext = resolvePostLoginRedirectPath({
    locale: "es",
    role: ROLES.FACILITATOR,
    requestedNext: "/es/phases/3?org=org-1",
  });
  assert.equal(safeNext, "/es/phases/3?org=org-1");

  const fallbackForInvalidNext = resolvePostLoginRedirectPath({
    locale: "es",
    role: ROLES.FACILITATOR,
    requestedNext: "/en/dashboard",
  });
  assert.equal(fallbackForInvalidNext, "/es/dashboard?queue=pending");
});

test("landing workspace intent survives login redirect roundtrip for each role", () => {
  const scenarios: Array<{
    role: (typeof ROLES)[keyof typeof ROLES];
    workspacePath: string;
  }> = [
    { role: ROLES.NGO_ADMIN, workspacePath: getWorkspaceIntentPath("organizations", "es") },
    { role: ROLES.FACILITATOR, workspacePath: getWorkspaceIntentPath("facilitator", "es") },
    { role: ROLES.FOCUS_COORDINATOR, workspacePath: getWorkspaceIntentPath("officials", "es") },
  ];

  for (const scenario of scenarios) {
    const loginPath = buildLoginRedirectPath({
      locale: "es",
      nextPath: scenario.workspacePath,
    });
    const loginUrl = new URL(`https://example.test${loginPath}`);
    const requestedNext = loginUrl.searchParams.get("next");

    const resolved = resolvePostLoginRedirectPath({
      locale: "es",
      role: scenario.role,
      requestedNext,
    });

    assert.equal(resolved, scenario.workspacePath);
  }
});
