ALTER TYPE "TradeStatus" ADD VALUE 'time_stop';

ALTER TABLE "BotSettings"
ADD COLUMN "maxHoldingHours" INTEGER NOT NULL DEFAULT 0;
