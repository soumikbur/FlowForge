# Graph Report - FlowForge  (2026-10-31)

## Corpus Check
- 291 files · ~324,654 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .example 1, .css 1)

## Summary
- 2949 nodes · 5932 edges · 183 communities (167 shown, 16 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 264 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d3a316d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- shared/src/index.ts
- store.ts
- http-api.ts
- extension.service.ts
- api/package.json
- event-delivery.ts
- auth.ts
- FlowForge Enterprise Platform — Release Verification & Quality Assurance Report
- simulation.service.ts
- scripts
- event-streaming.service.ts
- app.ts
- workflows/page.tsx
- workflow.routes.ts
- organization.routes.ts
- web/package.json
- FlowForge — Production Readiness Validation, Disaster Recovery, and Operational Acceptance Report
- ai.service.ts
- builder/page.tsx
- worker/package.json
- semantic-analytics.service.ts
- react
- test-utils/src/index.ts
- database/package.json
- identityService
- validator.ts
- analytics.routes.ts
- FlowForge Enterprise Identity: SSO, SAML 2.0, OIDC, SCIM 2.0, and Session Governance
- next
- InMemoryDatabase
- SettingsPage
- EditorToolbar.tsx
- Role
- integrations/src/index.ts
- aiService
- resourceGovernanceService
- Enterprise Event Streaming, Real-Time Data Integration, and Event-Driven Orchestration
- template.routes.ts
- registry.ts
- FlowForge Enterprise API Platform, OAuth 2.0 Client Credentials & Developer Portal
- integrations/package.json
- workflow-engine/package.json
- ref_crypto
- policyService
- compilerOptions
- entitlementService
- search.service.ts
- NotificationBell
- 2. Core Tables & Field Definitions
- with
- config/package.json
- test-utils/package.json
- portability.ts
- WorkflowExecutionRunner
- validateWorkflowDefinition
- FlowForge — Enterprise SaaS Billing, Subscription Management, and Usage Metering Architecture
- Enterprise Data Governance, Semantic Analytics, and Business Intelligence
- FlowForge Enterprise Platform — Release Certification & Final Production Readiness Report
- config/src/index.ts
- processIntelligenceService
- resilienceService
- FlowForge High Availability, Multi-Region Architecture, and Disaster-Resilient Execution
- shared/package.json
- compilerOptions
- BoundedCache
- process-intelligence.service.ts
- Detailed Task Entries
- FlowForge Architecture
- FlowForge Enterprise Compliance, Audit Governance, Data Retention, and Privacy Controls
- FlowForge Performance Budgets, Service Level Objectives (SLOs), and Resilience Architecture
- complianceService
- policy.service.ts
- FlowForge Policy-as-Code, Automated Governance, and Compliance Enforcement
- FlowForge Workflow Simulation, Test Automation, and Stepwise Debugging
- compliance.routes.ts
- docs.routes.ts
- compliance.service.ts
- redis
- api
- FlowForge Unified Search, Enterprise Data Discovery, and Operational Intelligence
- CollaborationModal.tsx
- worker/src/scheduler.ts
- web
- Enterprise API Reliability, Webhook Security, and Developer Experience
- target_environment
- Quickstart & Local Setup
- api-lifecycle.service.ts
- apiReliabilityService
- billing.provider.ts
- BillingProviderAdapter
- sanitizeAuditMetadata
- oauthService
- api
- postgres
- postgres
- FlowForge REST API Contracts
- Business Process Intelligence, Workflow Optimization, and Predictive Analytics
- Architecture & Overview
- with
- process-intelligence.routes.ts
- compilerOptions
- compilerOptions
- services
- environment
- options
- AI Workflow Copilot, Intelligent Automation, and Governed AI Execution
- 10. Analytics, Monitoring, and Operational Intelligence Endpoints
- FlowForge Platform — Operations & Incident Response Runbook
- jobs
- test-suite
- jobs
- MockBillingAdapter
- templates/page.tsx
- resources
- 16. Workflow Import, Export, Portability, and Backup/Restore API
- FlowForge Platform — Deployment Strategy, Zero-Downtime Rollout & Rollback Guide
- FlowForge Execution State Machine
- postgres
- deploy-production
- circuit-breaker.ts
- CircuitBreaker
- shared-contracts.test.ts
- compareWorkflowDefinitions
- allowBuilds
- policy.routes.ts
- SubscriptionRecord
- test/page.tsx
- NodeHandlerRegistry
- web
- 11. Enterprise Security, Governance, Invitations, API Keys & Retention Endpoints
- 14. Performance, Scalability, Reliability, and Production Hardening Architecture
- FlowForge Platform — Environment Variable Reference Matrix
- create-release-manifest
- config/tsconfig.json
- database/tsconfig.json
- integrations/src/scheduler.ts
- integrations/tsconfig.json
- shared/tsconfig.json
- test-utils/tsconfig.json
- workflow-engine/tsconfig.json
- PolicyViolationRecord
- ExecutionLeaseRecord
- healthcheck
- healthcheck
- worker
- redis
- 14. Workflow Collaboration and Team Productivity API
- FlowForge Workflow Graph JSON Specification
- env
- FlowForgeClient
- .recoverInterruptedExecutions
- build
- build
- networks
- 13. Workflow Templates & Marketplace API
- 15. Enterprise Notifications and Outbound Webhooks API
- 12. Notification & Event Delivery Architecture
- CircuitBreakerError
- FlowForge Deployment & Infrastructure Guide
- RetentionJobRecord
- FlowForge Testing & Quality Strategy
- container-validation
- on
- ScheduleExecutionClaimRecord
- 12. Connectors & Integration Connections API
- 6. Webhooks, Schedules & Integration Credentials Endpoints
- 9. Workflow Versioning, Deployments & Environment Promotion Endpoints
- 13. Workflow Import, Export, Portability, and Backup/Restore Architecture
- 7. Observability, Telemetry, Failure Analysis, and Operational Intelligence Architecture
- 8. Enterprise Security, Governance, and Audit Trail Architecture
- 5. Legal Holds & Preservation Controls
- 9. Operational Runbooks
- build-artifacts
- deploy-staging
- release_version
- .exportAuditLogs
- next.config.js
- verifyWebhookSignature
- development-roadmap.md

## God Nodes (most connected - your core abstractions)
1. `apiStore` - 86 edges
2. `express` - 48 edges
3. `WorkflowDefinition` - 43 edges
4. `app` - 42 edges
5. `Role` - 39 edges
6. `requireAuth()` - 36 edges
7. `react` - 36 edges
8. `WorkflowExecutionRunner` - 36 edges
9. `entitlementService` - 35 edges
10. `lucide-react` - 35 edges

## Surprising Connections (you probably didn't know these)
- `7. Known Limitations & Operational Considerations` --references--> `MockAIProvider`  [INFERRED]
  FlowForge/docs/ai-workflow-copilot-intelligent-automation.md → FlowForge/apps/api/src/services/ai/mock-ai.provider.ts
- `TASK-030: Enterprise Workflow Templates, Reusable Components, and Template Marketplace (Prompt 13)` --references--> `WorkflowTemplate`  [INFERRED]
  FlowForge/docs/agent-task-ledger.md → FlowForge/apps/web/src/app/templates/page.tsx
- `Step 5: Safe Queue Re-hydration & Side-Effect Prevention` --references--> `WorkflowSchedulerService`  [INFERRED]
  FlowForge/docs/disaster-recovery-runbook.md → FlowForge/apps/worker/src/scheduler.ts
- `Disaster Recovery Acceptance Test Evidence` --references--> `decryptCredentialData()`  [INFERRED]
  FlowForge/docs/production-readiness-operational-acceptance.md → FlowForge/packages/integrations/src/credentials.ts
- `12.2 Transactional Outbox Pattern` --references--> `dispatchOutboxEvent()`  [INFERRED]
  FlowForge/docs/architecture.md → FlowForge/packages/integrations/src/event-delivery.ts

## Import Cycles
- None detected.

## Communities (183 total, 16 thin omitted)

### Community 0 - "shared/src/index.ts"
Cohesion: 0.01
Nodes (306): AcceptInvitationRequest, ActivityFilterQuery, AddCollaboratorRequest, AddWorkspaceMemberRequest, AdmissionOutcome, AiProvider, AiProviderEnum, AlertRuleTypeEnum (+298 more)

### Community 1 - "store.ts"
Cohesion: 0.12
Nodes (20): app, authRateLimiter, defaultRateLimiter, executeRateLimiter, RateLimitOptions, RateLimitRecord, rateLimitStore, resetRateLimits() (+12 more)

### Community 2 - "http-api.ts"
Cohesion: 0.07
Nodes (42): RFC-1918, TASK-029: Enterprise Integration Management, Connector Registry, and Secure Credential Lifecycle (Prompt 12), 9.1 Separation of Concerns: Connectors vs Connections, 9.2 Cryptographic Security & Credential Lifecycle, 9. Connector Registry, Integration Architecture, and Credential Security, 5. Outbound Webhooks, SSRF Defense & DLQ State Machine, Dead-Letter Queue (DLQ) Management, Delivery State Machine (+34 more)

### Community 3 - "extension.service.ts"
Cohesion: 0.06
Nodes (38): CustomNodeHandler, extensionService, 10. Preview Upgrade Impact, 11. Upgrade Installed Extension, 12. Execute Custom Node Test / Invocation, 13. Inspect Package Details, 1. Architectural Overview, 1. List Available Extension Packages (+30 more)

### Community 4 - "api/package.json"
Cohesion: 0.05
Nodes (53): dependencies, bcrypt@^5.1.1, cookie-parser@^1.4.7, cors@^2.8.5, express@^4.21.2, @flowforge/config@workspace:*, @flowforge/database@workspace:*, @flowforge/integrations@workspace:* (+45 more)

### Community 5 - "event-delivery.ts"
Cohesion: 0.05
Nodes (41): handleDeliveryReplay(), TASK-032: Prompt 15 — Enterprise Notifications and Event Delivery, 1. Observability Architecture Overview, 2.1 Schema & Field Invariants, 2.2 Sensitive Field Masking, 2. Structured Logging Conventions & Redaction Standards, 3. Workflow Execution Lifecycle Event Stream, 4. Error Taxonomy & Failure Diagnostics (+33 more)

### Community 6 - "auth.ts"
Cohesion: 0.10
Nodes (18): Express, requireAuth(), requirePermission(), brandingRouter, DEFAULT_BRANDING, deleteBrandingHandler(), getBrandingHandler(), getOrgId() (+10 more)

### Community 7 - "FlowForge Enterprise Platform — Release Verification & Quality Assurance Report"
Cohesion: 0.04
Nodes (42): AuditLog, 9. Security, Data Privacy & PCI Compliance Boundaries, 1. Data Classification & Authority, 2.1 Logical Database Backup Script (`cron` daily at 02:00 UTC), 2. Automated Backup Procedures, 3. Step-by-Step Disaster Recovery & Database Restoration, FlowForge Platform — Disaster Recovery & Backup/Restore Runbook, Step 1: Isolate & Provision Clean Target Database (+34 more)

### Community 8 - "simulation.service.ts"
Cohesion: 0.09
Nodes (22): SimulationExecutionOptions, WorkflowSimulationService, AssertionResult, AssertionRule, CompareWorkflowVersionsInput, CreateDebugSessionInput, CreateTestCaseInput, CreateTestFixtureInput (+14 more)

### Community 9 - "scripts"
Cohesion: 0.05
Nodes (42): description, devDependencies, concurrently@^9.1.2, eslint@^9.20.0, prettier@^3.5.0, supertest@^7.0.0, @types/supertest@^6.0.2, typescript@^5.7.3 (+34 more)

### Community 10 - "event-streaming.service.ts"
Cohesion: 0.08
Nodes (23): eventStreamingRouter, dispatchExecutionHandler(), resolveActiveWorkflowVersionId(), eventStreamingService, IngestResult, CanonicalEvent, CanonicalEventSchema, ConnectorSubscriptionRecord (+15 more)

### Community 11 - "app.ts"
Cohesion: 0.06
Nodes (24): idempotencyMiddleware(), rateLimit(), requestDrainingMiddleware(), aiRouter, approvalRouter, billingRouter, credentialRouter, dashboardRouter (+16 more)

### Community 12 - "workflows/page.tsx"
Cohesion: 0.15
Nodes (27): ApprovalItem, ApprovalsPage(), ExecutionDetail, ExecutionDetailPage(), sanitizePayload(), StepRecord, ExecutionRow, ExecutionsPage() (+19 more)

### Community 13 - "workflow.routes.ts"
Cohesion: 0.06
Nodes (31): deprecationNotice(), DeprecationOptions, collaborationRouter, testingGlobalRouter, workflowSimulationRouter, workflowRouter, simulationService, RFC-8594 (+23 more)

### Community 14 - "organization.routes.ts"
Cohesion: 0.07
Nodes (29): Express, Request, requireWorkflowAccess(), resolveWorkflowAccess(), WorkflowAccessContext, WorkflowAccessLevel, licensingRouter, organizationRouter (+21 more)

### Community 15 - "web/package.json"
Cohesion: 0.07
Nodes (37): dependencies, @flowforge/config@workspace:*, @flowforge/shared@workspace:*, @flowforge/workflow-engine@workspace:*, lucide-react@^0.475.0, next@^14.2.24, react@^18.3.1, react-dom@^18.3.1 (+29 more)

### Community 16 - "FlowForge — Production Readiness Validation, Disaster Recovery, and Operational Acceptance Report"
Cohesion: 0.06
Nodes (34): Member, Container Hardening, Disaster Recovery Acceptance Test Evidence, Executive Summary, External Infrastructure Prerequisites for Production Run, FlowForge — Production Readiness Validation, Disaster Recovery, and Operational Acceptance Report, Foreign Key & Referential Integrity Audit, Formal Release Decision (+26 more)

### Community 17 - "ai.service.ts"
Cohesion: 0.14
Nodes (14): AIProvider, ExpressionAssistContext, WorkflowEditContext, WorkflowGenerationContext, FORBIDDEN_EXPRESSION_PATTERNS, MockAIProvider, TASK-023: Workflow Execution Runtime, Node Scheduling, Persistence, and Recovery, AiEditedWorkflowResult (+6 more)

### Community 18 - "builder/page.tsx"
Cohesion: 0.15
Nodes (23): WorkflowBuilderContent(), WorkflowBuilderPage(), WorkflowData, EditorToolbar(), ICON_MAP, NodeConfigPanel(), NodeConfigPanelProps, ICON_MAP (+15 more)

### Community 19 - "worker/package.json"
Cohesion: 0.08
Nodes (30): dependencies, @flowforge/config@workspace:*, @flowforge/database@workspace:*, @flowforge/integrations@workspace:*, @flowforge/shared@workspace:*, @flowforge/test-utils@workspace:*, @flowforge/workflow-engine@workspace:*, devDependencies (+22 more)

### Community 20 - "semantic-analytics.service.ts"
Cohesion: 0.12
Nodes (16): semanticAnalyticsService, RFC-4180, ConnectorMetricItem, CreateSavedReportRequest, DataQualityCheckResult, DataQualityCheckStatus, DataQualityIssue, DataQualityReport (+8 more)

### Community 21 - "react"
Cohesion: 0.08
Nodes (17): ConnectorHealthItem, DataQualityCheck, SavedReportItem, WorkflowRoiItem, PolicyItem, ViolationItem, QuotaPolicyItem, RESOURCE_TYPE_CONFIG (+9 more)

### Community 22 - "test-utils/src/index.ts"
Cohesion: 0.08
Nodes (27): TASK-028: Enterprise Security, Governance, and Organization Administration (Prompt 11), 9.1 Immutability Boundary & Draft Management, 3. Resource Adapters & Data Mapping, BillingWebhookEventRecord, CustomDomainRecord, DeclaredCustomNode, EnterpriseLicenseRecord, ExternalIdentityRecord (+19 more)

### Community 23 - "database/package.json"
Cohesion: 0.09
Nodes (24): dependencies, @prisma/client@^6.3.1, devDependencies, prisma@^6.3.1, tsx@^4.19.2, typescript@^5.7.3, tsx, typescript (+16 more)

### Community 24 - "identityService"
Cohesion: 0.14
Nodes (7): identityService, ScimPatchOpRequest, ScimTokenRecord, ScimUserRequest, SsoConfigurationRecord, SessionRecord, UserRecord

### Community 25 - "validator.ts"
Cohesion: 0.13
Nodes (22): 4. Execution Planning & Branch Semantics, ApprovalNodeConfigSchema, ConditionNodeConfigSchema, ConnectorActionNodeConfigSchema, DelayNodeConfigSchema, EmailNodeConfigSchema, EndNodeConfigSchema, ExtensionNodeConfigSchema (+14 more)

### Community 26 - "analytics.routes.ts"
Cohesion: 0.12
Nodes (22): analyticsRouter, TASK-027: Analytics, Monitoring, and Operational Intelligence (Prompt 10), 7.3 Structured Failure Classification & Security Redaction, AlertRuleType, AlertSeverity, AlertStatus, AnalyticsFilterSchema, CreateSavedReportSchema (+14 more)

### Community 27 - "FlowForge Enterprise Identity: SSO, SAML 2.0, OIDC, SCIM 2.0, and Session Governance"
Cohesion: 0.08
Nodes (24): 10. Operational Acceptance Checklist, 1. Overview, 2.1 Entity Relationship Diagram, 2.2 Schema Definitions, 2. Architecture & Data Model, 3.1 Authentication Workflow, 3. OpenID Connect (OIDC) Implementation, 4.1 Service Provider Endpoints (+16 more)

### Community 28 - "next"
Cohesion: 0.08
Nodes (17): FailureReport, NodePerformance, OperationalTelemetry, OverviewMetrics, TimeBucket, TimeWindow, WorkflowSummary, ApiKeyItem (+9 more)

### Community 29 - "InMemoryDatabase"
Cohesion: 0.09
Nodes (16): FlowForge Agent Task Ledger, TASK-030: Enterprise Workflow Templates, Reusable Components, and Template Marketplace (Prompt 13), TASK-031: Workflow Collaboration, Team Productivity, Discussions, and Activity Feeds (Prompt 14), TASK-033: Workflow Import, Export, Portability, and Backup/Restore (Prompt 16), TASK-034: Performance, Scalability, Reliability, and Production Hardening, TASK-035: End-to-End Integration Testing, Security Audit, and Release QA, TASK-056: Full-System Integration and End-to-End Regression Testing (Prompt 39), TASK-057: Production Readiness, Release Certification, and Final Remediation (Prompt 40) (+8 more)

### Community 30 - "SettingsPage"
Cohesion: 0.15
Nodes (18): SettingsPage(), fetchInitialData(), handleCreateApiKey(), handleCreateConnection(), handleCreateInvitation(), handleCreateWebhook(), handleDeleteWebhook(), handleLoadDeliveries() (+10 more)

### Community 31 - "EditorToolbar.tsx"
Cohesion: 0.12
Nodes (16): ActivityActor, ActivityDrawer(), ActivityDrawerProps, ActivityEvent, CommentAuthor, CommentsDrawer(), handleAddComment(), handleDeleteComment() (+8 more)

### Community 32 - "Role"
Cohesion: 0.10
Nodes (14): Request, authRouter, workspaceRouter, OidcAuthSession, SamlAuthSession, AddWorkspaceMemberSchema, CreateWorkspaceSchema, GroupRoleMappingRecord (+6 more)

### Community 33 - "integrations/src/index.ts"
Cohesion: 0.16
Nodes (11): connectionRouter, connectorRouter, formatConnectionResponse(), WorkflowExecutionRunnerOptions, testConnection(), defaultConnectorRegistry, decryptCredentialData(), deriveKey() (+3 more)

### Community 34 - "aiService"
Cohesion: 0.18
Nodes (10): aiService, redactApiKey(), sanitizePromptText(), scrubSecretsFromText(), AiConfigurationRecord, AssistExpressionRequest, EditWorkflowRequest, ExplainWorkflowRequest (+2 more)

### Community 35 - "resourceGovernanceService"
Cohesion: 0.12
Nodes (13): resourceGovernanceService, 1. Executive Summary & Guarantees, 2. Architecture & Admission Lifecycle, 3. Fair Scheduling (Deficit Round Robin), 4. Runtime Execution Budgets, 5. REST API Reference, 6. Frontend Administration (`/quotas`), Core Guarantees: (+5 more)

### Community 36 - "Enterprise Event Streaming, Real-Time Data Integration, and Event-Driven Orchestration"
Cohesion: 0.10
Nodes (20): 1. Architectural Overview & Data Flow, 2. Canonical Event Envelope Specification, 3. Delivery Semantics & Idempotency, 4. Ordering, Partitioning, and Concurrency, 5. Retry, Dead-Letter Queue (DLQ), and Redrive, 6. Event Replay & Disaster Recovery, 7. Connector Event Subscriptions, 8. REST API Reference (+12 more)

### Community 37 - "template.routes.ts"
Cohesion: 0.14
Nodes (16): extensionRouter, getCaller(), getOrgId(), listPackagesHandler(), upgradePreviewHandler(), getCaller(), getOrgId(), handleSearch() (+8 more)

### Community 38 - "registry.ts"
Cohesion: 0.18
Nodes (13): ExecutionStatus, ConditionOperator, evaluateCondition(), EvaluationContext, interpolateTemplate(), parseLiteralOrPath(), resolvePath(), ENGINE_LIMITS (+5 more)

### Community 39 - "FlowForge Enterprise API Platform, OAuth 2.0 Client Credentials & Developer Portal"
Cohesion: 0.10
Nodes (19): 1. Executive Summary, 2.1 Uniform API Surface & Envelopes, 2.2 Traceability & Correlation Headers, 2. API Architecture & Request Lifecycle, 3.1 User Sessions, 3.2 Enterprise API Keys, 3.3 OAuth 2.0 Machine-to-Machine Client Credentials (RFC 6749), 3. Authentication Mechanisms (+11 more)

### Community 40 - "integrations/package.json"
Cohesion: 0.12
Nodes (19): dependencies, @flowforge/shared@workspace:*, zod@^3.24.2, devDependencies, typescript@^5.7.3, vitest@^3.0.5, @flowforge/shared, typescript (+11 more)

### Community 41 - "workflow-engine/package.json"
Cohesion: 0.12
Nodes (19): dependencies, @flowforge/shared@workspace:*, zod@^3.24.2, devDependencies, typescript@^5.7.3, vitest@^3.0.5, @flowforge/shared, typescript (+11 more)

### Community 42 - "ref_crypto"
Cohesion: 0.15
Nodes (11): handleInboundWebhook(), isSignatureReplayed(), resetSignatureReplayCache(), signatureReplayCache, webhookRouter, defaultEmailService, verifyWebhookSignature(), verifyWebhookSignatureDetailed() (+3 more)

### Community 43 - "policyService"
Cohesion: 0.27
Nodes (3): policyService, PolicyExceptionRecord, PolicyRecord

### Community 44 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 46 - "search.service.ts"
Cohesion: 0.17
Nodes (11): computeScore(), matchesDateRange(), safeSnippet(), searchService, CreateSavedSearchRequest, SavedSearchRecord, SearchableResourceType, SearchMetricsSummary (+3 more)

### Community 47 - "NotificationBell"
Cohesion: 0.17
Nodes (8): metadata, RootLayout(), Navigation(), NotificationBell(), fetchUnreadCount(), markAsRead(), SkipLink(), NotificationResponse

### Community 48 - "2. Core Tables & Field Definitions"
Cohesion: 0.12
Nodes (16): 1. Relational Entity Diagram, 2. Core Tables & Field Definitions, 3. Deletion, Archival & Retention Policy, `approvals`, `audit_logs`, `execution_steps`, FlowForge Database Schema Specification, `integration_credentials` (+8 more)

### Community 49 - "with"
Cohesion: 0.19
Nodes (17): steps, steps, steps, DATABASE_URL, NODE_ENV, env, id, name (+9 more)

### Community 50 - "config/package.json"
Cohesion: 0.14
Nodes (16): dependencies, dotenv@^16.4.7, zod@^3.24.2, devDependencies, typescript@^5.7.3, typescript, zod, main (+8 more)

### Community 51 - "test-utils/package.json"
Cohesion: 0.14
Nodes (16): dependencies, @flowforge/shared@workspace:*, @flowforge/workflow-engine@workspace:*, devDependencies, typescript@^5.7.3, @flowforge/shared, @flowforge/workflow-engine, typescript (+8 more)

### Community 52 - "portability.ts"
Cohesion: 0.19
Nodes (14): handlePromoteWorkflow(), 6.1 Canonical Content Hashing, CompatibilityStatus, FlowForgeWorkflowPackage, FlowForgeWorkflowPackageSchema, WorkflowDependencyManifest, canonicalizeJson(), canonicalizeWorkflowDefinition() (+6 more)

### Community 53 - "WorkflowExecutionRunner"
Cohesion: 0.18
Nodes (3): WorkflowExecutionRunner, 4. Graph Validation & Execution Planning Interaction, resolveNextNodes()

### Community 54 - "validateWorkflowDefinition"
Cohesion: 0.18
Nodes (15): TASK-022: Workflow Graph Validation, Execution Planning & Node Handler Contracts, 10.1 Template Lifecycle & Separation of Concerns, 5. Workflow Engine Package Boundaries, buildExecutionPlan(), tracePaths(), NodeHandler, StepExecutionResult, deepScrubSecrets() (+7 more)

### Community 55 - "FlowForge — Enterprise SaaS Billing, Subscription Management, and Usage Metering Architecture"
Cohesion: 0.13
Nodes (15): 1. Overview & Business Model, 2. Subscription Plans & Entitlements Catalog, 3. Subscription Lifecycle & State Machine, 4. Centralized Entitlement Service (`EntitlementService`), 5. Durable Usage Metering & Concurrency Safety, 8. Usage Visibility & Threshold Notifications, Automatic Notifications, Backend Gating Hooks (+7 more)

### Community 56 - "Enterprise Data Governance, Semantic Analytics, and Business Intelligence"
Cohesion: 0.12
Nodes (15): 1. Executive Summary, 2. Architectural Overview & Canonical Data Model, 3.1 Transparent Financial Model, 3.2 Assumption Versioning & Governance, 3. Automation ROI & Value Realization Framework, 4. Data Quality Assurance & Health Diagnostics, 5. API Platform Endpoints, 6. Web UI Dashboard (+7 more)

### Community 57 - "FlowForge Enterprise Platform — Release Certification & Final Production Readiness Report"
Cohesion: 0.12
Nodes (15): 10. Outstanding Operational Prerequisites (Conditions for Release), 11. Final Release Recommendation, 1. Executive Summary, 2. Ponytail Execution Policy Compliance, 3. Subsystem and Feature Inventory, 4. Production-Readiness Scorecard, 6. Database Migrations and Recovery Strategy, 7. Deployment and Operations Assessment (+7 more)

### Community 58 - "config/src/index.ts"
Cohesion: 0.17
Nodes (10): server, Configuration & Secret Validation, AppConfig, config, envBaseSchema, envSchema, getAppConfig(), redactedConfig() (+2 more)

### Community 59 - "processIntelligenceService"
Cohesion: 0.27
Nodes (4): processIntelligenceService, CreateWorkflowSloRequest, ProcessIntelligenceQuery, WorkflowSloRecord

### Community 61 - "FlowForge High Availability, Multi-Region Architecture, and Disaster-Resilient Execution"
Cohesion: 0.14
Nodes (12): 1. Overview & Resilience Guarantees, 2. Architecture & Topology, 6. Application Health, Readiness & Request Draining, 7. Database Resilience & Transient Retries, 8. Point-in-Time Recovery & Backup Snapshot Verification, 9. API Reference & Operator Endpoints, FlowForge High Availability, Multi-Region Architecture, and Disaster-Resilient Execution, Graceful Draining Sequence (+4 more)

### Community 62 - "shared/package.json"
Cohesion: 0.15
Nodes (14): dependencies, zod@^3.24.2, devDependencies, typescript@^5.7.3, typescript, zod, main, name (+6 more)

### Community 63 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+6 more)

### Community 64 - "BoundedCache"
Cohesion: 0.15
Nodes (5): metricsHandler(), BoundedCache, BoundedCacheOptions, publishedVersionCache, getValidationCacheStats()

### Community 65 - "process-intelligence.service.ts"
Cohesion: 0.18
Nodes (11): 7. Operational Troubleshooting Matrix, AiOperationalInsight, BusinessOutcomeRecord, ProcessAnomalyFinding, ProcessBottleneckFinding, RecordBusinessOutcomeRequest, UpdateWorkflowSloRequest, WorkflowComparisonQuery (+3 more)

### Community 66 - "Detailed Task Entries"
Cohesion: 0.14
Nodes (13): Detailed Task Entries, TASK-001: Repository Audit & Architecture Specifications, TASK-002: Monorepo Foundation & Tooling Setup, TASK-003: Shared Contracts, Validation Schemas & Types, TASK-004: Database Schema, Prisma Client & Migrations, TASK-018: Multi-Tenant Organization Management & RBAC API, TASK-019: Workflow Pagination, Search, Version Snapshots & Audit, TASK-020: Phase 2 Comprehensive Test Suites & Verification (+5 more)

### Community 67 - "FlowForge Architecture"
Cohesion: 0.14
Nodes (13): 10. Workflow Templates, Reusable Components, and Template Marketplace, 11.1 Access Resolution Layer, 11.2 Contextual Discussions and Node Pinning, 11.3 Concurrency & Change Attribution, 11. Workflow Collaboration, Access Roles, and Productivity Architecture, 1. System Overview, 2. Monorepo Structure & Boundaries, 3. Storage & Resilience Guarantees (+5 more)

### Community 68 - "FlowForge Enterprise Compliance, Audit Governance, Data Retention, and Privacy Controls"
Cohesion: 0.14
Nodes (13): 10. Empirical Verification Evidence, 1. Executive Summary & Scope, 3.1 Multi-Dimensional Filtering & Pagination, 3.2 Secure Export & CSV Formula-Injection Defense, 3. Audit Search, Filtering, and Export Governance, 6. Data Classification & Minimization Matrix, 7.1 Supported Request Types, 7.2 Compliant User Deletion & Anonymization (+5 more)

### Community 69 - "FlowForge Performance Budgets, Service Level Objectives (SLOs), and Resilience Architecture"
Cohesion: 0.14
Nodes (13): 1. Executive Summary & Measurement Methodology, 2.1 Availability SLO, 2.2 Latency SLOs (p95 and p99), 2.3 Execution Freshness & Stale Recovery SLO, 2. Service Level Objectives (SLOs) & Service Level Indicators (SLIs), 3. Error Budget & Burn Rate Alerting Rules, 4. Database Query & Schema Optimization, 5.1 Validation Caching (+5 more)

### Community 71 - "policy.service.ts"
Cohesion: 0.22
Nodes (10): evaluateCondition(), evaluateRule(), CreatePolicyExceptionRequest, CreatePolicyRequest, PolicyEvaluationContext, PolicyEvaluationDecision, PolicyRule, PolicyRuleCondition (+2 more)

### Community 72 - "FlowForge Policy-as-Code, Automated Governance, and Compliance Enforcement"
Cohesion: 0.15
Nodes (12): 1. Executive Summary & Guarantees, 2. Architecture & Evaluation Pipeline, 3. Policy Specification & Rule Grammar, 4. Workflow Lifecycle Integration, 6. API Reference, 7. Performance & Caching, Core Guarantees:, Draft Validation (`POST /api/v1/workflows/:id/validate`) (+4 more)

### Community 73 - "FlowForge Workflow Simulation, Test Automation, and Stepwise Debugging"
Cohesion: 0.15
Nodes (12): 1. Executive Summary, 2. Core Architectural Pillars, 3. Test Cases & Assertions, 4. Stepwise Debugging & Breakpoints, 5. Regression Detection & Version Comparison, 6. Pre-Release Publishing Gates, 7. REST API Endpoints, 8. Frontend Lab UI (+4 more)

### Community 74 - "compliance.routes.ts"
Cohesion: 0.20
Nodes (11): auditSearchHandler(), complianceRouter, getOrgId(), resolveCaller(), AuditExportQuerySchema, AuditQuerySchema, CreateLegalHoldSchema, CreatePrivacyRequestSchema (+3 more)

### Community 75 - "docs.routes.ts"
Cohesion: 0.17
Nodes (5): docsRouter, openApiYamlPath, dbPackageDir, __dirname, __filename

### Community 76 - "compliance.service.ts"
Cohesion: 0.23
Nodes (7): ComplianceControlItem, CreateLegalHoldInput, CreatePrivacyRequestInput, LegalHoldRecord, PrivacyRequestRecord, ReleaseLegalHoldInput, ReviewPrivacyRequestInput

### Community 77 - "redis"
Cohesion: 0.17
Nodes (11): container_name, image, networks, restart, volumes, services, redis, version (+3 more)

### Community 78 - "api"
Cohesion: 0.18
Nodes (12): container_name, depends_on, env_file, networks, ports, restart, postgres, redis (+4 more)

### Community 79 - "FlowForge Unified Search, Enterprise Data Discovery, and Operational Intelligence"
Cohesion: 0.17
Nodes (11): 1. Overview & Guarantees, 2. Architecture & Federation Model, 4. Relevance Scoring & Field Attribution, 5. Sensitive Data Redaction & Snippet Generation, 6. Saved Searches Subsystem, 7. Search Observability & Operational Metrics, 8. Web Interface (`/search`), Access Model (+3 more)

### Community 80 - "CollaborationModal.tsx"
Cohesion: 0.27
Nodes (10): CollaborationModal(), handleAddCollaborator(), handleRemoveCollaborator(), handleTransferOwnership(), handleUpdateRole(), loadCollaborators(), CollaborationModalProps, Collaborator (+2 more)

### Community 81 - "worker/src/scheduler.ts"
Cohesion: 0.27
Nodes (4): server, WorkflowSchedulerService, calculateNextScheduleRun(), ScheduleRecord

### Community 82 - "web"
Cohesion: 0.18
Nodes (11): condition, api, NEXT_PUBLIC_API_URL, NODE_ENV, web, container_name, depends_on, environment (+3 more)

### Community 83 - "Enterprise API Reliability, Webhook Security, and Developer Experience"
Cohesion: 0.18
Nodes (10): 1. Executive Summary, 2. Standardized API Error Contract, 3. API Versioning & RFC 8594 Deprecation Lifecycle, 4. Inbound Webhook Security Architecture, 6. Typed SDK & Verification Helpers, 7. Observability & Telemetry, Cryptographic Signature Verification, Deterministic `retryable` Semantics (+2 more)

### Community 84 - "target_environment"
Cohesion: 0.18
Nodes (11): target_environment, on, push, workflow_dispatch, tags, default, description, options (+3 more)

### Community 85 - "Quickstart & Local Setup"
Cohesion: 0.18
Nodes (10): 1. Prerequisites, 2. Installation, 3. Running Automated Tests & Quality Checks, 4. Running the Development Environment, 5. Running with Docker Compose, Architecture Overview, Core Capabilities, FlowForge — Business Workflow Automation Platform (+2 more)

### Community 86 - "api-lifecycle.service.ts"
Cohesion: 0.24
Nodes (6): API_DEPRECATIONS, API_VERSION_INFO, apiLifecycleService, versionNegotiationMiddleware(), ApiDeprecationInfo, ApiVersionInfo

### Community 88 - "billing.provider.ts"
Cohesion: 0.22
Nodes (9): CheckoutSessionResult, CreateCheckoutParams, CreatePortalParams, PortalSessionResult, ProviderSubscriptionDetails, ReconciliationResult, UsageSummary, PlanEntitlements (+1 more)

### Community 89 - "BillingProviderAdapter"
Cohesion: 0.20
Nodes (4): BillingProviderAdapter, 6. Payment Provider Adapter & Webhook Security, Webhook Deduplication, Webhook Signature Verification

### Community 90 - "sanitizeAuditMetadata"
Cohesion: 0.22
Nodes (8): OperationalAlert, 2.1 Structured Audit Schema, 2.2 Sensitive Metadata Sanitization, 2.3 Tamper-Evident SHA-256 Hash Chaining, 2.4 Integrity Verification & Anomaly Detection, 2. Centralized Audit Event Architecture & Tamper-Evident Hash Chaining, Implemented Technical Control Matrix, sanitizeAuditMetadata()

### Community 91 - "oauthService"
Cohesion: 0.27
Nodes (4): OAuthError, oauthService, OAuthClientRecord, OAuthTokenResponse

### Community 92 - "api"
Cohesion: 0.22
Nodes (10): container_name, depends_on, ports, restart, postgres, redis, condition, condition (+2 more)

### Community 93 - "postgres"
Cohesion: 0.20
Nodes (10): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, container_name, environment, image, ports, restart (+2 more)

### Community 94 - "postgres"
Cohesion: 0.20
Nodes (10): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, container_name, environment, image, networks, restart (+2 more)

### Community 95 - "FlowForge REST API Contracts"
Cohesion: 0.20
Nodes (9): 1. Health & Dependency Readiness Endpoints, 2. Authentication & Organization Endpoints, 3. Workflows Endpoints, 4. Workflow Execution Endpoints, 5. Approvals Endpoints, 7. Dashboard & Metrics Endpoints, 8. Workflow Graph Validation Error Codes, FlowForge REST API Contracts (+1 more)

### Community 96 - "Business Process Intelligence, Workflow Optimization, and Predictive Analytics"
Cohesion: 0.20
Nodes (9): 1. Overview & Principles, 2. Process KPI Definitions & Measurement Formulas, 3. Bottleneck Detection Rules & Severity Scoring, 4. Statistical Anomaly Detection Methodology, 5. Workflow Version Comparison & Regression Analysis, 6. Service-Level Objectives (SLOs) & Error Budgets, 7. AI-Assisted Operational Insights & Optimization, 8. REST API Reference (+1 more)

### Community 97 - "Architecture & Overview"
Cohesion: 0.20
Nodes (9): 1. Tenant & Workspace Hierarchy, 2. Workspace Management & Lifecycle, 3. White-Label Custom Branding, 4. Custom Domain Lifecycle & SSL, 5. Enterprise Licensing & Entitlement Overrides, 6. White-Label Event & Email Delivery, 7. API Reference, Architecture & Overview (+1 more)

### Community 98 - "with"
Cohesion: 0.33
Nodes (10): steps, steps, name, run, uses, with, steps, cache (+2 more)

### Community 99 - "process-intelligence.routes.ts"
Cohesion: 0.22
Nodes (6): processIntelligenceRouter, CreateWorkflowSloSchema, ProcessIntelligenceQuerySchema, RecordBusinessOutcomeSchema, UpdateWorkflowSloSchema, WorkflowComparisonQuerySchema

### Community 100 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, declarationMap, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 101 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, declarationMap, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 102 - "services"
Cohesion: 0.22
Nodes (8): services, worker, version, volumes, postgres_data, redis_data, container_name, restart

### Community 103 - "environment"
Cohesion: 0.33
Nodes (9): environment, DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET, NODE_ENV, PORT, REDIS_URL, SESSION_SECRET (+1 more)

### Community 104 - "options"
Cohesion: 0.33
Nodes (9): logging, driver, options, max-file, max-size, logging, logging, logging (+1 more)

### Community 105 - "AI Workflow Copilot, Intelligent Automation, and Governed AI Execution"
Cohesion: 0.22
Nodes (8): 1. Overview & Architectural Principles, 2. Architecture & Service Boundaries, 3. Supported AI Operations & Endpoints, 4. Credential Governance & Provider Abstraction, 5. Safety, Defenses & Prompt Injection Mitigations, 6. Usage Metering & Quota Enforcement, 7. Known Limitations & Operational Considerations, AI Workflow Copilot, Intelligent Automation, and Governed AI Execution

### Community 106 - "10. Analytics, Monitoring, and Operational Intelligence Endpoints"
Cohesion: 0.22
Nodes (9): 10.1 Execution Analytics Overview, 10.2 Time-Series Execution Trends, 10.3 Workflow Performance & Ranking, 10.4 Node-Level Performance & Bottleneck Analysis, 10.5 Structured Failure Analysis & Credential Sanitization, 10.6 Organization Resource & Usage Analytics, 10.7 Operational Infrastructure Telemetry, 10.8 Operational Alerts, Deduplication & Resolution (+1 more)

### Community 107 - "FlowForge Platform — Operations & Incident Response Runbook"
Cohesion: 0.22
Nodes (8): 1. Observability, Metrics & Health Diagnostics, 2. Actionable Prometheus Alert Rules, 3. Incident Triage Procedures, 4. Production Release Checklist, FlowForge Platform — Operations & Incident Response Runbook, Incident 1: API Crash Loop / Startup Failure, Incident 2: Database Connection Exhaustion, Incident 3: Stranded Worker Executions

### Community 108 - "jobs"
Cohesion: 0.22
Nodes (8): concurrency, cancel-in-progress, group, jobs, quality-gates, name, name, runs-on

### Community 109 - "test-suite"
Cohesion: 0.22
Nodes (9): test-suite, image, options, ports, redis, name, needs, runs-on (+1 more)

### Community 110 - "jobs"
Cohesion: 0.22
Nodes (8): concurrency, cancel-in-progress, group, jobs, verify-release, name, name, runs-on

### Community 112 - "templates/page.tsx"
Cohesion: 0.29
Nodes (7): CATEGORIES, DEFAULT_TEMPLATES, TemplatesPage(), filterDefaultTemplates(), loadTemplates(), TemplateVersion, WorkflowTemplate

### Community 113 - "resources"
Cohesion: 0.25
Nodes (8): deploy, resources, cpus, memory, deploy, deploy, limits, deploy

### Community 114 - "16. Workflow Import, Export, Portability, and Backup/Restore API"
Cohesion: 0.25
Nodes (8): 16.1 Package Format (`flowforge.package/v1`), 16.2 Export Endpoints, 16.3 Import & Compatibility Endpoints, 16.4 Provenance & Import History Endpoints, 16.5 Organization Bulk Backup & Restore, 16. Workflow Import, Export, Portability, and Backup/Restore API, FlowForgeBackupPackage, ImportPreviewResponse

### Community 115 - "FlowForge Platform — Deployment Strategy, Zero-Downtime Rollout & Rollback Guide"
Cohesion: 0.25
Nodes (7): 1.1 Rolling Update (Default Strategy), 1.2 Blue-Green Deployment, 1. Supported Deployment Strategies, 2. Multi-Phase Expand / Contract Database Migration Protocol, 3. Automated Rollback Decision Matrix & Triggers, 4. Step-by-Step Application Rollback Procedure, FlowForge Platform — Deployment Strategy, Zero-Downtime Rollout & Rollback Guide

### Community 116 - "FlowForge Execution State Machine"
Cohesion: 0.25
Nodes (7): 1. Execution Lifecycle States, 2. Transition Matrix & Rules, 3. Terminal States & Immutability, 4. Retry Policy & Exponential Backoff, 5. Worker Interruption & Crash Recovery, 6. Step Execution Record States, FlowForge Execution State Machine

### Community 117 - "postgres"
Cohesion: 0.25
Nodes (8): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, env, image, options, ports, postgres

### Community 118 - "deploy-production"
Cohesion: 0.29
Nodes (8): environment, name, needs, runs-on, environment, name, url, deploy-production

### Community 119 - "circuit-breaker.ts"
Cohesion: 0.25
Nodes (3): CircuitBreakerOptions, CircuitBreakerRegistry, CircuitState

### Community 121 - "shared-contracts.test.ts"
Cohesion: 0.25
Nodes (7): ApiResponse, ExecutionStatusEnum, NodeTypeEnum, RoleEnum, WorkflowDefinitionSchema, WorkflowEdgeSchema, WorkflowNodeSchema

### Community 122 - "compareWorkflowDefinitions"
Cohesion: 0.39
Nodes (7): WorkflowEdge, compareObjects(), compareWorkflowDefinitions(), ConfigDiff, NodeComparisonDiff, redactSensitiveValues(), WorkflowComparisonResult

### Community 123 - "allowBuilds"
Cohesion: 0.25
Nodes (7): allowBuilds, bcrypt, esbuild, prisma, @prisma/client, @prisma/engines, packages

### Community 124 - "policy.routes.ts"
Cohesion: 0.29
Nodes (5): policyRouter, CreatePolicyExceptionSchema, CreatePolicySchema, SimulatePolicySchema, UpdatePolicySchema

### Community 125 - "SubscriptionRecord"
Cohesion: 0.29
Nodes (3): 7. Invoices & Billing History, InvoiceRecord, SubscriptionRecord

### Community 126 - "test/page.tsx"
Cohesion: 0.29
Nodes (5): AssertionRule, NodeSimulationResult, PublishingGateEvaluation, SimulationRunResult, WorkflowTestCaseRecord

### Community 128 - "web"
Cohesion: 0.29
Nodes (7): NEXT_PUBLIC_API_URL, web, container_name, depends_on, environment, ports, restart

### Community 129 - "11. Enterprise Security, Governance, Invitations, API Keys & Retention Endpoints"
Cohesion: 0.29
Nodes (7): 11.1 Organization Governance & Settings, 11.2 Member Administration & Last-Owner Protection, 11.3 Secure Member Invitation Lifecycle, 11.4 Scoped API Credentials & Service Access, 11.5 Data Retention & Privacy Controls, 11.6 Rate Limiting & Abuse Controls, 11. Enterprise Security, Governance, Invitations, API Keys & Retention Endpoints

### Community 130 - "14. Performance, Scalability, Reliability, and Production Hardening Architecture"
Cohesion: 0.29
Nodes (7): 14.1 Empirical Baselines & SLO Enforcement, 14.2 Database Composite Indexing, 14.3 Bounded LRU/TTL Validation Caching, 14.4 Multi-Tenant Fair Scheduling & Execution Concurrency Bounds, 14.6 Stale Execution Recovery & RTO/RPO, 14.7 Distributed Tracing & Observability, 14. Performance, Scalability, Reliability, and Production Hardening Architecture

### Community 131 - "FlowForge Platform — Environment Variable Reference Matrix"
Cohesion: 0.29
Nodes (6): 1. Master Environment Configuration Matrix, 2.1 Production & Staging Invariants, 2.2 Development & Test Invariants, 2. Environment Invariants & Enforcement Rules, 3. Browser vs. Server Variable Boundary, FlowForge Platform — Environment Variable Reference Matrix

### Community 132 - "create-release-manifest"
Cohesion: 0.29
Nodes (7): name, needs, outputs, runs-on, create-release-manifest, commit_sha, release_tag

### Community 133 - "config/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 134 - "database/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 135 - "integrations/src/scheduler.ts"
Cohesion: 0.52
Nodes (6): calculateNextCronRun(), getZonedParts(), isValidCron(), isValidTimeZone(), matchField(), validateField()

### Community 136 - "integrations/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 137 - "shared/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 138 - "test-utils/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 139 - "workflow-engine/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 140 - "PolicyViolationRecord"
Cohesion: 0.33
Nodes (4): 5. Exceptions, Overrides, and Violations, Time-Limited Exceptions, Violations Tracking & Drift Management, PolicyViolationRecord

### Community 141 - "ExecutionLeaseRecord"
Cohesion: 0.33
Nodes (4): 3. Distributed Execution Leases & Fencing Tokens, Lease Lifecycle & State Invariants, Operational Rules:, ExecutionLeaseRecord

### Community 142 - "healthcheck"
Cohesion: 0.53
Nodes (6): interval, retries, test, timeout, healthcheck, healthcheck

### Community 143 - "healthcheck"
Cohesion: 0.53
Nodes (6): interval, retries, test, timeout, healthcheck, healthcheck

### Community 144 - "worker"
Cohesion: 0.33
Nodes (6): worker, container_name, deploy, env_file, networks, restart

### Community 145 - "redis"
Cohesion: 0.33
Nodes (6): container_name, image, ports, restart, volumes, redis

### Community 146 - "14. Workflow Collaboration and Team Productivity API"
Cohesion: 0.33
Nodes (6): 14.1 Access Levels & Permission Model, 14.2 Collaborators Management, 14.3 Ownership Transfer, 14.4 Contextual Discussions & Threaded Comments, 14.5 Concurrency Conflict Detection & Activity Feeds, 14. Workflow Collaboration and Team Productivity API

### Community 147 - "FlowForge Workflow Graph JSON Specification"
Cohesion: 0.33
Nodes (5): 1. Specification Overview, 2. Supported Node Types & Semantics, 3. Graph Validation Rules, 5. Engine Safety & Resource Limits, FlowForge Workflow Graph JSON Specification

### Community 148 - "env"
Cohesion: 0.33
Nodes (6): DATABASE_URL, ENCRYPTION_KEY, NODE_ENV, REDIS_URL, SESSION_SECRET, env

### Community 150 - ".recoverInterruptedExecutions"
Cohesion: 0.40
Nodes (3): 5. Uncertain Side-Effect Safety & Step Reconciliation, Operator Reconciliation API, Reconciliation State Taxonomy

### Community 151 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 152 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 153 - "networks"
Cohesion: 0.40
Nodes (5): driver, internal, networks, flowforge-gateway, flowforge-internal

### Community 154 - "13. Workflow Templates & Marketplace API"
Cohesion: 0.40
Nodes (5): 13.1 Template Catalog Discovery, 13.2 Template Retrieval & Lifecycle, 13.3 Immutable Versioning & Comparison, 13.4 Workflow Instantiation, 13. Workflow Templates & Marketplace API

### Community 155 - "15. Enterprise Notifications and Outbound Webhooks API"
Cohesion: 0.40
Nodes (5): 15.1 In-App Notification Center, 15.2 Notification Channel Preferences, 15.3 Outbound Webhook Subscriptions, 15.4 Operational Delivery Metrics, 15. Enterprise Notifications and Outbound Webhooks API

### Community 156 - "12. Notification & Event Delivery Architecture"
Cohesion: 0.40
Nodes (5): 12.1 Canonical Event Contract, 12.2 Transactional Outbox Pattern, 12.3 Recipient Resolution & Self-Action Suppression, 12.4 Secure Outbound Webhooks & SSRF Defense, 12. Notification & Event Delivery Architecture

### Community 157 - "CircuitBreakerError"
Cohesion: 0.40
Nodes (4): 14.5 External Dependency Resilience & Circuit Breakers, 7.1 Circuit Breaker State Machine, 7. External Dependency Resilience & Circuit Breaker, CircuitBreakerError

### Community 158 - "FlowForge Deployment & Infrastructure Guide"
Cohesion: 0.40
Nodes (4): 1. Local Development Quickstart, 2. Docker Compose Deployment, 3. Production Hardening Checklist, FlowForge Deployment & Infrastructure Guide

### Community 159 - "RetentionJobRecord"
Cohesion: 0.40
Nodes (5): 4.1 Categorized Retention Policies, 4.2 Platform Restriction Floors, 4.3 Retention Preview & Background Batch Processing, 4. Policy-Driven Data Retention Framework, RetentionJobRecord

### Community 160 - "FlowForge Testing & Quality Strategy"
Cohesion: 0.40
Nodes (4): 1. Testing Pyramid & Tooling, 2. Test Execution Commands, 3. Workflow Engine Unit & Graph Tests, FlowForge Testing & Quality Strategy

### Community 161 - "container-validation"
Cohesion: 0.40
Nodes (5): name, needs, runs-on, steps, container-validation

### Community 162 - "on"
Cohesion: 0.40
Nodes (5): on, pull_request, push, branches, branches

### Community 163 - "ScheduleExecutionClaimRecord"
Cohesion: 0.50
Nodes (3): 4. Multi-Replica Distributed Scheduler Deduplication, Atomic Schedule Occurrence Claims, ScheduleExecutionClaimRecord

### Community 164 - "12. Connectors & Integration Connections API"
Cohesion: 0.50
Nodes (4): 12.1 Connector Catalog, 12.2 Organization Connections Management, 12. Connectors & Integration Connections API, ConnectionTestResult

### Community 165 - "6. Webhooks, Schedules & Integration Credentials Endpoints"
Cohesion: 0.50
Nodes (4): 6.1 Webhook Triggers & Configuration, 6.2 Scheduled Triggers, 6.3 Integration Credentials, 6. Webhooks, Schedules & Integration Credentials Endpoints

### Community 166 - "9. Workflow Versioning, Deployments & Environment Promotion Endpoints"
Cohesion: 0.50
Nodes (4): 9.2 Semantic Version Comparison, 9.3 Multi-Environment Promotion & Deployments, 9.4 Execution Environment Version Resolution, 9. Workflow Versioning, Deployments & Environment Promotion Endpoints

### Community 167 - "13. Workflow Import, Export, Portability, and Backup/Restore Architecture"
Cohesion: 0.50
Nodes (4): 13.1 Package Design & Deterministic Integrity Hashing, 13.2 Multi-Tenant Isolation & Mapping Enforcement, 13.3 Provenance & Audit Ledger, 13. Workflow Import, Export, Portability, and Backup/Restore Architecture

### Community 168 - "7. Observability, Telemetry, Failure Analysis, and Operational Intelligence Architecture"
Cohesion: 0.50
Nodes (4): 7.1 Statistical Aggregation & Percentile Precision, 7.2 Graph Bottleneck Identification, 7.4 Operational Alerts & 15-Minute Cooldown Deduplication, 7. Observability, Telemetry, Failure Analysis, and Operational Intelligence Architecture

### Community 169 - "8. Enterprise Security, Governance, and Audit Trail Architecture"
Cohesion: 0.50
Nodes (4): 8.1 Dual Authentication & Credential Boundaries, 8.2 Role-Based Access Control (RBAC) Matrix, 8.3 Invariant Guarantees, 8. Enterprise Security, Governance, and Audit Trail Architecture

### Community 170 - "5. Legal Holds & Preservation Controls"
Cohesion: 0.50
Nodes (4): 5.1 Legal Hold Architecture, 5.2 Preservation Enforcement, 5.3 Release Workflow, 5. Legal Holds & Preservation Controls

### Community 171 - "9. Operational Runbooks"
Cohesion: 0.50
Nodes (4): 9.1 Investigating Audit Chain Verification Failures, 9.2 Managing & Releasing Legal Holds, 9.3 Recovering Interrupted Retention Cleanup Jobs, 9. Operational Runbooks

### Community 172 - "build-artifacts"
Cohesion: 0.50
Nodes (4): name, needs, runs-on, build-artifacts

### Community 173 - "deploy-staging"
Cohesion: 0.50
Nodes (4): name, needs, runs-on, deploy-staging

### Community 174 - "release_version"
Cohesion: 0.50
Nodes (4): release_version, description, required, type

## Knowledge Gaps
- **16 isolated node(s):** `RFC-8594`, `RFC-6749`, `RFC-7643`, `RFC-6749`, `RFC-4180` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1243 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `workflows/page.tsx`, `web/package.json`, `templates/page.tsx`, `NotificationBell`, `builder/page.tsx`, `CollaborationModal.tsx`, `next`, `test/page.tsx`, `EditorToolbar.tsx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `RFC-8594`, `RFC-6749`, `RFC-7643` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `shared/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.006514657980456026 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `react` to `workflows/page.tsx`, `web/package.json`, `templates/page.tsx`, `NotificationBell`, `builder/page.tsx`, `CollaborationModal.tsx`, `next`, `test/page.tsx`, `EditorToolbar.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12339544513457557 - nodes in this community are weakly interconnected._
- **Why does `executeSafeHttpRequest()` connect `http-api.ts` to `integrations/src/index.ts`, `event-delivery.ts`, `store.ts`, `FlowForge Enterprise Platform — Release Verification & Quality Assurance Report`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `http-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._