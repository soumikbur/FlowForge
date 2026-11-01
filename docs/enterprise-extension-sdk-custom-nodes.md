# FlowForge Enterprise Extension SDK, Custom Nodes, and Governed Integration Ecosystem

## 1. Architectural Overview

FlowForge provides a secure, extensible, enterprise-grade extension architecture enabling authorized developers to author, validate, package, install, configure, execute, update, and retire custom workflow nodes and third-party extensions.

```
+----------------------------------------------------------------------------------------------------+
|                                    FlowForge Extension Ecosystem                                   |
+----------------------------------------------------------------------------------------------------+
                                                   |
                        1. Package Authoring & Deterministic Packaging
                                                   v
                       +------------------------------------------------------+
                       | Extension Manifest (`ExtensionManifestSchema`)        |
                       | - SemVer Package Metadata & Verified Publisher       |
                       | - Declared Custom Nodes (Inputs/Outputs Schema)      |
                       | - Capability Allowlist Requests (connectors, creds)  |
                       | - SHA-256 Package Integrity Hashing                  |
                       +------------------------------------------------------+
                                                   |
                        2. Administrative Review & Approval
                                                   v
                       +------------------------------------------------------+
                       | Extension Package Registry (`ExtensionPackageRecord`)|
                       | - DRAFT -> SUBMITTED -> APPROVED / REJECTED          |
                       | - Global Public vs. Tenant-Scoped Private Packages   |
                       +------------------------------------------------------+
                                                   |
                        3. Tenant Installation & Capability Allowlisting
                                                   v
                       +------------------------------------------------------+
                       | Organization Installation (`ExtensionInstallation`)  |
                       | - Explicit Capability Granting (Principle of Least   |
                       |   Privilege: connectors:invoke, credentials:read)    |
                       | - Active vs. Suspended State Control                 |
                       +------------------------------------------------------+
                                                   |
                        4. Workflow Engine & Visual Builder Integration
                                                   v
                       +------------------------------------------------------+
                       | Canonical Workflow Engine (`WorkflowValidator`)      |
                       | - Native `EXTENSION_NODE` Node Type Support          |
                       | - Schema Validation & Registry Metadata              |
                       +------------------------------------------------------+
                                                   |
                        5. Governed Sandboxed Execution & Upgrade Analytics
                                                   v
                       +------------------------------------------------------+
                       | Sandboxed Runtime (`ExtensionService.executeCustom`)  |
                       | - Execution Timeout Limits (configurable max 300s)   |
                       | - 512KB Max Serialization Protection                 |
                       | - Zero-Exposure Credential Resolution                |
                       | - Breaking Change Upgrade Preview & Migration        |
                       +------------------------------------------------------+
```

---

## 2. Extension Manifest Specification

Every extension bundle defines an `ExtensionManifest` governed by `ExtensionManifestSchema`:

```typescript
export interface ExtensionManifest {
  id: string; // Lowercase alphanumeric with dash, underscore, dot (e.g. acme.data-transformer)
  name: string; // Human-readable extension name
  description: string; // High-level functional description
  version: string; // Strict SemVer (X.Y.Z)
  manifestSchemaVersion: string; // Default "1.0"
  publisher: {
    id: string;
    name: string;
    email: string;
    verified?: boolean;
  };
  supportedFlowForgeVersions: string; // e.g. ">=1.0.0"
  runtime: "declarative" | "sandboxed-js";
  declaredCapabilities: ExtensionCapability[];
  requiredConnectors?: string[];
  declaredNodeTypes: DeclaredCustomNode[];
  packageIntegrityHash?: string;
  license: string;
  documentationUrl?: string;
}
```

### Declared Custom Node Specification

```typescript
export interface DeclaredCustomNode {
  nodeType: string; // Unique node identifier (e.g. xmlToJson)
  label: string; // Display name in visual workflow builder
  category?: string; // Palette group: Transform, Logic, Security, Integrations
  description?: string;
  inputs?: number; // Inbound edge count (default 1)
  outputs?: number | "branching"; // Outbound edge count (default 1)
  inputSchema?: Record<string, unknown>; // JSON Schema defining parameters
  outputSchema?: Record<string, unknown>; // JSON Schema defining output data
  deprecated?: boolean;
}
```

