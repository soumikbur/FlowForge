-- CreateTable
CREATE TABLE "resource_quotas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workflowId" TEXT,
    "maxMonthlyExecutions" INTEGER NOT NULL DEFAULT 5000,
    "maxConcurrentExecutions" INTEGER NOT NULL DEFAULT 10,
    "maxQueueDepth" INTEGER NOT NULL DEFAULT 50,
    "maxExecutionDurationMs" INTEGER NOT NULL DEFAULT 300000,
    "maxStepCount" INTEGER NOT NULL DEFAULT 100,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "maxConnectorCallsPerRun" INTEGER NOT NULL DEFAULT 50,
    "monthlyBudgetDollars" DOUBLE PRECISION NOT NULL DEFAULT 500.0,
    "budgetAlertThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "fairShareWeight" INTEGER NOT NULL DEFAULT 10,
    "enforcementAction" TEXT NOT NULL DEFAULT 'REJECT',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_quotas_organizationId_workspaceId_workflowId_key" ON "resource_quotas"("organizationId", "workspaceId", "workflowId");
CREATE INDEX "resource_quotas_organizationId_idx" ON "resource_quotas"("organizationId");

-- AddForeignKey
ALTER TABLE "resource_quotas" ADD CONSTRAINT "resource_quotas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

