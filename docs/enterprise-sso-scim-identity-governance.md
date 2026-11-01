# FlowForge Enterprise Identity: SSO, SAML 2.0, OIDC, SCIM 2.0, and Session Governance

## 1. Overview

FlowForge provides enterprise identity federation, automated directory provisioning, and session governance designed for zero-trust enterprise IT environments. The identity subsystem integrates with enterprise Identity Providers (Okta, Microsoft Entra ID, Google Workspace, PingFederate, CyberArk, JumpCloud, OneLogin) while preserving FlowForge's multi-tenant isolation, organization boundaries, and role-based access controls.

Key capabilities:

- **OpenID Connect (OIDC)**: PKCE (`S256`), CSRF `state`, and replay-prevention `nonce` tracking with cryptographic ID Token signature validation.
- **SAML 2.0**: Standard SP metadata XML export, signed AuthnRequest generation, XML digital signature verification (RSA-SHA256), audience restrictions, validity window assertions, and assertion ID replay defense.
- **SCIM 2.0 Provisioning (RFC 7643 / RFC 7644)**: Bearer token-authenticated RESTful directory synchronization supporting automated user creation, updates, PatchOp deactivation, and soft deprovisioning.
- **Directory Group-to-Role Mappings**: Automatic synchronization of external directory groups into internal roles (`ADMIN`, `MEMBER`, `VIEWER`) with anti-privilege-escalation rules prohibiting direct `OWNER` assignment.
- **SSO Enforcement & Break-Glass Access**: Configurable enforcement modes (`OPTIONAL`, `ENFORCED`, `STRICT`) with emergency admin bypass lists to prevent administrative lockouts.
- **Session & Token Governance**: Tenant-scoped active session discovery, individual session termination, bulk organization-wide session revocation, and automated session invalidation on directory deprovisioning.

---

## 2. Architecture & Data Model

### 2.1 Entity Relationship Diagram

```
+-------------------------------------------------------+
|                     Organization                      |
+-------------------------------------------------------+
        | 1                                 | 1
        | has                               | has
        v 0..1                              v 0..*
+---------------------------+       +-------------------+
|     SsoConfiguration      |       |     ScimToken     |
+---------------------------+       +-------------------+
        | 1
        | maps
        v 0..*
+---------------------------+
|     GroupRoleMapping      |
+---------------------------+

+-------------------+       1       0..* +----------------------+
|       User        |--------------------|   ExternalIdentity   |
+-------------------+                    +----------------------+
```

### 2.2 Schema Definitions

1. **`SsoConfiguration`**:
   - `id`: Unique identifier (`sso_...`).
   - `organizationId`: Scoped organization tenant ID.
   - `protocol`: `OIDC` or `SAML`.
   - `issuerUrl`: Identity provider issuer URL.
   - `clientId` & `clientSecret`: OAuth/OIDC client credentials (secrets encrypted with AES-256-GCM and masked on retrieval).
   - `metadataXml` & `signingCertificate`: SAML 2.0 identity provider metadata and X.509 certificate.
   - `enforcementMode`: `OPTIONAL` (local & SSO permitted), `ENFORCED` (SSO required; owners & bypass list exempt), or `STRICT` (SSO required; bypass list only).
   - `defaultRole`: Default role assigned to newly provisioned users (`MEMBER` or `VIEWER`).
   - `bypassUserIds`: Emergency break-glass user IDs exempt from SSO enforcement.

2. **`ExternalIdentity`**:
   - `id`: Identifier (`ext_...`).
   - `userId`: FlowForge user ID.
   - `organizationId`: Tenant boundary.
   - `providerId`: SSO Configuration ID or IdP identifier.
   - `externalSubject`: Unique immutable subject ID from the IdP (`sub` or `NameID`).
   - `provisioningSource`: `LOCAL`, `SSO`, `SCIM`, or `INVITATION`.
   - Unique compound constraint: `@@unique([providerId, externalSubject])`.

3. **`GroupRoleMapping`**:
   - `id`: Identifier (`grm_...`).
   - `organizationId` & `ssoConfigurationId`: Parent configuration.
   - `externalGroupName`: Directory group name received in IdP claims/assertions.
   - `targetRole`: Target FlowForge role (`ADMIN`, `MEMBER`, or `VIEWER`). Note: `OWNER` is forbidden to prevent privilege escalation.
   - `workspaceMappings`: Optional workspace-level role assignments.