---

## 3. Capability-Based Security Allowlist

Extensions operate under a strict, capability-based security model. Manifests declare requested capabilities, but capabilities are **never granted automatically**. Organization administrators explicitly review and grant capabilities during installation:

| Capability          | Scope & Restrictions                                                                   | Risk Mitigations                                                                                        |
| :------------------ | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `connectors:invoke` | Allows custom node to execute registered FlowForge connector operations                | Must route through existing connector policies and audit controls                                       |
| `credentials:read`  | Allows custom node to receive decrypted credentials for a specified `connectionId`     | Credentials are decrypted only at execution time in memory; never exposed in API responses or manifests |
| `context:read`      | Access execution metadata (workflow ID, execution ID, organization ID, correlation ID) | Read-only access to execution trace headers                                                             |
| `events:emit`       | Allows custom node to emit asynchronous business events                                | Validated against event catalog schemas                                                                 |
| `network:http`      | Outbound HTTP requests from custom script runtime                                      | Enforces FlowForge SSRF rules (blocks loopback, cloud metadata, private subnets)                        |
| `logging:write`     | Structured execution logs emission                                                     | Bounded memory logging with redaction                                                                   |

Attempting an operation without its corresponding granted capability halts execution immediately with `CAPABILITY_DENIED` (HTTP 403).

---

## 4. Developer SDK & Node Execution Contract

Custom nodes adhere to the standardized `CustomNodeHandler` interface:

```typescript
export type CustomNodeHandler = (
  parameters: Record<string, unknown>,
  context: NodeExecutionContext,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface NodeExecutionContext {
  organizationId: string;
  executionId: string;
  stepId: string;
  correlationId: string;
  credentials?: Record<string, unknown>;
  logger: {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}
```

### Runtime Protections

1. **Deterministic Package Integrity**: Submissions calculate a cryptographic SHA-256 package hash (`packageIntegrityHash`) verifying manifest and bundle immutability.
2. **Execution Timeouts**: Node executions are bounded by configurable execution timeouts (`timeoutSeconds`, capped at 300s). Timed-out executions fail gracefully with `EXECUTION_TIMEOUT`.
3. **Payload Buffering Limits**: Outputs are constrained to 512KB. Oversized serialized outputs fail with `OUTPUT_SIZE_EXCEEDED` to prevent worker memory exhaustion.
4. **Zero Secret Exposure**: Credentials are never serialized to manifests, database package tables, or REST API responses.

---

## 5. Workflow Engine & Builder Integration

### Canonical Workflow Node Configuration

Workflows integrate custom nodes using the `EXTENSION_NODE` type:

```json
{
  "id": "node_ext_parser",
  "type": "EXTENSION_NODE",
  "name": "Parse XML Customer Data",
  "config": {
    "extensionId": "ext_pkg_transformer",
    "nodeType": "xmlToJson",
    "version": "1.0.0",
    "connectionId": "conn_optional_cred_id",
    "parameters": {
      "xmlData": "<customer><id>C-1234</id></customer>"
    }
  },
  "position": { "x": 200, "y": 150 }
}
```

The canonical `validateWorkflowDefinition` strictly validates `ExtensionNodeConfigSchema` within the workflow graph, ensuring valid node configuration before execution plans are generated.

---

## 6. Upgrade Impact Preview & Regression Detection

Before applying an upgrade, tenant administrators can invoke the Upgrade Impact Preview API:

`GET /api/v1/organizations/:organizationId/extensions/installed/:extensionId/upgrade-preview?targetVersion=2.0.0`

The preview computes:

- `isCompatible`: Boolean indicating whether breaking changes exist.
- `addedNodeTypes`: Newly introduced custom node types.
- `removedNodeTypes`: Node types removed in the target version.
- `newCapabilitiesRequired`: Capabilities newly requested by the extension.
- `affectedWorkflowCount`: Count of tenant workflows utilizing removed or modified nodes.
- `affectedWorkflows`: Detailed list containing workflow ID, name, and affected node types.

---

## 7. REST API Reference

