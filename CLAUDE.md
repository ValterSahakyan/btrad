# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Install all workspace dependencies (run from repo root)
npm install

# Run backend in watch mode (port 3000)
npm run dev:backend

# Run frontend dev server (port 3001)
npm run dev:frontend
```

### Testing
```bash
# Run all backend tests
npm run test --workspace backend

# Run a single test file
cd backend && npx jest src/indicators/rsi.spec.ts

# Run tests matching a pattern
cd backend && npx jest --testPathPattern="strategy"
```

### Build
```bash
npm run build            # both workspaces
npm --workspace backend run build   # backend only (prisma generate + nest build)
npm --workspace frontend run build  # frontend only
```

### Database
```bash
# Run from repo root — Prisma CLI reads backend/prisma/.env
npm --workspace backend run prisma:generate   # regenerate Prisma client after schema changes
npm --workspace backend run prisma:migrate    # create and apply a migration
```

### Docker
```bash
npm run docker:up    # build and start full stack
npm run docker:down  # stop and remove containers
```

Docker exposes:
- Backend: `localhost:13000` (mapped to container port 3000)
- Frontend: `localhost:13001`
- Postgres: `localhost:5435` (mapped from container 5432)
- Redis: `localhost:6385` (mapped from container 6379)

**Local dev uses port 5435 for Postgres** — other projects occupy 5432 on this machine. The `.env.example` already has this set.

### Prisma env file note
The Prisma CLI uses `backend/prisma/.env` for `DATABASE_URL`. The NestJS process loads `.env` or `../.env` from the backend working directory. Keep both in sync.

### Prisma client on Windows
Running `prisma generate` fails if the backend Node process is already running (DLL file lock). Stop the backend before regenerating.

---

## Architecture

### Stack
- **Backend**: NestJS (port 3000), PostgreSQL via Prisma, Redis + BullMQ for scanner queue
- **Frontend**: Next.js 15 App Router (port 3001), server-side API proxy at `/api/backend/[...path]`
- **Auth**: MetaMask wallet signature (ethers.js). Single authorized wallet set via `DASHBOARD_ALLOWED_WALLET`. Session tokens in Redis, 7-day TTL.
- **Exchange**: Binance USD-M Futures. Dual HTTP clients (testnet + live). Market data always fetched from live endpoint; orders go to whichever mode is active.

### Signal pipeline
```
ScannerScheduler (cron 10s, throttled by scannerIntervalSeconds)
  → ScannerService.runScan()
    → MarketRegimeService (BTC/ETH EMA trend + volatility)
    → Top N symbols by 24h volume
    → Per symbol: 15m + 1h + 4h candles, hotScore, spread
    → StrategySelectorService.evaluateAll() — all 5 strategies ranked by (strategyScore + bias)
    → ConfidenceScoreService (hotScore×0.25 + strategy×0.30 + market×0.20 + liquidity×0.15 + risk×0.10)
    → RiskEngineService.validateSignal() — 9 blockers
    → Signal created (status=active)
    → If requireDashboardConfirmation=false → OrderExecutionService.approveLive()
```

### 5 strategies (`backend/src/strategies/`)
| Strategy | Trigger | Score base | Bias |
|---|---|---|---|
| `breakout_volume` | 1h S/R break + volume spike + bullish candle | 72+ | +5 |
| `pullback_continuation` | EMA20 pullback in trend + RSI zone + pin bar | 74–99 | −2 |
| `exhaustion_reversal` | RSI extreme + VWAP dev + reversal candle + divergence | 74+ | −4 |
| `trend_reclaim` | EMA20 reclaim with OB/FVG confluence | 79+ | +1 |
| `range_bounce` | Swing S/R rejection with multi-touch level | 76+ | +2 |

All strategies require candlestick pattern confirmation (engulfing, pin bar, hammer, marubozu, etc.) and respect 4h trend alignment.

### Indicators (`backend/src/indicators/`)
Standard: `atr`, `ema`, `rsi`, `vwap`, `volume`, `trend`, `breakout`, `support-resistance`

Added: `candlestick-patterns` (Steve Nison patterns), `market-structure` (swing HH/HL, BOS, CHoCH), `fair-value-gap` (ICT FVGs), `order-block` (ICT OBs)

`rsi.ts` also exports `detectRsiDivergence`. `support-resistance.ts` exports both the original `detectSupportResistance` (min/max) and the new `detectSwingLevels` (multi-touch cluster).

### Position monitor (`backend/src/monitor/`)
Runs on a cron schedule. Key responsibilities:
- Reconciles DB trades vs Binance open positions (closes trades that disappeared from exchange)
- **Breakeven trailing stop**: once mark price reaches TP1, cancels original SL and places new one at entry price (in `trailBreakeven()`)
- Enforces `maxHoldingHours` timeout
- Expires stale signals
- Auto-refills open slots when `requireDashboardConfirmation=false`
- Triggers immediate scans to maintain continuous flow

### Risk engine (`backend/src/risk/`)
`PositionSizeService`: `qty = (balance × riskPerTrade%) / stopDistance`, capped by `maxPositionUsd`.
`RiskEngineService`: 9 hard blockers (expired, maxTrades, dailyLoss%, consecutiveLosses, R/R, spread>0.4, no_trade regime, zero qty, notional < min). Daily loss uses `totalBalance` as denominator, not available margin.

### Settings (`backend/src/settings/`)
`session-filter.ts` — London (07–10 UTC) and NY (12–15 UTC) kill zones add +4 to strategy scores; Asian hours (00–07 UTC) subtract 5.
`weekend-settings.ts` — weekend mode overrides (currently placeholder, not active).

### All BotSettings live in the DB
Every strategy threshold, risk limit, and scanner parameter is configurable at runtime from `/settings`. The `buildStrategyConfig()` function in `scanner.service.ts` maps DB rows to the typed `StrategyConfig` interface.

### Frontend API routing
All backend calls go through the Next.js proxy at `frontend/app/api/backend/[...path]/route.ts`, which forwards to the internal backend URL and passes the auth cookie. Direct backend calls from the browser are not used.

### Key environment variables
```
DATABASE_URL            # PostgreSQL connection string
REDIS_URL               # Redis URL for BullMQ + sessions
BINANCE_API_KEY / SECRET
DASHBOARD_AUTH_ENABLED  # set false to skip wallet login locally
DASHBOARD_ALLOWED_WALLET # the only ETH address allowed to log in
FRONTEND_URL            # CORS origin for backend
```
