-- CreateEnum
CREATE TYPE "BotMode" AS ENUM ('testnet', 'live');

-- CreateEnum
CREATE TYPE "SignalDirection" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('pending', 'active', 'approved', 'skipped', 'expired', 'paper_opened', 'live_executed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('paper_open', 'paper_closed', 'live_open', 'live_closed', 'stopped', 'take_profit', 'manually_closed', 'failed');

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" TEXT NOT NULL,
    "mode" "BotMode" NOT NULL DEFAULT 'testnet',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "realTradingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requireDashboardConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "paperTradingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultLeverage" INTEGER NOT NULL DEFAULT 3,
    "maxLeverage" INTEGER NOT NULL DEFAULT 5,
    "riskPerTradePercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxDailyLossPercent" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 2,
    "maxConsecutiveLosses" INTEGER NOT NULL DEFAULT 3,
    "minConfidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "minRiskReward" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "scannerIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "signalExpirationMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Symbol" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "minNotional" DOUBLE PRECISION NOT NULL,
    "quantityPrecision" INTEGER NOT NULL,
    "pricePrecision" INTEGER NOT NULL,
    "stepSize" DOUBLE PRECISION NOT NULL,
    "tickSize" DOUBLE PRECISION NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume24h" DOUBLE PRECISION NOT NULL,
    "priceChange24h" DOUBLE PRECISION NOT NULL,
    "fundingRate" DOUBLE PRECISION NOT NULL,
    "openInterest" DOUBLE PRECISION NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "hotScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "direction" "SignalDirection" NOT NULL,
    "strategy" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "positionSize" DOUBLE PRECISION NOT NULL,
    "riskReward" DOUBLE PRECISION NOT NULL,
    "hotScore" DOUBLE PRECISION NOT NULL,
    "marketScore" DOUBLE PRECISION NOT NULL,
    "strategyScore" DOUBLE PRECISION NOT NULL,
    "liquidityScore" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "reasonJson" JSONB NOT NULL,
    "invalidationJson" JSONB NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "symbol" TEXT NOT NULL,
    "direction" "SignalDirection" NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL,
    "margin" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "status" "TradeStatus" NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "binanceOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "rawResponseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Symbol_symbol_key" ON "Symbol"("symbol");

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
