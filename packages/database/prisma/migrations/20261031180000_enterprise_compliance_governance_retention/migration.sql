-- AlterTable audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "audit_logs" ADD COLUMN "actorId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "authMethod" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "audit_logs" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "recordHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "prevRecordHash" TEXT;

CREATE INDEX "audit_logs_organizationId_resourceType_idx" ON "audit_logs"("organizationId", "resourceType");
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");

-- CreateTable retention_policies
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "legalHoldExempt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retention_policies_organizationId_category_key" ON "retention_policies"("organizationId", "category");
CREATE INDEX "retention_policies_organizationId_idx" ON "retention_policies"("organizationId");
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable retention_jobs
CREATE TABLE "retention_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recordsEvaluated" INTEGER NOT NULL DEFAULT 0,
    "recordsPurged" INTEGER NOT NULL DEFAULT 0,
    "bytesReclaimed" BIGINT,
    "errorDetails" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retention_jobs_organizationId_status_idx" ON "retention_jobs"("organizationId", "status");
CREATE INDEX "retention_jobs_organizationId_createdAt_idx" ON "retention_jobs"("organizationId", "createdAt");
ALTER TABLE "retention_jobs" ADD CONSTRAINT "retention_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable privacy_requests
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "details" JSONB,
    "outcomeSummary" TEXT,
    "artifactUrl" TEXT,
    "artifactExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_organizationId_status_idx" ON "privacy_requests"("organizationId", "status");
CREATE INDEX "privacy_requests_userId_idx" ON "privacy_requests"("userId");
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable legal_holds
CREATE TABLE "legal_holds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "targetId" TEXT,
    "categories" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_holds_organizationId_status_idx" ON "legal_holds"("organizationId", "status");
CREATE INDEX "legal_holds_targetType_targetId_idx" ON "legal_holds"("targetType", "targetId");
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

