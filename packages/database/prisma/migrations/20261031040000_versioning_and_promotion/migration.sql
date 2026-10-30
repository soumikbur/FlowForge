-- AlterTable workflows
ALTER TABLE "workflows" ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable workflow_versions
ALTER TABLE "workflow_versions" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "workflow_versions" ADD COLUMN "releaseNotes" TEXT;

-- AlterTable workflow_executions
ALTER TABLE "workflow_executions" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'development';

-- CreateTable
CREATE TABLE "workflow_deployments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'development',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deployedById" TEXT,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousVersionId" TEXT,
    "releaseNotes" TEXT,
    "rollbackReason" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "workflow_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_deployments_organizationId_idx" ON "workflow_deployments"("organizationId");
CREATE INDEX "workflow_deployments_workflowId_environment_idx" ON "workflow_deployments"("workflowId", "environment");
CREATE INDEX "workflow_deployments_status_idx" ON "workflow_deployments"("status");

-- AddForeignKey
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_deployedById_fkey" FOREIGN KEY ("deployedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

