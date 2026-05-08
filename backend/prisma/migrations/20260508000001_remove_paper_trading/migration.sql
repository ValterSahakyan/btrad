-- Migration: remove_paper_trading
-- Convert any existing paper records to safe alternatives before dropping enum values

UPDATE "Signal" SET status = 'cancelled' WHERE status = 'paper_opened';
UPDATE "Trade" SET status = 'manually_closed' WHERE status IN ('paper_open', 'paper_closed');

-- AlterEnum: SignalStatus — drop paper_opened
ALTER TABLE "Signal" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "SignalStatus_new" AS ENUM ('pending', 'active', 'approved', 'skipped', 'expired', 'live_executed', 'failed', 'cancelled');
ALTER TABLE "Signal" ALTER COLUMN "status" TYPE "SignalStatus_new" USING "status"::text::"SignalStatus_new";
DROP TYPE "SignalStatus";
ALTER TYPE "SignalStatus_new" RENAME TO "SignalStatus";
ALTER TABLE "Signal" ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterEnum: TradeStatus — drop paper_open, paper_closed (TradeStatus has no default)
CREATE TYPE "TradeStatus_new" AS ENUM ('live_open', 'live_closed', 'stopped', 'take_profit', 'manually_closed', 'failed');
ALTER TABLE "Trade" ALTER COLUMN "status" TYPE "TradeStatus_new" USING "status"::text::"TradeStatus_new";
DROP TYPE "TradeStatus";
ALTER TYPE "TradeStatus_new" RENAME TO "TradeStatus";

-- AlterTable: drop paperTradingEnabled from BotSettings
ALTER TABLE "BotSettings" DROP COLUMN "paperTradingEnabled";
