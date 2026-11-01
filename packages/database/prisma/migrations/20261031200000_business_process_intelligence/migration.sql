-- CreateTable workflow_slos
CREATE TABLE "workflow_slos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 168,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_slos_pkey" PRIMARY KEY ("id")
);

-- CreateTable business_outcomes
CREATE TABLE "business_outcomes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "outcomeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetTimeMs" DOUBLE PRECISION,
    "actualTimeMs" DOUBLE PRECISION,
    "metSla" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable process_events
CREATE TABLE "process_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workflowId" TEXT NOT NULL,
    "workflowVersionId" TEXT,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT,
    "eventType" TEXT NOT NULL,
    "durationMs" DOUBLE PRECISION,
    "retryCount" INTEGER DEFAULT 0,
    "failureCategory" TEXT,
    "connectorCategory" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "workflow_slos_organizationId_workflowId_idx" ON "workflow_slos"("organizationId", "workflowId");
CREATE INDEX "business_outcomes_organizationId_workflowId_idx" ON "business_outcomes"("organizationId", "workflowId");
CREATE INDEX "business_outcomes_executionId_idx" ON "business_outcomes"("executionId");
CREATE INDEX "process_events_organizationId_timestamp_idx" ON "process_events"("organizationId", "timestamp");
CREATE INDEX "process_events_workflowId_eventType_idx" ON "process_events"("workflowId", "eventType");
CREATE INDEX "process_events_executionId_idx" ON "process_events"("executionId");

-- AddForeignKeys
ALTER TABLE "workflow_slos" ADD CONSTRAINT "workflow_slos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_slos" ADD CONSTRAINT "workflow_slos_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_outcomes" ADD CONSTRAINT "business_outcomes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "process_events" ADD CONSTRAINT "process_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