4. **`ScimToken`**:
   - `id`: Identifier (`sct_...`).
   - `organizationId`: Organization boundary.
   - `tokenHash`: SHA-256 hash of the generated Bearer token.
   - `name`: Description/label for the integration (e.g. "Okta SCIM Sync").
   - `expiresAt`: Optional expiration date.

5. **`User` (Soft Deactivation)**:
   - `active`: Boolean flag indicating whether the user account is active. Soft deactivation disables login and immediately purges active sessions while preserving workflow definitions and execution audit records.

---

## 3. OpenID Connect (OIDC) Implementation

FlowForge implements the OIDC Authorization Code Flow with Proof Key for Code Exchange (PKCE, RFC 7636).

### 3.1 Authentication Workflow

1. **Discovery / Initiation**:
   - Client sends `GET /api/v1/auth/sso/login?organizationId=:id`.
   - FlowForge generates a cryptographically random `code_verifier` (43-128 chars) and computes `code_challenge = BASE64URL-ENCODE(SHA256(code_verifier))`.
   - FlowForge generates a cryptographically random `state` (32 bytes hex) and `nonce` (32 bytes hex).
   - `code_verifier` and `nonce` are cached with an ephemeral TTL (10 minutes) indexed by `state`.
   - Returns the IdP `authorizationUrl` with query parameters: `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile groups`, `state`, `nonce`, `code_challenge`, and `code_challenge_method=S256`.

2. **Authorization Callback**:
   - IdP redirects back to `POST /api/v1/auth/sso/oidc/callback` or `GET /api/v1/auth/sso/oidc/callback` with `code` and `state`.
   - FlowForge validates `state` existence and retrieves cached `code_verifier` and `nonce`.
   - Exchanges `code` and `code_verifier` at IdP token endpoint for `id_token` and `access_token`.

3. **ID Token Verification**:
   - Parses JWT header and payload without trusting claims.
   - Algorithm validation: Rejects `alg: "none"` or unapproved symmetric algorithms; requires RS256 / ES256.
   - Signature validation against IdP public key or JWKS endpoint.
   - Claim assertions:
     - `iss === ssoConfig.issuerUrl`
     - `aud === ssoConfig.clientId`
     - `exp > current_timestamp`
     - `nonce === cached_nonce`

4. **Provisioning & Session Creation**:
   - Checks `ExternalIdentity` by `[providerId, sub]`.
   - If not found, checks existing `User` by `email` and links if found, or provisions a new `User` with `active: true` and `ProvisioningSource: "SSO"`.
   - Resolves group mappings from `groups` claim and applies the highest role precedence (`ADMIN` > `MEMBER` > `VIEWER`).
   - Issues a secure FlowForge session token.

---

## 4. SAML 2.0 Single Sign-On

FlowForge operates as a Service Provider (SP) adhering to the OASIS SAML 2.0 Web Browser SSO Profile.

### 4.1 Service Provider Endpoints

- **SP Metadata XML**: `GET /api/v1/auth/sso/saml/:organizationId/metadata`
  - Generates XML conforming to `urn:oasis:names:tc:SAML:2.0:metadata`.
  - Defines `EntityDescriptor entityID="https://flowforge.domain/api/v1/auth/sso/saml/:orgId/metadata"`.
  - Specifies `AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://flowforge.domain/api/v1/auth/sso/saml/:orgId/acs"`.
- **SP-Initiated Login**: `GET /api/v1/auth/sso/saml/:organizationId/login`
  - Generates `<samlp:AuthnRequest>` with unique `ID="_req_..."`, `IssueInstant`, `Destination`, and `AssertionConsumerServiceURL`.
  - Encodes request and redirects with `SAMLRequest` and `RelayState`.
- **Assertion Consumer Service (ACS)**: `POST /api/v1/auth/sso/saml/:organizationId/acs`
  - Receives `SAMLResponse` and `RelayState`.

### 4.2 Assertion Security & Validation Rules

