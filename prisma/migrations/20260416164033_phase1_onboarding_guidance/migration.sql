-- CreateTable
CREATE TABLE "OnboardingWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "missionStatement" TEXT,
    "visionStatement" TEXT,
    "coreValues" TEXT,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "commitmentsJson" TEXT,
    "kickoffJson" TEXT,
    "workplanJson" TEXT,
    "calendarApproved" BOOLEAN NOT NULL DEFAULT false,
    "milestonesJson" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OnboardingWorkspace_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "linkedUserId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "participantType" TEXT NOT NULL DEFAULT 'internal',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OnboardingWorkspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OnboardingParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OnboardingParticipant_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileBytes" BLOB NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OnboardingEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FacilitatorGuidance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "facilitatorName" TEXT NOT NULL DEFAULT 'Horacio Narváez-Mena',
    "message" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacilitatorGuidance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FacilitatorGuidance_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FacilitatorGuidanceTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guidanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'current',
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacilitatorGuidanceTask_guidanceId_fkey" FOREIGN KEY ("guidanceId") REFERENCES "FacilitatorGuidance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingWorkspace_organizationId_key" ON "OnboardingWorkspace"("organizationId");

-- CreateIndex
CREATE INDEX "OnboardingWorkspace_organizationId_updatedAt_idx" ON "OnboardingWorkspace"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "OnboardingParticipant_workspaceId_orderIndex_idx" ON "OnboardingParticipant"("workspaceId", "orderIndex");

-- CreateIndex
CREATE INDEX "OnboardingParticipant_organizationId_participantType_idx" ON "OnboardingParticipant"("organizationId", "participantType");

-- CreateIndex
CREATE INDEX "OnboardingEvidence_organizationId_createdAt_idx" ON "OnboardingEvidence"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FacilitatorGuidance_organizationId_key" ON "FacilitatorGuidance"("organizationId");

-- CreateIndex
CREATE INDEX "FacilitatorGuidance_organizationId_updatedAt_idx" ON "FacilitatorGuidance"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "FacilitatorGuidanceTask_guidanceId_status_orderIndex_idx" ON "FacilitatorGuidanceTask"("guidanceId", "status", "orderIndex");
