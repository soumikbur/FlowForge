-- CreateEnum
CREATE TYPE "SsoProtocol" AS ENUM ('OIDC', 'SAML');
CREATE TYPE "SsoEnforcementMode" AS ENUM ('OPTIONAL', 'ENFORCED', 'STRICT');
CREATE TYPE "ProvisioningSource" AS ENUM ('LOCAL', 'SSO', 'SCIM', 'INVITATION');

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable sso_configurations
CREATE TABLE "sso_configurations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enforcementMode" "SsoEnforcementMode" NOT NULL DEFAULT 'OPTIONAL',
    "bypassUserIds" JSONB NOT NULL DEFAULT '[]',
    "allowIdpInitiated" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" "Role" NOT NULL DEFAULT 'MEMBER',
    "issuerUrl" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "authorizationUrl" TEXT,
    "tokenUrl" TEXT,
    "userInfoUrl" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '["openid","profile","email"]',
    "entityId" TEXT,
    "signOnUrl" TEXT,
    "signingCertificate" TEXT,
    "spEntityId" TEXT,
    "acsUrl" TEXT,
    "attributeMapping" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable external_identities
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "externalIssuer" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provisioningSource" "ProvisioningSource" NOT NULL DEFAULT 'SSO',
    "claims" JSONB NOT NULL DEFAULT '{}',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable group_role_mappings
CREATE TABLE "group_role_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ssoConfigurationId" TEXT NOT NULL,
    "externalGroupName" TEXT NOT NULL,
    "targetRole" "Role" NOT NULL DEFAULT 'MEMBER',
    "workspaceMappings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable scim_tokens
CREATE TABLE "scim_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_configurations_organizationId_key" ON "sso_configurations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_providerId_externalSubject_key" ON "external_identities"("providerId", "externalSubject");
CREATE UNIQUE INDEX "external_identities_organizationId_userId_providerId_key" ON "external_identities"("organizationId", "userId", "providerId");
CREATE INDEX "external_identities_organizationId_idx" ON "external_identities"("organizationId");
CREATE INDEX "external_identities_userId_idx" ON "external_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "group_role_mappings_ssoConfigurationId_externalGroupName_key" ON "group_role_mappings"("ssoConfigurationId", "externalGroupName");
CREATE INDEX "group_role_mappings_organizationId_idx" ON "group_role_mappings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "scim_tokens_tokenHash_key" ON "scim_tokens"("tokenHash");
CREATE INDEX "scim_tokens_organizationId_idx" ON "scim_tokens"("organizationId");

-- AddForeignKey
ALTER TABLE "sso_configurations" ADD CONSTRAINT "sso_configurations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_role_mappings" ADD CONSTRAINT "group_role_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_role_mappings" ADD CONSTRAINT "group_role_mappings_ssoConfigurationId_fkey" FOREIGN KEY ("ssoConfigurationId") REFERENCES "sso_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

