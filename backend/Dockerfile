# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY backend/package.json ./backend/

RUN npm ci --workspaces --include-workspace-root

# Copy source
COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY backend/ ./backend/

# Build shared types then backend
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=backend

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install mediainfo for technical file analysis
RUN apk add --no-cache mediainfo

# Production node_modules only
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY backend/package.json ./backend/

RUN npm ci --workspaces --include-workspace-root --omit=dev

# Copy compiled output
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
