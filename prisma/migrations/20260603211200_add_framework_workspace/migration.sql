-- CreateTable
CREATE TABLE "FrameworkWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "materialsFolderUrl" TEXT,
    "materialsFolderUrl2" TEXT,
    "materialsFolderUrl3" TEXT,
    "materialsFolderUrl4" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FrameworkWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FrameworkWorkspace_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkWorkspace_organizationId_key" ON "FrameworkWorkspace"("organizationId");

-- CreateIndex
CREATE INDEX "FrameworkWorkspace_organizationId_updatedAt_idx" ON "FrameworkWorkspace"("organizationId", "updatedAt");
