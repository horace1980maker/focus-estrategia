# Platform Hardening Migration Safety Notes

Date: 2026-04-05  
Owner: Engineering

## Scope

This note covers hardening migrations:
- `20260405183545_platform_hardening_auth_audit_roi`
- `20260405190521_platform_hardening_org_country`

## Pre-migration checks

1. Confirm DB backup exists and can be restored.
2. Confirm application is not running a concurrent schema migration.
3. Confirm enough disk space for SQLite backup copy and WAL files.
4. Confirm rollback operator is available.

## Migration commands

```bash
npx prisma migrate dev --name platform_hardening_auth_audit_roi
npx prisma migrate dev --name platform_hardening_org_country
npx prisma generate
```

## Verification checklist

1. `User` table includes credential and lockout fields.
2. `AuthSession` and `AuditEvent` tables exist and are writable.
3. `RoiBenchmarkChange` table exists and records updates.
4. `Organization.country` is populated for deterministic fixtures.
5. Existing pages load without schema exceptions.

## Rollback steps

SQLite rollback is file-based:

1. Stop application process.
2. Replace `prisma/dev.db` with last known-good backup copy.
3. Remove stale WAL/SHM files if present.
4. Restart app and run smoke checks:
   - login endpoint
   - phase workspace load
   - cohort analytics load
5. Re-run migration only after root-cause analysis.

## Data safety assumptions

- Audit records are append-only at application layer.
- No destructive migration statements were generated.
- New fields are backward-compatible (nullable/defaulted).
