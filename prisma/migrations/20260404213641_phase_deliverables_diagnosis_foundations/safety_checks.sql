-- Pre-apply and post-apply safety checks for
-- 20260404213641_phase_deliverables_diagnosis_foundations
--
-- Run manually in SQLite before and after migration when needed.

-- 1) Ensure each organization has at most one phase tracker.
SELECT "organizationId", COUNT(*) AS "trackerCount"
FROM "PhaseTracker"
GROUP BY "organizationId"
HAVING COUNT(*) > 1;

-- 2) Ensure each tracker has unique phase numbers.
SELECT "phaseTrackerId", "phaseNumber", COUNT(*) AS "phaseCount"
FROM "Phase"
GROUP BY "phaseTrackerId", "phaseNumber"
HAVING COUNT(*) > 1;

-- 3) After migration, validate current phase pointer bounds.
SELECT "id", "organizationId", "currentPhase"
FROM "PhaseTracker"
WHERE "currentPhase" < 1 OR "currentPhase" > 6;

-- 4) After migration, ensure every tracker has a deliverables phase row.
SELECT pt."id" AS "phaseTrackerId"
FROM "PhaseTracker" pt
LEFT JOIN "Phase" p
  ON p."phaseTrackerId" = pt."id"
 AND p."phaseNumber" = 6
WHERE p."id" IS NULL;

-- 5) After migration, inspect low-confidence mappings requiring facilitator review.
SELECT "organizationId", "previousCurrentPhase", "mappedCurrentPhase", "reason", "createdAt"
FROM "PhaseMigrationAudit"
WHERE "confidence" = 'low'
ORDER BY "createdAt" DESC;
