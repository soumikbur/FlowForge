-- CreateTable extension_packages
CREATE TABLE "extension_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "publisherName" TEXT NOT NULL,
    "publisherEmail" TEXT NOT NULL,
    "isVerifiedPublisher" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extension_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable extension_versions
CREATE TABLE "extension_versions" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "packageIntegrityHash" TEXT NOT NULL,
    "supportedFlowForgeVersions" TEXT NOT NULL DEFAULT '>=1.0.0',
    "declaredCapabilities" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "releaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable extension_installations
CREATE TABLE "extension_installations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "installedVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "grantedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extension_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "extension_packages_status_idx" ON "extension_packages"("status");
CREATE INDEX "extension_packages_organizationId_idx" ON "extension_packages"("organizationId");

CREATE UNIQUE INDEX "extension_versions_extensionId_version_key" ON "extension_versions"("extensionId", "version");
CREATE INDEX "extension_versions_extensionId_idx" ON "extension_versions"("extensionId");

CREATE UNIQUE INDEX "extension_installations_organizationId_extensionId_key" ON "extension_installations"("organizationId", "extensionId");
CREATE INDEX "extension_installations_organizationId_idx" ON "extension_installations"("organizationId");
CREATE INDEX "extension_installations_extensionId_idx" ON "extension_installations"("extensionId");
CREATE INDEX "extension_installations_status_idx" ON "extension_installations"("status");

-- AddForeignKey
ALTER TABLE "extension_versions" ADD CONSTRAINT "extension_versions_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "extension_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "extension_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

