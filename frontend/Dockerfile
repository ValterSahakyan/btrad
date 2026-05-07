FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci

COPY frontend ./frontend

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm --workspace frontend run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend ./frontend

EXPOSE 3001

WORKDIR /app/frontend

CMD ["npm", "run", "start"]
