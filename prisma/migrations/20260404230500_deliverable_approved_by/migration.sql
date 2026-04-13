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
    "approvedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deliverable_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deliverable" ("approvedAt", "createdAt", "exportMetadataJson", "fileUrl", "generatedAt", "id", "organizationId", "phaseKey", "phaseNumber", "publishedAt", "readinessStatus", "sourcePhaseRefsJson", "status", "title", "updatedAt", "versionNumber") SELECT "approvedAt", "createdAt", "exportMetadataJson", "fileUrl", "generatedAt", "id", "organizationId", "phaseKey", "phaseNumber", "publishedAt", "readinessStatus", "sourcePhaseRefsJson", "status", "title", "updatedAt", "versionNumber" FROM "Deliverable";
DROP TABLE "Deliverable";
ALTER TABLE "new_Deliverable" RENAME TO "Deliverable";
CREATE INDEX "Deliverable_organizationId_status_updatedAt_idx" ON "Deliverable"("organizationId", "status", "updatedAt");
CREATE INDEX "Deliverable_organizationId_versionNumber_idx" ON "Deliverable"("organizationId", "versionNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
