FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@12.16.1

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter "./packages/*" build
RUN pnpm --filter @flowforge/worker build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Security & Utilities: wget for health checks
RUN apk add --no-cache wget

# Create unprivileged system group and user
RUN addgroup -g 1001 -S flowforge && \
    adduser -u 1001 -S flowforge -G flowforge

COPY package.json pnpm-workspace.yaml ./
COPY --from=builder --chown=flowforge:flowforge /app/packages/ ./packages/
COPY --from=builder --chown=flowforge:flowforge /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=flowforge:flowforge /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=flowforge:flowforge /app/node_modules ./node_modules

USER flowforge

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

CMD ["node", "apps/worker/dist/index.js"]
