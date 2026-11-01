-- CreateTable: execution_leases
CREATE TABLE "execution_leases" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "leaseToken" TEXT NOT NULL,
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: schedule_claims
CREATE TABLE "schedule_claims" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "claimedBy" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executionId" TEXT,

    CONSTRAINT "schedule_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable: step_reconciliations
CREATE TABLE "step_reconciliations" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRES_RECONCILIATION',
    "reason" TEXT NOT NULL,
    "sideEffectDetails" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execution_leases_executionId_key" ON "execution_leases"("executionId");
CREATE INDEX "execution_leases_workerId_idx" ON "execution_leases"("workerId");
CREATE INDEX "execution_leases_expiresAt_idx" ON "execution_leases"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_claims_scheduleId_occurrenceKey_key" ON "schedule_claims"("scheduleId", "occurrenceKey");
CREATE INDEX "schedule_claims_expiresAt_idx" ON "schedule_claims"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "step_reconciliations_stepId_key" ON "step_reconciliations"("stepId");
CREATE INDEX "step_reconciliations_executionId_idx" ON "step_reconciliations"("executionId");
CREATE INDEX "step_reconciliations_status_idx" ON "step_reconciliations"("status");

