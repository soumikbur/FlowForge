# FlowForge Platform — Secrets and Credential Lifecycle Architecture

**Classification:** Internal Engineering Standard  
**Document Owner:** Lead Security Architect & SRE Team  
**Milestone:** Prompt 19 — Production Deployment & Release Management

---

## 1. Secrets Inventory & Classification

FlowForge segregates secrets into four distinct security tiers based on blast radius, required entropy, and rotation mechanisms:

|    Tier    | Secret Identifier | Function                                                                                                 | Required Entropy / Format    | Storage & Injection                                   | Rotation Impact                                                                |
| :--------: | :---------------- | :------------------------------------------------------------------------------------------------------- | :--------------------------- | :---------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Tier 1** | `ENCRYPTION_KEY`  | Master symmetric key for encrypting 3rd-party connector tokens (OAuth tokens, API keys) via AES-256-GCM. | 256 bits (64 hex characters) | Cloud KMS / Vault injected as env var                 | Requires batch re-encryption script for stored credentials.                    |
| **Tier 2** | `SESSION_SECRET`  | Cryptographic signature for client session cookies (`flowforge_session`).                                | Min 256 bits (>= 32 chars)   | Environment variable                                  | Existing user sessions invalidated unless dual-key verification is configured. |
| **Tier 2** | `JWT_SECRET`      | Token signing key for internal service-to-service communication.                                         | Min 256 bits (>= 32 chars)   | Environment variable                                  | In-flight worker service tokens expire.                                        |
| **Tier 3** | `DATABASE_URL`    | PostgreSQL connection credentials.                                                                       | Standard connection URI      | Cloud Secret Manager / IAM auth                       | Requires database user credential rotation.                                    |
| **Tier 3** | `REDIS_URL`       | Redis instance password / TLS connection string.                                                         | Standard Redis URI           | Cloud Secret Manager                                  | Requires Redis client reconnection.                                            |
| **Tier 4** | Connector Tokens  | Encrypted third-party API credentials (Stripe, Slack, GitHub, SendGrid).                                 | Variable by provider         | Encrypted in PostgreSQL `IntegrationConnection` table | Managed per-connection via UI or API.                                          |

---

## 2. Key Generation & Cryptographic Standards

Production secrets must be generated using cryptographically secure random number generators (CSPRNG):

```bash
# Generate 256-bit AES-GCM Master Encryption Key (64 hex characters)
openssl rand -hex 32

# Generate Session Secret (32 high-entropy base64 characters)
openssl rand -base64 32

# Generate Internal Service JWT Secret
openssl rand -base64 32
```

---

## 3. Zero-Downtime Secret Rotation Protocols

### 3.1 Session Secret Rotation

To rotate `SESSION_SECRET` without forcing an abrupt logout of all active platform users:

1. Support comma-separated secret array: `SESSION_SECRET="new_secret_key,old_secret_key"`.
2. The primary key (`new_secret_key`) signs all new session cookies.
3. Incoming cookies are verified against `new_secret_key`; if verification fails, fallback verification is performed against `old_secret_key`.
4. After session TTL expires (typically 24 hours), remove `old_secret_key`.

### 3.2 Master Encryption Key Rotation (`ENCRYPTION_KEY`)

Connector credentials in `IntegrationConnection` are encrypted with AES-256-GCM containing a deterministic initialization vector (IV) and authentication tag.
To rotate the master encryption key:

1. Deploy new key as `ENCRYPTION_KEY_NEXT`.
2. Execute the re-encryption maintenance task:
   - Reads each record, decrypts with `ENCRYPTION_KEY`.
   - Encrypts plaintext with `ENCRYPTION_KEY_NEXT`.
   - Atomically updates record in PostgreSQL.
3. Promote `ENCRYPTION_KEY_NEXT` to `ENCRYPTION_KEY` and decommission the retired key.

---

## 4. Log Redaction & Diagnostic Sanitization

1. **Structured Log Redactor:**  
   The centralized configuration module exports `redactedConfig(config)` which systematically replaces `SESSION_SECRET`, `ENCRYPTION_KEY`, and `JWT_SECRET` with `[REDACTED]`, and strips passwords from connection strings (`postgresql://user:********@host:5432/dbname`).
2. **HTTP Payload Redaction:**  
   Outbound HTTP integrations and audit logs strip `Authorization`, `X-Api-Key`, `Cookie`, and `Set-Cookie` headers prior to writing to the execution timeline.

---

## 5. Compromised Credential Emergency Procedure

If a secret is inadvertently committed, leaked, or exposed:

1. **Immediate Revocation:** Rotate the compromised credential in the cloud secret manager.
2. **Container Rolling Restart:** Restart all API and worker replicas to consume the new secret.
3. **Audit Log Inspection:** Query `AuditLog` table for unauthorized actions during the vulnerability window:
   ```sql
   SELECT * FROM "AuditLog" WHERE "createdAt" >= NOW() - INTERVAL '2 hours' ORDER BY "createdAt" DESC;
   ```
4. **Invalidate Active Sessions:** Clear all active Redis session keys (`DEL flowforge:sess:*`).