All routes require authentication via Session Bearer token or API Key.

### 1. List Available Extension Packages

- **Path**: `GET /api/v1/organizations/:organizationId/extensions/catalog`
- **Permissions**: `extensions:read`
- **Query Params**: `status` (e.g. `PUBLISHED`)
- **Response**: Array of `ExtensionPackageRecord` (enforces multi-tenant isolation; private extensions from other orgs are omitted).

### 2. Submit Extension Package

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/submit`
- **Permissions**: `extensions:submit` or `extensions:write`
- **Payload**:
  ```json
  {
    "manifest": { ... },
    "packageIntegrityHash": "optional-sha256-string",
    "isPublic": true,
    "releaseNotes": "Initial release"
  }
  ```
- **Response (201)**: `ExtensionPackageRecord` with status `SUBMITTED`.

### 3. Review Extension Package

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/:id/review`
- **Permissions**: `extensions:admin`
- **Payload**:
  ```json
  {
    "decision": "APPROVED",
    "comment": "Passed security review and AST capability scan."
  }
  ```
- **Response (200)**: `ExtensionPackageRecord` updated to `PUBLISHED` or `REJECTED`.

### 4. Install Extension Package

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/:id/install`
- **Permissions**: `extensions:admin` or `org:write`
- **Payload**:
  ```json
  {
    "version": "1.0.0",
    "grantedCapabilities": ["connectors:invoke", "credentials:read"]
  }
  ```
- **Response (201)**: `ExtensionInstallationRecord` with status `ACTIVE`.

### 5. List Installed Extensions

- **Path**: `GET /api/v1/organizations/:organizationId/extensions/installed`
- **Permissions**: `extensions:read`
- **Response (200)**: Array of installed extension records.

### 6. Get Installed Extension Details

- **Path**: `GET /api/v1/organizations/:organizationId/extensions/installed/:extensionId`
- **Permissions**: `extensions:read`
- **Response (200)**: Single `ExtensionInstallationRecord`.

### 7. Suspend Installed Extension

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/installed/:extensionId/suspend`
- **Permissions**: `extensions:admin`
- **Response (200)**: Installation status updated to `SUSPENDED`.

### 8. Reactivate Installed Extension

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/installed/:extensionId/reactivate`
- **Permissions**: `extensions:admin`
- **Response (200)**: Installation status restored to `ACTIVE`.

### 9. Uninstall Extension

- **Path**: `DELETE /api/v1/organizations/:organizationId/extensions/installed/:extensionId`
- **Permissions**: `extensions:admin`
- **Response (200)**: `{ "deleted": true, "message": "Extension uninstalled successfully." }`.

### 10. Preview Upgrade Impact

- **Path**: `GET /api/v1/organizations/:organizationId/extensions/installed/:extensionId/upgrade-preview?targetVersion=2.0.0`
- **Path (Alternative)**: `POST /api/v1/organizations/:organizationId/extensions/installed/:extensionId/upgrade-preview`
- **Permissions**: `extensions:read`
- **Response (200)**: `UpgradePreviewResult`.

### 11. Upgrade Installed Extension

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/installed/:extensionId/upgrade`
- **Permissions**: `extensions:admin`
- **Payload**: `{ "targetVersion": "2.0.0" }`
- **Response (200)**: `ExtensionInstallationRecord` updated with `installedVersion: "2.0.0"`.

### 12. Execute Custom Node Test / Invocation

- **Path**: `POST /api/v1/organizations/:organizationId/extensions/execute/:extensionId/:nodeType`
- **Permissions**: `workflow:execute` or `extensions:write`
- **Payload**:
  ```json
  {
    "parameters": { "xmlData": "<data>payload</data>" },
    "connectionId": "cred_xyz_123",
    "timeoutSeconds": 30
  }
  ```
- **Response (200)**: `{ "success": true, "data": { ... } }`.
- **Response (403)**: `CAPABILITY_DENIED` or `EXTENSION_SUSPENDED`.

### 13. Inspect Package Details

- **Path**: `GET /api/v1/organizations/:organizationId/extensions/:id`
- **Permissions**: `extensions:read`
- **Response (200)**: Full package details with version history.
