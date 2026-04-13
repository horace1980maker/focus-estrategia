-- CreateTable
CREATE TABLE "DiagnosisSurveyDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "scaleDefinitionJson" TEXT,
    "interpretationGuideJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiagnosisSurveySection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisSurveySection_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DiagnosisSurveyDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosisSurveyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "sectionId" TEXT,
    "questionKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "scaleMin" INTEGER,
    "scaleMax" INTEGER,
    "allowsNoInformation" BOOLEAN NOT NULL DEFAULT false,
    "interpretationNote" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisSurveyQuestion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DiagnosisSurveyDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiagnosisSurveyQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DiagnosisSurveySection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosisSurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "submittedById" TEXT,
    "responseStatus" TEXT NOT NULL DEFAULT 'submitted',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisSurveyResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiagnosisSurveyResponse_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DiagnosisSurveyDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiagnosisSurveyResponse_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosisSurveyAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "numericValue" INTEGER,
    "optionValue" TEXT,
    "textValue" TEXT,
    "isNoInformation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "DiagnosisSurveyResponse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiagnosisSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DiagnosisSurveyQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhaseMigrationAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "previousCurrentPhase" INTEGER NOT NULL,
    "mappedCurrentPhase" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaseMigrationAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "phaseKey" TEXT NOT NULL DEFAULT 'deliverables',
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "readinessStatus" TEXT NOT NULL DEFAULT 'not_ready',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "sourcePhaseRefsJson" TEXT,
    "exportMetadataJson" TEXT,
    "generatedAt" DATETIME,
    "approvedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Deliverable" ("createdAt", "fileUrl", "id", "organizationId", "phaseNumber", "status", "title", "updatedAt") SELECT "createdAt", "fileUrl", "id", "organizationId", "phaseNumber", "status", "title", "updatedAt" FROM "Deliverable";
DROP TABLE "Deliverable";
ALTER TABLE "new_Deliverable" RENAME TO "Deliverable";
CREATE INDEX "Deliverable_organizationId_status_updatedAt_idx" ON "Deliverable"("organizationId", "status", "updatedAt");
CREATE INDEX "Deliverable_organizationId_versionNumber_idx" ON "Deliverable"("organizationId", "versionNumber");
CREATE TABLE "new_Phase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseTrackerId" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "phaseKey" TEXT NOT NULL DEFAULT 'onboarding',
    "status" TEXT NOT NULL DEFAULT 'locked',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Phase_phaseTrackerId_fkey" FOREIGN KEY ("phaseTrackerId") REFERENCES "PhaseTracker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Phase" ("completedAt", "createdAt", "id", "phaseNumber", "phaseTrackerId", "startedAt", "status", "updatedAt") SELECT "completedAt", "createdAt", "id", "phaseNumber", "phaseTrackerId", "startedAt", "status", "updatedAt" FROM "Phase";
