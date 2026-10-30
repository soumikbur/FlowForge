-- CreateTable operational_alerts
CREATE TABLE "operational_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "ruleType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contextJson" JSONB,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "dedupKey" TEXT,

    CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on operational_alerts
CREATE INDEX "operational_alerts_organizationId_status_idx" ON "operational_alerts"("organizationId", "status");
CREATE INDEX "operational_alerts_organizationId_triggeredAt_idx" ON "operational_alerts"("organizationId", "triggeredAt");
CREATE INDEX "operational_alerts_dedupKey_idx" ON "operational_alerts"("dedupKey");

-- CreateIndexes on workflow_executions for analytics query performance
CREATE INDEX "workflow_executions_organizationId_createdAt_idx" ON "workflow_executions"("organizationId", "createdAt");
CREATE INDEX "workflow_executions_organizationId_status_createdAt_idx" ON "workflow_executions"("organizationId", "status", "createdAt");
CREATE INDEX "workflow_executions_organizationId_workflowId_createdAt_idx" ON "workflow_executions"("organizationId", "workflowId", "createdAt");

-- CreateIndexes on execution_steps
CREATE INDEX "execution_steps_executionId_status_idx" ON "execution_steps"("executionId", "status");
CREATE INDEX "execution_steps_nodeType_idx" ON "execution_steps"("nodeType");

-- AddForeignKeys on operational_alerts
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
