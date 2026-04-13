-- CreateTable
CREATE TABLE "ActivitySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL DEFAULT 0,
    "sectionKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationMinutes" INTEGER,
    "isClosedByTimeout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivitySession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionEngagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL DEFAULT 0,
    "sectionKey" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SectionEngagement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoiSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "hourlyRateUsd" REAL NOT NULL DEFAULT 20,
    "baselineManualHoursPerTask" REAL NOT NULL DEFAULT 1.5,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoiSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoiSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'organization',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "platformHours" REAL NOT NULL DEFAULT 0,
    "manualHoursEstimate" REAL NOT NULL DEFAULT 0,
    "hoursSaved" REAL NOT NULL DEFAULT 0,
    "usdSaved" REAL NOT NULL DEFAULT 0,
    "hourlyRateUsd" REAL NOT NULL,
    "baselineManualHoursPerTask" REAL NOT NULL,
    "totalCompletedTasks" INTEGER NOT NULL DEFAULT 0,
    "totalTrackedMinutes" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoiSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ActivitySession_organizationId_startedAt_idx" ON "ActivitySession"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_organizationId_sectionKey_startedAt_idx" ON "ActivitySession"("organizationId", "sectionKey", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_organizationId_phaseNumber_startedAt_idx" ON "ActivitySession"("organizationId", "phaseNumber", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_userId_endedAt_idx" ON "ActivitySession"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "SectionEngagement_organizationId_windowStart_idx" ON "SectionEngagement"("organizationId", "windowStart");

-- CreateIndex
CREATE INDEX "SectionEngagement_organizationId_phaseNumber_windowStart_idx" ON "SectionEngagement"("organizationId", "phaseNumber", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "SectionEngagement_organizationId_phaseNumber_sectionKey_windowStart_windowEnd_key" ON "SectionEngagement"("organizationId", "phaseNumber", "sectionKey", "windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "RoiSetting_isDefault_idx" ON "RoiSetting"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "RoiSetting_organizationId_key" ON "RoiSetting"("organizationId");

-- CreateIndex
CREATE INDEX "RoiSnapshot_scope_periodStart_periodEnd_idx" ON "RoiSnapshot"("scope", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "RoiSnapshot_organizationId_periodStart_periodEnd_idx" ON "RoiSnapshot"("organizationId", "periodStart", "periodEnd");