1. **Digital Signature Verification**: FlowForge validates XML signatures using RSA-SHA256 against the organization's configured IdP X.509 certificate.
2. **Audience Restriction**: Verifies `<saml:Audience>` matches FlowForge's SP Entity ID.
3. **Temporal Validity**:
   - `NotBefore <= current_timestamp + clock_skew_allowance (300s)`
   - `NotOnOrAfter > current_timestamp - clock_skew_allowance (300s)`
4. **Assertion ID Replay Defense**:
   - Tracks processed assertion `ID` attributes.
   - Rejects previously consumed IDs to defend against replay attacks.
5. **Attribute Extraction**:
   - Extracts NameID as `externalSubject`.
   - Maps standard SAML attribute names (e.g. `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`, `http://schemas.xmlsoap.org/claims/group`).

---

## 5. SCIM 2.0 User Provisioning (RFC 7643 / RFC 7644)

The SCIM 2.0 gateway enables centralized identity lifecycle automation from enterprise HR and identity platforms.

### 5.1 Authentication & Isolation

- Base URL: `/api/v1/scim/v2`
- Supported Content-Type: `application/scim+json` and `application/json`.
- Authentication: `Authorization: Bearer <scim_api_token>`
- Token Verification: The Bearer token is SHA-256 hashed and looked up in `ScimToken` table. The token firmly binds all SCIM operations to the issuing `organizationId`.
- Cross-tenant boundaries: Any request with an ID belonging to a different tenant returns `404 NOT_FOUND` or `403 FORBIDDEN`.

### 5.2 Supported Operations

| Method   | Endpoint     | Description                                                                                                             |
| -------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/Users`     | List users with pagination (`startIndex`, `count`) and filter evaluation (`filter=userName eq "..."`).                  |
| `GET`    | `/Users/:id` | Retrieve SCIM user representation by ID.                                                                                |
| `POST`   | `/Users`     | Create a new user with `ProvisioningSource: "SCIM"` and assign default organization membership.                         |
| `PUT`    | `/Users/:id` | Full replacement of user profile attributes.                                                                            |
| `PATCH`  | `/Users/:id` | Apply partial modifications via `urn:ietf:params:scim:api:messages:2.0:PatchOp`. Supports `active: false` deactivation. |
| `DELETE` | `/Users/:id` | Soft deprovisioning: disables account, removes organization membership, and terminates all active sessions.             |

### 5.3 Deprovisioning Safety Guarantees

When a user is deactivated or deleted via SCIM:

1. **Preservation of Workflows**: Workflows authored or owned by the deprovisioned user are retained and remain executable.
2. **Preservation of Audit Trails**: Historical execution steps, approvals, and audit records remain intact with immutable user references.
3. **Immediate Session Invalidation**: All active sessions for the user are immediately revoked, terminating any current browser sessions or API interactions.

---

## 6. Directory Group Synchronization & Role Mappings

Enterprises manage platform authorization at scale using IdP groups.

### 6.1 Configuration & Security Boundaries

- Group mappings are configured via `POST /api/v1/organizations/:id/sso/group-mappings`.
- **Privilege Escalation Defense**: Attempts to map external directory groups to the `OWNER` role are strictly rejected with `400 VALIDATION_FAILED: Directory groups cannot grant OWNER privileges`. Organization ownership transfer must be performed via explicit break-glass administrative action.
- Target roles allowed: `ADMIN`, `MEMBER`, and `VIEWER`.

### 6.2 Precedence Resolution

When a user belongs to multiple external groups, FlowForge evaluates all mapped internal roles and assigns the highest privileged role according to the precedence hierarchy:

$$\text{ADMIN} > \text{MEMBER} > \text{VIEWER}$$

If no groups match, the organization's configured `defaultRole` (typically `MEMBER` or `VIEWER`) is assigned.

---

## 7. SSO Enforcement & Emergency Break-Glass Access

FlowForge allows administrators to mandate SSO login while protecting against identity provider outages.

### 7.1 Enforcement Modes

| Mode       | Behavior                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPTIONAL` | Users can log in using either local password credentials or enterprise SSO.                                                                     |
| `ENFORCED` | Local password login is blocked (`403 SSO_REQUIRED`). Only users in the `bypassUserIds` list or organization `OWNER`s may log in with password. |
| `STRICT`   | Local password login is blocked for all users except those explicitly listed in `bypassUserIds`.                                                |

