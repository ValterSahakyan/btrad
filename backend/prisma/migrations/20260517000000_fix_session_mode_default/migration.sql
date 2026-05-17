-- Disable the trading-window hard block for all existing records.
-- sessionModeEnabled=true was the schema default, silently blocking scans
-- outside 07:00-16:00 UTC. Default is now false (24/7 scanning).
UPDATE "BotSettings"
SET
  "sessionModeEnabled"        = false,
  "tradingWindowStartHourUtc" = 0,
  "tradingWindowEndHourUtc"   = 24;

ALTER TABLE "BotSettings" ALTER COLUMN "sessionModeEnabled"        SET DEFAULT false;
ALTER TABLE "BotSettings" ALTER COLUMN "tradingWindowStartHourUtc" SET DEFAULT 0;
ALTER TABLE "BotSettings" ALTER COLUMN "tradingWindowEndHourUtc"   SET DEFAULT 24;
