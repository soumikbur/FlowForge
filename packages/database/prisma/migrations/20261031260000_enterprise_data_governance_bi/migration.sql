-- CreateTable
CREATE TABLE "roi_assumptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "manualMinutesPerRun" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "hourlyWage" DOUBLE PRECISION NOT NULL DEFAULT 45.0,
    "licenseCostMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "infrastructureCostPerRun" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roi_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportType" TEXT NOT NULL DEFAULT 'EXECUTIVE_ROI',
    "filtersJson" TEXT,
    "metricsJson" TEXT,
    "scheduleCron" TEXT,
    "format" TEXT NOT NULL DEFAULT 'JSON',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roi_assumptions_organizationId_workflowId_key" ON "roi_assumptions"("organizationId", "workflowId");
CREATE INDEX "roi_assumptions_organizationId_idx" ON "roi_assumptions"("organizationId");

-- CreateIndex
CREATE INDEX "saved_reports_organizationId_idx" ON "saved_reports"("organizationId");

-- AddForeignKey
ALTER TABLE "roi_assumptions" ADD CONSTRAINT "roi_assumptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

