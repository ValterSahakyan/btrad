-- AlterTable
ALTER TABLE "BotSettings" ADD COLUMN     "maxSymbolsPerScan" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "minHotScoreForScan" DOUBLE PRECISION NOT NULL DEFAULT 55;

-- CreateIndex
CREATE INDEX "BotLog_createdAt_idx" ON "BotLog"("createdAt");

-- CreateIndex
CREATE INDEX "BotLog_source_idx" ON "BotLog"("source");

-- CreateIndex
CREATE INDEX "MarketSnapshot_symbolId_createdAt_idx" ON "MarketSnapshot"("symbolId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RiskEvent_severity_idx" ON "RiskEvent"("severity");

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE INDEX "Signal_symbolId_idx" ON "Signal"("symbolId");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt");

-- CreateIndex
CREATE INDEX "Trade_signalId_idx" ON "Trade"("signalId");
