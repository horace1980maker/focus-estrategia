# Hardening Rollout Checklist

Date: 2026-04-05  
Owner: Engineering

## Stage 1: Schema + Read Path Validation

- [x] Apply hardening migrations in non-production.
- [x] Run Prisma client generation.
- [x] Validate read-only endpoints:
  - `/api/analytics/org`
  - `/api/analytics/cohort`
  - `/api/roi/settings`
  - `/api/audit/events`

Rollback:
- Restore DB backup and redeploy previous app build.

## Stage 2: Auth and Session Hardening

- [x] Enable credential login path for pilot users.
- [x] Provision facilitator + NGO admin users with usernames.
- [x] Validate lockout behavior and password rotation.
- [x] Validate facilitator organization context switching.

Rollback:
- Re-enable mock fallback (`AUTH_ALLOW_MOCK_FALLBACK=true`) and revoke pilot sessions.

## Stage 3: Mutation Audit Enforcement

- [x] Validate audit write events for:
  - phase review transitions
  - deliverable lifecycle operations
  - ROI benchmark updates
- [x] Validate denied-access audit events on forbidden operations.

Rollback:
- Temporarily disable mutation operations if audit persistence fails.

## Stage 4: Operational Readiness

- [x] Execute restore drill and record evidence.
- [x] Confirm triage runbook ownership.
- [x] Confirm alert/monitoring hooks for denied-event spikes.

Rollback:
- Hold production promotion until all checklist items pass.
