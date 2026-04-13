# Restore Drill Evidence (Non-Production)

Date: 2026-04-05  
Environment: Local non-production SQLite

## Drill steps executed

1. Created DB backup copy of `prisma/dev.db`.
2. Applied hardening migrations.
3. Simulated restore by replacing active DB with backup copy.
4. Re-started application services.
5. Re-ran baseline endpoint checks:
   - auth login route reachable
   - phase workspace endpoint reachable
   - cohort analytics endpoint reachable
   - audit events endpoint reachable

## Results

- Critical tables restored:
  - `Organization`
  - `User`
  - `PhaseTracker`
  - `AuditEvent`
  - `RoiSetting`
  - `RoiBenchmarkChange`
- No schema mismatch errors after restore.
- Application resumed normal read/write behavior.

## Follow-up actions

- Keep this evidence file updated each monthly drill.
- Rotate backup ownership checklist with on-call operator.
