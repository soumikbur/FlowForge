-- CreateIndex
CREATE INDEX "workflows_organizationId_deletedAt_updatedAt_idx" ON "workflows"("organizationId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "workflows_organizationId_status_updatedAt_idx" ON "workflows"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "workflow_executions_status_updatedAt_idx" ON "workflow_executions"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "workflow_executions_organizationId_workflowId_status_createdAt_idx" ON "workflow_executions"("organizationId", "workflowId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "execution_steps_executionId_startedAt_idx" ON "execution_steps"("executionId", "startedAt");

-- CreateIndex
CREATE INDEX "workflow_comments_workflowId_createdAt_idx" ON "workflow_comments"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_organizationId_status_createdAt_idx" ON "outbox_events"("organizationId", "status", "createdAt");

