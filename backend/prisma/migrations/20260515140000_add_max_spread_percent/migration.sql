-- Add maxSpreadPercent to BotSettings (previously hardcoded to 0.4 in risk engine)
ALTER TABLE "BotSettings" ADD COLUMN IF NOT EXISTS "maxSpreadPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.4;
