-- CreateEnum
CREATE TYPE "TemplateVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION', 'PLATFORM');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "sourceTemplateId" TEXT;
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "sourceTemplateVersionId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "visibility" "TemplateVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "draftDefinition" JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    "requiredConnections" JSONB NOT NULL DEFAULT '[]',
    "requiredInputs" JSONB NOT NULL DEFAULT '{}',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "requiredConnections" JSONB NOT NULL DEFAULT '[]',
    "requiredInputs" JSONB NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_template_versions_templateId_versionNumber_key" ON "workflow_template_versions"("templateId", "versionNumber");
CREATE INDEX IF NOT EXISTS "workflow_templates_organizationId_idx" ON "workflow_templates"("organizationId");
CREATE INDEX IF NOT EXISTS "workflow_templates_visibility_idx" ON "workflow_templates"("visibility");
CREATE INDEX IF NOT EXISTS "workflow_templates_status_idx" ON "workflow_templates"("status");
CREATE INDEX IF NOT EXISTS "workflow_templates_category_idx" ON "workflow_templates"("category");
CREATE INDEX IF NOT EXISTS "workflow_template_versions_templateId_idx" ON "workflow_template_versions"("templateId");
CREATE INDEX IF NOT EXISTS "workflows_sourceTemplateId_idx" ON "workflows"("sourceTemplateId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_templates_organizationId_fkey') THEN
        ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_templates_createdById_fkey') THEN
        ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_template_versions_templateId_fkey') THEN
        ALTER TABLE "workflow_template_versions" ADD CONSTRAINT "workflow_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_template_versions_publishedById_fkey') THEN
        ALTER TABLE "workflow_template_versions" ADD CONSTRAINT "workflow_template_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflows_sourceTemplateId_fkey') THEN
        ALTER TABLE "workflows" ADD CONSTRAINT "workflows_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
