# Role Dashboard QA Checklist

## Scope

Validate role-aligned behavior for:
- landing role entry buttons
- dashboard composition by role
- phase workspace controls and restrictions
- analytics contract enforcement

## Environment

- Seed deterministic fixtures from `organizaciones.csv`
- Ensure provisioned users exist for:
  - one `ngo_admin` account
  - one `facilitator` account
  - one `focus_coordinator` account

## Acceptance checks

- [ ] Landing shows exactly three stacked entries in order:
  - `Espacio Organizaciones`
  - `Espacio Facilitador`
  - `Espacio Oficiales`
- [ ] Unauthenticated landing entry sends user to login with `next` preserved.
- [ ] Post-login redirects to role-default surface when `next` is missing or invalid.

- [ ] NGO dashboard only shows organization execution widgets and no cohort controls.
- [ ] Facilitator dashboard highlights pending approvals queue and deep links to phase review.
- [ ] Official role redirects to cohort dashboard and cannot access mutation actions.

- [ ] NGO cannot access cohort analytics endpoint (`403` expected).
- [ ] Facilitator cannot access cohort analytics endpoint (`403` expected).
- [ ] Official can access cohort analytics endpoint (`200` expected).
- [ ] Contract mismatch on analytics route returns `403`.

- [ ] NGO phase workspace shows output completion + review request controls.
- [ ] Facilitator phase workspace shows approve/reject controls when review requested.
- [ ] Official phase workspace is read-only with role-restricted hint.

## Screenshot set

- [ ] Landing page role-entry buttons
- [ ] NGO dashboard
- [ ] Facilitator dashboard with pending approvals highlighted
- [ ] Official cohort dashboard
- [ ] Phase workspace for each role on same organization and phase
