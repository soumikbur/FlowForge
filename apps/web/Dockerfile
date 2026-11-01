FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@12.16.1

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @flowforge/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Security & Utilities: wget for health checks & pnpm runtime
RUN apk add --no-cache wget && npm install -g pnpm@12.16.1

# Create unprivileged system group and user
RUN addgroup -g 1001 -S flowforge && \
    adduser -u 1001 -S flowforge -G flowforge

COPY package.json pnpm-workspace.yaml ./
COPY --from=builder --chown=flowforge:flowforge /app/packages/ ./packages/
COPY --from=builder --chown=flowforge:flowforge /app/apps/web/ ./apps/web/
COPY --from=builder --chown=flowforge:flowforge /app/node_modules ./node_modules

USER flowforge

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["pnpm", "--filter", "@flowforge/web", "start"]
