# PerpScout AI

PerpScout AI is a dashboard-first Binance USDⓈ-M Futures trading bot MVP focused on scanning hot markets, filtering by market regime, generating high-quality breakout signals, enforcing risk controls, and requiring manual dashboard approval before paper or live execution.

This software is not financial advice. Use at your own risk. Start with Testnet. Never enable withdrawal permission. Use small capital only after testing.

## Risk Warning

Futures trading is high-risk. The default mode is `testnet`, real trading is disabled by default, and live execution requires all of the following:

- `ENABLE_REAL_TRADING=true`
- `BINANCE_MODE=live`
- Manual approval from the dashboard
- Passing risk checks
- Trading not paused
- Daily loss limit not reached
- Signal not expired

Never use Binance API withdrawal permission. Enable read permission and futures trading permission only. Use IP whitelisting.

## Features

- NestJS backend with modular trading services
- Prisma + PostgreSQL data model for settings, symbols, snapshots, signals, trades, orders, logs, and risk events
- Redis + BullMQ scanner queue
- Binance USDⓈ-M Futures testnet/live service abstraction
- Hot market scanner and BTC/ETH market regime filter
- Breakout + volume confirmation strategy
- Confidence scoring engine and risk validation
- Manual dashboard approval for paper trades and live-prepared execution flow
- Next.js dashboard for overview, hot coins, signals, trades, performance, settings, and logs
- Jest unit tests for indicators, scoring, sizing, expiration, and simulation logic

## Architecture

`Hot Market Scanner -> Market Regime Filter -> Strategy Selector -> Signal Scoring Engine -> Risk Engine -> Dashboard Review -> Manual Approval -> Paper/Live Execution -> Trade Journal`

## Setup Requirements

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Binance USDⓈ-M Futures API keys

## Binance Testnet Setup

1. Create Binance Futures testnet credentials.
2. Keep withdrawal permission disabled.
3. Enable read and futures trading permissions only.
4. Add IP whitelist rules before moving beyond local testing.
5. Set `BINANCE_MODE=testnet` and `ENABLE_REAL_TRADING=false`.

## Binance API Key Setup

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`

Do not store secrets in source control. Do not log API secrets.

## Environment Variables

Copy `.env.example` to `.env` and fill in values.

Frontend API calls use `NEXT_PUBLIC_API_BASE_URL`. For local Docker, keep it as `http://localhost:3000/api`.

## Database Setup

1. Create a PostgreSQL database.
2. Set `DATABASE_URL`.
3. Run `npm install`.
4. Run `npm --workspace backend run prisma:generate`
5. Run `npm --workspace backend run prisma:migrate`

## Redis Setup

Set `REDIS_URL` to a reachable Redis instance for BullMQ scanner jobs.

## Run Locally

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

## Run With Docker

```bash
copy .env.example .env
npm run docker:up
```

Services:

- Frontend: `http://localhost:3001`
- Backend API: `http://localhost:3000/api`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The backend container runs `prisma db push` on startup so the schema is applied automatically for this MVP.

Stop the stack with:

```bash
npm run docker:down
```

## Run Workers

The MVP wires BullMQ through the backend process. A dedicated worker process can be split later from the scanner module.

## Run Frontend

```bash
npm run dev:frontend
```

## Run With PM2

```bash
pm2 start npm --name perpscout-backend -- run dev:backend
pm2 start npm --name perpscout-frontend -- run dev:frontend
```

## Deploy On VPS

1. Provision PostgreSQL and Redis.
2. Clone the repo and configure `.env`.
3. Run Prisma migrations.
4. Build backend and frontend.
5. Run behind Nginx with PM2 or Docker.
6. Keep `BINANCE_MODE=testnet` until paper trading is validated.

## CI/CD

- `.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
- CI installs dependencies, generates the Prisma client, builds both workspaces, runs tests, and verifies both Docker images build.
- `.github/workflows/cd.yml` publishes backend and frontend container images to GitHub Container Registry (`ghcr.io`) on pushes to `main`, tags matching `v*`, or manual dispatch.

If you want automated server deployment, add a separate workflow that pulls the published GHCR images onto your target host and injects production secrets there.

## Signal-Only Mode

Keep paper trading enabled but do not approve trades. Use the Signals page for review only.

## Paper Trading Mode

Approve signals with `Approve Paper Trade` from the dashboard. Paper trades are simulated and journaled without placing real exchange orders.

## Dashboard Approval Mode

Order execution is manual by design in the MVP. Signals must be approved from the dashboard before paper or live execution flows run.

## Safely Switch To Live Mode

1. Validate signals in testnet and paper mode first.
2. Set `ENABLE_REAL_TRADING=true`.
3. Set `BINANCE_MODE=live`.
4. Restart the backend.
5. Verify dashboard warnings and risk rules.
6. Use small capital only after repeated successful dry runs.

## API Key Security Checklist

- Withdrawal permission disabled
- Read and futures trading only
- IP whitelist enabled
- Separate keys for testnet and live
- Rotate keys on suspicion of compromise
- Never commit secrets

## Roadmap

- Dedicated worker process
- Live execution hardening
- Advanced pullback and exhaustion strategies
- Websocket market streams
- Trade analytics and optimization reports
- RBAC and stronger dashboard auth
