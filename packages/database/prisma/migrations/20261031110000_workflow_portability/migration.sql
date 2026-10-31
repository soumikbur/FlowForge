-- CreateTable
CREATE TABLE "workflow_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sourceWorkflowId" TEXT,
    "sourceRevision" INTEGER,
    "packageHash" TEXT NOT NULL,
    "packageFormatVersion" TEXT NOT NULL,
    "conflictStrategy" TEXT NOT NULL,
    "connectorMappings" JSONB NOT NULL DEFAULT '{}',
    "compatibilityStatus" TEXT NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_imports_organizationId_idx" ON "workflow_imports"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_imports_workflowId_idx" ON "workflow_imports"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_imports_packageHash_idx" ON "workflow_imports"("packageHash");

-- AddForeignKey
ALTER TABLE "workflow_imports" ADD CONSTRAINT "workflow_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_imports" ADD CONSTRAINT "workflow_imports_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_imports" ADD CONSTRAINT "workflow_imports_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
