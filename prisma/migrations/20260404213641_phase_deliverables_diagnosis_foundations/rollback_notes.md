# Rollback Notes

If this migration must be rolled back, use the following safety sequence:

1. Stop writes to phase transitions and deliverables endpoints.
2. Export backup snapshots of:
   - `PhaseTracker`
   - `Phase`
   - `Deliverable`
   - `DiagnosisSurvey*` tables
   - `PhaseMigrationAudit`
3. Revert application code that depends on 6-phase flow and diagnosis survey tables.
4. Restore database from pre-migration backup, or run a controlled down migration that:
   - Removes phase `6` rows from `Phase`.
   - Resets `PhaseTracker.currentPhase` values from `6` to `5` only after facilitator confirmation.
   - Maps `Deliverable.status` value `in_review` back to `submitted` if the legacy code path requires it.
5. Re-run smoke tests for dashboard, cohort, phase review actions, and analytics endpoints.

## Post-Rollback Verification

- Confirm no tracker has `currentPhase > 5`.
- Confirm all phase transitions work for phases 1..5.
- Confirm legacy deliverable status filters (`draft|submitted|approved`) return expected data.
- Confirm affected organizations from `PhaseMigrationAudit` have manual follow-up notes retained.
