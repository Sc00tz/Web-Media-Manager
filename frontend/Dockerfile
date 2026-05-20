# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY frontend/package.json ./frontend/

RUN npm ci --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY frontend/ ./frontend/

RUN npm run build --workspace=packages/types
RUN npm run build --workspace=frontend

# ── Runtime stage (nginx) ───────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/ || exit 1
