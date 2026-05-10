FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci

COPY backend ./backend

RUN npm --workspace backend run prisma:generate
RUN npm --workspace backend run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup package.json package-lock.json ./
COPY --chown=appuser:appgroup backend/package.json backend/package.json
COPY --chown=appuser:appgroup frontend/package.json frontend/package.json
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/backend ./backend
COPY --chown=appuser:appgroup backend/docker/start.sh /app/backend/docker/start.sh

EXPOSE 3000

WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER appuser

CMD ["sh", "docker/start.sh"]
