# FlowForge Deployment & Infrastructure Guide

## 1. Local Development Quickstart

1. Clone repository and navigate to `FlowForge`.
2. Copy environment template: `cp .env.example .env`.
3. Install dependencies: `pnpm install`.
4. Run migrations: `pnpm db:migrate`.
5. Seed demo fixtures: `pnpm db:seed`.
6. Start dev processes: `pnpm dev` (launches web, api, and worker concurrently).

## 2. Docker Compose Deployment

FlowForge includes production-grade container specifications:

- `docker-compose.yml`: Spins up PostgreSQL 16, Redis 7, API service, Background Worker, and Next.js Web frontend.
- Run: `docker compose up --build -d`

## 3. Production Hardening Checklist

- Configure strong random values for `SESSION_SECRET`, `ENCRYPTION_KEY`, and `JWT_SECRET`.
- Enable TLS / HTTPS on all ingress endpoints.
- Configure PostgreSQL connection pooling and read replicas for high throughput.
- Configure Redis cluster / Sentinel for queue durability.
- Restrict outbound network egress for worker nodes to prevent unauthorized lateral network calls.
