-- AlterTable approvals
ALTER TABLE "approvals" ADD COLUMN "assignedUserId" TEXT;
ALTER TABLE "approvals" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "approvals" ADD COLUMN "timeoutPolicy" TEXT DEFAULT 'REJECT';

-- CreateIndex
CREATE INDEX "approvals_assignedUserId_idx" ON "approvals"("assignedUserId");
CREATE INDEX "approvals_expiresAt_idx" ON "approvals"("expiresAt");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
