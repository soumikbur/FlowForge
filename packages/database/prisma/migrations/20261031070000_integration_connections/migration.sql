-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "integration_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "authType" TEXT NOT NULL DEFAULT 'API_KEY',
    "encryptedData" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_connections_organizationId_idx" ON "integration_connections"("organizationId");
CREATE INDEX IF NOT EXISTS "integration_connections_connectorId_idx" ON "integration_connections"("connectorId");
CREATE INDEX IF NOT EXISTS "integration_connections_status_idx" ON "integration_connections"("status");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_organizationId_fkey'
    ) THEN
        ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_createdById_fkey'
    ) THEN
        ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
