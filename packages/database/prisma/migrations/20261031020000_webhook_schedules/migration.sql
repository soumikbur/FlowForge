-- Migration: 20261031020000_webhook_schedules
-- CreateTable: webhook_configs
CREATE TABLE "webhook_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "signingSecret" TEXT NOT NULL,
    "eventFilter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workflow_schedules
CREATE TABLE "workflow_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "misfirePolicy" TEXT NOT NULL DEFAULT 'RUN_ONCE',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_configs_organizationId_idx" ON "webhook_configs"("organizationId");
CREATE INDEX "webhook_configs_workflowId_idx" ON "webhook_configs"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_schedules_organizationId_idx" ON "workflow_schedules"("organizationId");
CREATE INDEX "workflow_schedules_workflowId_idx" ON "workflow_schedules"("workflowId");
CREATE INDEX "workflow_schedules_enabled_nextRunAt_idx" ON "workflow_schedules"("enabled", "nextRunAt");

-- AddForeignKey
ALTER TABLE "webhook_configs" ADD CONSTRAINT "webhook_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_configs" ADD CONSTRAINT "webhook_configs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

