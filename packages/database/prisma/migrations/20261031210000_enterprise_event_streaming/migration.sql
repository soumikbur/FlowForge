-- AlterEnum
ALTER TYPE "TriggerType" ADD VALUE 'EVENT';

-- CreateTable stream_events
CREATE TABLE "stream_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "specVersion" TEXT NOT NULL DEFAULT '1.0',
    "source" TEXT NOT NULL,
    "connectorId" TEXT,
    "subject" TEXT,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "partitionKey" TEXT,
    "traceId" TEXT,
    "spanId" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'application/json',
    "data" JSONB NOT NULL,
    "metadata" JSONB,
    "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'INGESTED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "executionIds" JSONB NOT NULL DEFAULT '[]',
    "replayedFromId" TEXT,
    "replayedAt" TIMESTAMP(3),
    "replayedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable event_deduplications
CREATE TABLE "event_deduplications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_deduplications_pkey" PRIMARY KEY ("id")
);

-- CreateTable connector_subscriptions
CREATE TABLE "connector_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "connectionId" TEXT,
    "name" TEXT NOT NULL,
    "eventTypes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deliveryMode" TEXT NOT NULL DEFAULT 'PUSH',
    "endpointUrl" TEXT,
    "externalSubscriptionId" TEXT,
    "secret" TEXT,
    "config" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "stream_events_organizationId_createdAt_idx" ON "stream_events"("organizationId", "createdAt");
CREATE INDEX "stream_events_organizationId_type_idx" ON "stream_events"("organizationId", "type");
CREATE INDEX "stream_events_organizationId_status_idx" ON "stream_events"("organizationId", "status");
CREATE INDEX "stream_events_organizationId_correlationId_idx" ON "stream_events"("organizationId", "correlationId");
CREATE INDEX "stream_events_organizationId_partitionKey_idx" ON "stream_events"("organizationId", "partitionKey");

CREATE UNIQUE INDEX "event_deduplications_organizationId_deduplicationKey_key" ON "event_deduplications"("organizationId", "deduplicationKey");
CREATE INDEX "event_deduplications_expiresAt_idx" ON "event_deduplications"("expiresAt");

CREATE INDEX "connector_subscriptions_organizationId_idx" ON "connector_subscriptions"("organizationId");
CREATE INDEX "connector_subscriptions_connectorId_idx" ON "connector_subscriptions"("connectorId");
CREATE INDEX "connector_subscriptions_status_idx" ON "connector_subscriptions"("status");

-- AddForeignKey
ALTER TABLE "stream_events" ADD CONSTRAINT "stream_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_deduplications" ADD CONSTRAINT "event_deduplications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_subscriptions" ADD CONSTRAINT "connector_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

