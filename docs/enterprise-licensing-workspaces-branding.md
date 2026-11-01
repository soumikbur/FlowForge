# Enterprise Licensing, White-Labeling, and Multi-Workspace Management

## Architecture & Overview

This subsystem implements enterprise multi-workspace isolation, white-label custom branding, custom domain lifecycle management with automated SSL provisioning, and enterprise license overrides for FlowForge.

### 1. Tenant & Workspace Hierarchy

The top-level tenant boundary remains strictly anchored at the `Organization`. Workspaces reside within an organization, logically segmenting workflows, templates, and team roles while sharing the parent organization's billing, quotas, audit log, and security controls.

```
Organization (Root Tenant Boundary)
 ├── Entitlements & Billing (Plan / Enterprise License)
 ├── Audit Log & Governance Policies
 ├── Brandings (White-Label Configuration)
 ├── Custom Domains (FQDN & TLS Certificates)
 └── Workspaces (Logical Sub-Segmentation)
      ├── Workspace Members & Roles (ADMIN, EDITOR, OPERATOR, VIEWER)
      └── Workflows (workspaceId scope & archival execution guards)
```

### 2. Workspace Management & Lifecycle

- **Default Workspace**: The first workspace created in an organization is automatically marked as default (`isDefault: true`). Default workspaces cannot be archived to prevent orphaned assets.
- **Quota Enforcement**: Creation of workspaces is constrained by `PlanEntitlements.maxWorkspaces`. When the quota is reached, requests return `402 QUOTA_EXCEEDED` unless an Enterprise license override is active.
- **Archival Execution Guard**: Workflows assigned to an archived workspace cannot be executed via `/api/v1/workflows/:id/execute` or promoted between environments, rejecting execution attempts with `403 WORKSPACE_ARCHIVED`. Restoring the workspace immediately re-enables workflow execution.
- **Workspace Roles**: Independent role hierarchy (`ADMIN`, `EDITOR`, `OPERATOR`, `VIEWER`) within each workspace. Users must be confirmed members of the parent organization before joining a workspace.

### 3. White-Label Custom Branding

White-labeling allows organizations to customize platform identity:

- **Custom Product Name & Company Name**
- **Logos & Favicons**
- **Brand Colors**: Primary, secondary, and accent colors validated via strict hex format regex (`#RRGGBB` or `#RGB`).
- **Custom Footer, Support Email, and Documentation URLs**
- **Custom Login Message**
- **Sanitization & Security**: All text fields are sanitized to remove HTML tags and prevent XSS injection attacks.
- **Entitlement Gating**: Custom branding requires `hasWhiteLabel: true` in the organization's effective plan or enterprise license. Attempts to configure branding on unsupported plans are rejected with `403 FEATURE_NOT_IN_PLAN`.
- **Domain Resolution**: `GET /api/v1/branding/resolve?domain=<fqdn>` provides public lookups for custom-branded frontends and login pages.

### 4. Custom Domain Lifecycle & SSL

- **Syntax Validation**: Validates RFC 1035 fully qualified domain names (FQDN) using strict hostname regex.
- **Reserved Apex Protection**: Rejects reserved platform domains (`flowforge.dev`, `flowforge.com`, `localhost`, etc.).
- **Global Uniqueness**: Validates domain uniqueness across the entire platform to prevent subdomain hijacking and tenant spoofing (`409 DOMAIN_ALREADY_REGISTERED`).
- **Verification Challenge**: Generates a cryptographically random verification token (`flowforge-verify=<token>`) for DNS TXT verification.
- **Automated SSL**: Upon challenge verification, domains transition to `VERIFIED` and SSL status transitions to `ACTIVE`.
- **Entitlement Gating**: Requires `hasCustomDomains: true` in effective plan entitlements.

### 5. Enterprise Licensing & Entitlement Overrides

- **License Signature & Key Format**: Validates enterprise license keys (`FF-ENT-...`).
- **Global Key Uniqueness**: Ensures license keys cannot be activated across multiple organizations.
- **Dynamic Entitlement Overrides**: Active enterprise licenses override base subscription limits (e.g., unlimited workspaces, white-labeling, custom seats, custom retention).
- **Graceful Expiration**: Expired licenses automatically fall back to the organization's underlying base subscription or Free tier.

### 6. White-Label Event & Email Delivery

The event delivery outbox subsystem renders tenant branding into outgoing emails:

- Replaces platform sender name and address with `branding.emailSenderName` and `branding.emailSenderAddress`.
- Replaces subject prefix `[FlowForge]` with `[<productName>]`.
- Styles HTML email headers and action buttons with `branding.primaryColor`.
- Appends `branding.customFooterText` to text and HTML notification payloads.

### 7. API Reference

| Method   | Endpoint                                                        | Description                           | Permission               |
| -------- | --------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| `GET`    | `/api/v1/organizations/:orgId/workspaces`                       | List organization workspaces          | `workspace:read`         |
| `POST`   | `/api/v1/organizations/:orgId/workspaces`                       | Create new workspace                  | `workspace:write`        |
| `GET`    | `/api/v1/organizations/:orgId/workspaces/:wsId`                 | Get workspace details                 | `workspace:read`         |
| `PATCH`  | `/api/v1/organizations/:orgId/workspaces/:wsId`                 | Update workspace settings             | `workspace:write`        |
| `POST`   | `/api/v1/organizations/:orgId/workspaces/:wsId/archive`         | Archive workspace                     | `workspace:delete`       |
| `POST`   | `/api/v1/organizations/:orgId/workspaces/:wsId/restore`         | Restore archived workspace            | `workspace:write`        |
| `GET`    | `/api/v1/organizations/:orgId/workspaces/:wsId/members`         | List workspace members                | `workspace:read`         |
| `POST`   | `/api/v1/organizations/:orgId/workspaces/:wsId/members`         | Add/update workspace member           | `workspace:write`        |
| `DELETE` | `/api/v1/organizations/:orgId/workspaces/:wsId/members/:userId` | Remove workspace member               | `workspace:write`        |
| `GET`    | `/api/v1/organizations/:orgId/branding`                         | Get branding configuration            | Public / `branding:read` |
| `GET`    | `/api/v1/branding/resolve?domain=<fqdn>`                        | Resolve branding by domain            | Public                   |
| `PUT`    | `/api/v1/organizations/:orgId/branding`                         | Configure custom branding             | `branding:write`         |
| `DELETE` | `/api/v1/organizations/:orgId/branding`                         | Reset branding to defaults            | `branding:write`         |
| `GET`    | `/api/v1/organizations/:orgId/custom-domains`                   | List registered domains               | `domains:read`           |
| `POST`   | `/api/v1/organizations/:orgId/custom-domains`                   | Register new custom domain            | `domains:write`          |
| `POST`   | `/api/v1/organizations/:orgId/custom-domains/:domainId/verify`  | Verify DNS TXT challenge              | `domains:write`          |
| `DELETE` | `/api/v1/organizations/:orgId/custom-domains/:domainId`         | Delete custom domain                  | `domains:write`          |
| `GET`    | `/api/v1/organizations/:orgId/license`                          | Get enterprise license & entitlements | `licensing:read`         |
| `POST`   | `/api/v1/organizations/:orgId/license`                          | Apply enterprise license key          | `licensing:write`        |
