# Role View Contract Matrix

This matrix defines the canonical role-to-view contract used by landing, dashboards, workspace entry routes, and analytics contracts.

| Role | Landing intent | Default destination | Dashboard surface | Analytics contract | Mutations |
|---|---|---|---|---|---|
| `ngo_admin` | `Espacio Organizaciones` | `/{lang}/dashboard` | NGO execution | `ngo_execution` | Allowed for own organization outputs and deliverables |
| `facilitator` | `Espacio Facilitador` | `/{lang}/dashboard?queue=pending` | Facilitator review | `facilitator_review` | Review-only (approve/reject), no NGO ownership mutations |
| `focus_coordinator` | `Espacio Oficiales` | `/{lang}/cohort` | Official oversight | `official_oversight` | Read-only observation and filters only |

## Navigation rules

- Sidebar primary entry is role-aware:
  - NGO and facilitator roles use `dashboard`
  - official role uses `cohort`
- Cohort link appears only for official role.
- Pending approvals link appears only for facilitator role.

## Login and redirect rules

- Protected route redirects carry `next` intent to login.
- Post-login redirect resolves to:
  - safe `next` path if locale-scoped and allowed
  - otherwise role default destination from this matrix.

## API contract rules

- `/api/analytics/org` enforces role-scoped contract projection.
- `/api/analytics/cohort` only returns `official_oversight`.
- Contract mismatch returns `403` and emits denied-access audit event.
