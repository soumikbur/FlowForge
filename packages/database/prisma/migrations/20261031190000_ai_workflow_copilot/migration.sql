-- CreateTable ai_configurations
CREATE TABLE "ai_configurations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "model" TEXT NOT NULL DEFAULT 'flowforge-copilot-v1',
    "apiKey" TEXT,
    "endpointUrl" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyTokenBudget" INTEGER NOT NULL DEFAULT 500000,
    "allowedRoles" JSONB NOT NULL DEFAULT '["OWNER","ADMIN","MEMBER"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_configurations_organizationId_key" ON "ai_configurations"("organizationId");

-- AddForeignKey
ALTER TABLE "ai_configurations" ADD CONSTRAINT "ai_configurations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

