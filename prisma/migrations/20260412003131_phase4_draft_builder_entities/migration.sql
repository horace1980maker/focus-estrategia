-- CreateTable
CREATE TABLE "DraftObjectiveResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "sourceObjectiveId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expectedResults" TEXT,
    "owner" TEXT,
    "timelineStart" DATETIME,
    "timelineEnd" DATETIME,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftObjectiveResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftObjectiveResult_sourceObjectiveId_fkey" FOREIGN KEY ("sourceObjectiveId") REFERENCES "StrategicObjective" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftLineOfAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "objectiveResultId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "initiativesJson" TEXT,
    "timelineStart" DATETIME,
    "timelineEnd" DATETIME,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftLineOfAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftLineOfAction_objectiveResultId_fkey" FOREIGN KEY ("objectiveResultId") REFERENCES "DraftObjectiveResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftAssumptionRisk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "mitigation" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftAssumptionRisk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationFeedbackResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "submittedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ValidationFeedbackResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ValidationFeedbackResponse_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationSignoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationSignoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ValidationSignoff_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DraftObjectiveResult_organizationId_orderIndex_idx" ON "DraftObjectiveResult"("organizationId", "orderIndex");

-- CreateIndex
CREATE INDEX "DraftLineOfAction_organizationId_orderIndex_idx" ON "DraftLineOfAction"("organizationId", "orderIndex");

-- CreateIndex
CREATE INDEX "DraftAssumptionRisk_organizationId_type_idx" ON "DraftAssumptionRisk"("organizationId", "type");

-- CreateIndex
CREATE INDEX "DraftSnapshot_organizationId_versionNumber_idx" ON "DraftSnapshot"("organizationId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSnapshot_organizationId_versionNumber_key" ON "DraftSnapshot"("organizationId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationFeedbackResponse_organizationId_key" ON "ValidationFeedbackResponse"("organizationId");

-- CreateIndex
CREATE INDEX "ValidationSignoff_organizationId_idx" ON "ValidationSignoff"("organizationId");
