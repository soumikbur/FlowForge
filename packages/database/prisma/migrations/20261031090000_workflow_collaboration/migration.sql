-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('MAINTAINER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkflowActivityType" AS ENUM (
    'WORKFLOW_CREATED',
    'DRAFT_UPDATED',
    'WORKFLOW_PUBLISHED',
    'OWNERSHIP_TRANSFERRED',
    'COLLABORATOR_ADDED',
    'COLLABORATOR_REMOVED',
    'COLLABORATOR_ROLE_UPDATED',
    'COMMENT_ADDED',
    'COMMENT_RESOLVED',
    'COMMENT_DELETED'
);

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "lastUpdatedById" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_collaborators" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CollaboratorRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "nodeId" TEXT,
    "parentId" TEXT,
    "draftRevision" INTEGER,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "WorkflowActivityType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_collaborators_workflowId_userId_key" ON "workflow_collaborators"("workflowId", "userId");
CREATE INDEX IF NOT EXISTS "workflow_collaborators_organizationId_idx" ON "workflow_collaborators"("organizationId");
CREATE INDEX IF NOT EXISTS "workflow_collaborators_workflowId_idx" ON "workflow_collaborators"("workflowId");
CREATE INDEX IF NOT EXISTS "workflow_collaborators_userId_idx" ON "workflow_collaborators"("userId");

CREATE INDEX IF NOT EXISTS "workflow_comments_organizationId_idx" ON "workflow_comments"("organizationId");
CREATE INDEX IF NOT EXISTS "workflow_comments_workflowId_idx" ON "workflow_comments"("workflowId");
CREATE INDEX IF NOT EXISTS "workflow_comments_userId_idx" ON "workflow_comments"("userId");
CREATE INDEX IF NOT EXISTS "workflow_comments_parentId_idx" ON "workflow_comments"("parentId");
CREATE INDEX IF NOT EXISTS "workflow_comments_isResolved_idx" ON "workflow_comments"("isResolved");

CREATE INDEX IF NOT EXISTS "workflow_activities_organizationId_createdAt_idx" ON "workflow_activities"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "workflow_activities_workflowId_createdAt_idx" ON "workflow_activities"("workflowId", "createdAt");
CREATE INDEX IF NOT EXISTS "workflow_activities_userId_idx" ON "workflow_activities"("userId");
CREATE INDEX IF NOT EXISTS "workflow_activities_type_idx" ON "workflow_activities"("type");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_collaborators_organizationId_fkey') THEN
        ALTER TABLE "workflow_collaborators" ADD CONSTRAINT "workflow_collaborators_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_collaborators_workflowId_fkey') THEN
        ALTER TABLE "workflow_collaborators" ADD CONSTRAINT "workflow_collaborators_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_collaborators_userId_fkey') THEN
        ALTER TABLE "workflow_collaborators" ADD CONSTRAINT "workflow_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_comments_organizationId_fkey') THEN
        ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_comments_workflowId_fkey') THEN
        ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_comments_userId_fkey') THEN
        ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_comments_parentId_fkey') THEN
        ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "workflow_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_comments_resolvedById_fkey') THEN
        ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_activities_organizationId_fkey') THEN
        ALTER TABLE "workflow_activities" ADD CONSTRAINT "workflow_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_activities_workflowId_fkey') THEN
        ALTER TABLE "workflow_activities" ADD CONSTRAINT "workflow_activities_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_activities_userId_fkey') THEN
        ALTER TABLE "workflow_activities" ADD CONSTRAINT "workflow_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
