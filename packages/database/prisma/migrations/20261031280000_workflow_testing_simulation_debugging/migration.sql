-- CreateTable
CREATE TABLE "workflow_test_cases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workflowId" TEXT NOT NULL,
    "workflowVersionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "inputData" JSONB,
    "mockFixtures" JSONB,
    "failureInjections" JSONB,
    "assertions" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_test_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "workflowId" TEXT NOT NULL,
    "workflowVersionId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "status" TEXT NOT NULL DEFAULT 'PASSED',
    "executedPath" JSONB NOT NULL,
    "nodeResults" JSONB NOT NULL,
    "assertionResults" JSONB NOT NULL,
    "failureReason" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_fixtures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "matchPattern" TEXT,
    "responseStatus" INTEGER NOT NULL DEFAULT 200,
    "responsePayload" JSONB,
    "errorDetails" JSONB,
    "isRateLimited" BOOLEAN NOT NULL DEFAULT false,
    "isTimeout" BOOLEAN NOT NULL DEFAULT false,
    "delayMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing_gate_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "requireStaticValidation" BOOLEAN NOT NULL DEFAULT true,
    "requireTestSuitePass" BOOLEAN NOT NULL DEFAULT false,
    "requireRegressionCheck" BOOLEAN NOT NULL DEFAULT false,
    "requirePolicyCheck" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publishing_gate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_test_cases_organizationId_workflowId_idx" ON "workflow_test_cases"("organizationId", "workflowId");

-- CreateIndex
CREATE INDEX "workflow_test_runs_organizationId_workflowId_idx" ON "workflow_test_runs"("organizationId", "workflowId");
CREATE INDEX "workflow_test_runs_organizationId_testCaseId_idx" ON "workflow_test_runs"("organizationId", "testCaseId");

-- CreateIndex
CREATE INDEX "test_fixtures_organizationId_connectorType_idx" ON "test_fixtures"("organizationId", "connectorType");

-- CreateIndex
CREATE UNIQUE INDEX "publishing_gate_configs_organizationId_workflowId_key" ON "publishing_gate_configs"("organizationId", "workflowId");
CREATE INDEX "publishing_gate_configs_organizationId_idx" ON "publishing_gate_configs"("organizationId");

-- AddForeignKey
ALTER TABLE "workflow_test_cases" ADD CONSTRAINT "workflow_test_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_test_runs" ADD CONSTRAINT "workflow_test_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_fixtures" ADD CONSTRAINT "test_fixtures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_gate_configs" ADD CONSTRAINT "publishing_gate_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

