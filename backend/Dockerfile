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

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend

EXPOSE 3000

WORKDIR /app/backend

CMD ["sh", "-c", "npx prisma db push && node dist/main.js"]
