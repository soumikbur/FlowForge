# Security Policy

## Supported Versions

Security updates are actively applied to the following release branches:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The FlowForge team takes security vulnerabilities seriously. If you discover a security vulnerability in this project, please follow these steps:

1. **Do not create a public GitHub issue.**
2. Send a confidential report to `security@flowforge.dev` with details of the vulnerability.
3. Include the following information where possible:
   - Type of issue (e.g. SSRF, authentication bypass, privilege escalation, injection)
   - Step-by-step instructions or proof-of-concept to reproduce the defect
   - Affected services (`apps/api`, `apps/worker`, `apps/web`, or shared packages)
   - Potential impact and recommended remediation

## Security Architecture & Invariants

FlowForge enforces several defense-in-depth architectural safeguards:

- **SSRF Protection:** Outbound HTTP connectors validate destination IPs, blocking local subnets (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and cloud metadata endpoints (`169.254.169.254`).
- **Secret Redaction:** Workflow execution logs and step output data undergo automatic redaction of bearer tokens, API keys, and authorization headers.
- **Tenant Isolation:** Multi-tenant database queries enforce organization scoping (`organizationId`), and role-based access control (RBAC) validates all mutating API requests.
- **Cryptographic Standards:** Credential values are encrypted at rest using AES-256-GCM with distinct initialization vectors (IVs) and authentication tags.