### 7.2 Emergency Break-Glass Runbook

In the event of an upstream IdP outage (e.g. Okta outage, expired IdP signing certificate):

1. **Break-Glass Exemption**:
   - Users listed in `bypassUserIds` continue to authenticate via `POST /api/v1/auth/login`.
   - The break-glass login triggers a durable audit log event:
     ```json
     {
       "action": "auth.sso.bypass_login",
       "organizationId": "org_123",
       "userId": "usr_breakglass",
       "metadata": { "reason": "Emergency Break-Glass Exemption" }
     }
     ```
2. **Deactivating SSO**:
   - An authenticated administrator or break-glass user calls `DELETE /api/v1/organizations/:id/sso`.
   - SSO is immediately disabled and enforcement mode resets to `OPTIONAL`.
   - Organization members can immediately log in using their primary credentials.

---

## 8. Session & Token Governance

FlowForge gives enterprise administrators real-time visibility and control over active user sessions.

### 8.1 Administrative Endpoints

- **List Active Sessions**: `GET /api/v1/organizations/:id/sessions`
  - Returns all active sessions belonging to organization members, including user details, IP address, user agent, last activity timestamp, and expiration.
- **Terminate Individual Session**: `DELETE /api/v1/organizations/:id/sessions/:sessionId`
  - Terminates a specific member session. The target user is instantly signed out on their next request.
- **Revoke All Organization Sessions**: `POST /api/v1/organizations/:id/sessions/revoke-all`
  - Terminates all active sessions across the organization.
  - Supports `keepCurrentSession: true` to prevent the executing administrator from terminating their own active session.

---

## 9. Comprehensive Audit Trail

All identity, SSO, SCIM, and session events are durably recorded in the FlowForge Audit Log:

| Action                             | Description                                                                |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `auth.sso.login_success`           | Successful SSO login via OIDC or SAML.                                     |
| `auth.sso.login_failure`           | Failed SSO attempt (signature failure, invalid claims, expired assertion). |
| `auth.sso.configured`              | SSO settings created or updated.                                           |
| `auth.sso.deactivated`             | SSO configuration disabled.                                                |
| `auth.sso.bypass_login`            | Emergency break-glass local login executed.                                |
| `auth.scim.user_created`           | User auto-provisioned via SCIM directory sync.                             |
| `auth.scim.user_updated`           | User attributes updated via SCIM.                                          |
| `auth.scim.user_deactivated`       | User soft-deprovisioned and sessions revoked via SCIM.                     |
| `session.administratively_revoked` | Single session terminated by admin.                                        |
| `session.all_organization_revoked` | Organization-wide mass session revocation.                                 |
| `sso.group_mapping_created`        | Directory group mapping created or updated.                                |

---

## 10. Operational Acceptance Checklist

- [x] OIDC Authorization Code Flow with PKCE (`S256`), state/nonce verification, and RS256 signature validation.
- [x] SAML 2.0 SP metadata XML generation, AuthnRequest creation, ACS XML signature validation, audience check, and assertion replay defense.
- [x] SCIM 2.0 User Provisioning (RFC 7643 / RFC 7644) with Bearer token authentication and strict tenant boundary isolation.
- [x] SCIM PatchOp soft deactivation (`active: false`) and deprovisioning with immediate session invalidation and workflow preservation.
- [x] Directory group synchronization to `ADMIN`, `MEMBER`, and `VIEWER` with privilege escalation prevention (`OWNER` prohibited).
- [x] Configurable SSO enforcement modes (`OPTIONAL`, `ENFORCED`, `STRICT`) with emergency break-glass exemptions.
- [x] Session governance API for listing, individual termination, and bulk organization revocation.
- [x] Durable audit event logging for all identity, SSO, SCIM, and session actions.
- [x] 100% automated test pass rate across 22 integration tests in `tests/integration/enterprise-sso-scim-identity.test.ts`.
- [x] Monorepo zero-regression baseline: 543/543 tests passing across 35 test files.