DROP TABLE "Phase";
ALTER TABLE "new_Phase" RENAME TO "Phase";
CREATE UNIQUE INDEX "Phase_phaseTrackerId_phaseNumber_key" ON "Phase"("phaseTrackerId", "phaseNumber");
CREATE UNIQUE INDEX "Phase_phaseTrackerId_phaseKey_key" ON "Phase"("phaseTrackerId", "phaseKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisSurveyDefinition_version_key" ON "DiagnosisSurveyDefinition"("version");

-- CreateIndex
CREATE INDEX "DiagnosisSurveySection_definitionId_orderIndex_idx" ON "DiagnosisSurveySection"("definitionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisSurveySection_definitionId_sectionKey_key" ON "DiagnosisSurveySection"("definitionId", "sectionKey");

-- CreateIndex
CREATE INDEX "DiagnosisSurveyQuestion_definitionId_orderIndex_idx" ON "DiagnosisSurveyQuestion"("definitionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisSurveyQuestion_definitionId_questionKey_key" ON "DiagnosisSurveyQuestion"("definitionId", "questionKey");

-- CreateIndex
CREATE INDEX "DiagnosisSurveyResponse_organizationId_submittedAt_idx" ON "DiagnosisSurveyResponse"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "DiagnosisSurveyResponse_definitionId_idx" ON "DiagnosisSurveyResponse"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisSurveyAnswer_responseId_questionId_key" ON "DiagnosisSurveyAnswer"("responseId", "questionId");

-- CreateIndex
CREATE INDEX "PhaseMigrationAudit_organizationId_createdAt_idx" ON "PhaseMigrationAudit"("organizationId", "createdAt");

-- Backfill canonical phase keys for existing phase rows.
UPDATE "Phase"
SET "phaseKey" = CASE "phaseNumber"
  WHEN 1 THEN 'onboarding'
  WHEN 2 THEN 'diagnosis'
  WHEN 3 THEN 'framework'
  WHEN 4 THEN 'draft'
  WHEN 5 THEN 'validation'
  WHEN 6 THEN 'deliverables'
  ELSE 'onboarding'
END;

-- Normalize legacy deliverable status values.
UPDATE "Deliverable"
SET "status" = 'in_review'
WHERE "status" = 'submitted';

-- Backfill deliverable phase keys based on existing numeric phase values.
UPDATE "Deliverable"
SET "phaseKey" = CASE "phaseNumber"
  WHEN 1 THEN 'onboarding'
  WHEN 2 THEN 'diagnosis'
  WHEN 3 THEN 'framework'
  WHEN 4 THEN 'draft'
  WHEN 5 THEN 'validation'
  WHEN 6 THEN 'deliverables'
  ELSE 'deliverables'
END;

-- Initialize readiness defaults for non-draft lifecycle states.
UPDATE "Deliverable"
SET "readinessStatus" = 'ready_for_review'
WHERE "status" IN ('in_review', 'approved', 'published');

-- Add the new phase 6 (deliverables) row to any tracker that still has only 5 rows.
INSERT INTO "Phase" (
  "id",
  "phaseTrackerId",
  "phaseNumber",
  "phaseKey",
  "status",
  "startedAt",
  "completedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'phase6_' || pt."id",
  pt."id",
  6,
  'deliverables',
  CASE
    WHEN pt."currentPhase" = 5 AND p5."status" = 'approved' THEN 'in_progress'
    ELSE 'locked'
  END,
  CASE
    WHEN pt."currentPhase" = 5 AND p5."status" = 'approved' THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PhaseTracker" pt
LEFT JOIN "Phase" p5
  ON p5."phaseTrackerId" = pt."id"
 AND p5."phaseNumber" = 5
WHERE NOT EXISTS (
  SELECT 1
  FROM "Phase" p6
  WHERE p6."phaseTrackerId" = pt."id"
    AND p6."phaseNumber" = 6
);

-- Capture low-confidence mappings where legacy phase 5 included closure work.
INSERT INTO "PhaseMigrationAudit" (
  "id",
  "organizationId",
  "previousCurrentPhase",
  "mappedCurrentPhase",
  "confidence",
  "reason",
  "createdAt"
)
SELECT
  'phase_map_' || pt."organizationId",
  pt."organizationId",
  pt."currentPhase",
  6,
  'low',
  'Legacy phase 5 merged validation and closure. Mapped to phase 6 deliverables; facilitator confirmation recommended.',
  CURRENT_TIMESTAMP
FROM "PhaseTracker" pt
JOIN "Phase" p5
  ON p5."phaseTrackerId" = pt."id"
 AND p5."phaseNumber" = 5
WHERE pt."currentPhase" = 5
  AND p5."status" = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM "PhaseMigrationAudit" a
    WHERE a."organizationId" = pt."organizationId"
      AND a."mappedCurrentPhase" = 6
  );

-- Update tracker pointers for audited low-confidence mappings.
UPDATE "PhaseTracker"
SET "currentPhase" = 6
WHERE "organizationId" IN (
  SELECT "organizationId"
  FROM "PhaseMigrationAudit"
  WHERE "mappedCurrentPhase" = 6
    AND "confidence" = 'low'
);

-- Clamp any out-of-range values for safety.
UPDATE "PhaseTracker"
SET "currentPhase" = CASE
  WHEN "currentPhase" < 1 THEN 1
  WHEN "currentPhase" > 6 THEN 6
  ELSE "currentPhase"
END;
