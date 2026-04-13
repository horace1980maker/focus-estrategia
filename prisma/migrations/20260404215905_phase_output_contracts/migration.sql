-- CreateTable
CREATE TABLE "PhaseOutputCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseId" TEXT NOT NULL,
    "outputKey" TEXT NOT NULL,
    "outputLabel" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhaseOutputCompletion_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PhaseOutputCompletion_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PhaseOutputCompletion_phaseId_isCompleted_idx" ON "PhaseOutputCompletion"("phaseId", "isCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOutputCompletion_phaseId_outputKey_key" ON "PhaseOutputCompletion"("phaseId", "outputKey");
