-- Add configurable minimum 24h volume filter to block micro-cap / low-quality coins.
-- Default $5M ensures traded symbols have meaningful liquidity.
ALTER TABLE "BotSettings" ADD COLUMN "minDailyVolumeUsd" DOUBLE PRECISION NOT NULL DEFAULT 5000000;
