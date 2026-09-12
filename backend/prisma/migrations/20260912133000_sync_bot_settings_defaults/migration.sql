-- Sync BotSettings column DEFAULTs with schema.prisma. These @default values
-- were edited in schema.prisma at some point without a matching migration
-- (same root cause as the missing Trade.failReason migration) — a fresh
-- database's DEFAULT stayed on the old value, so a first-run BotSettings row
-- (created via `create({ data: {} })`) would silently get outdated values.
-- ALTER COLUMN ... SET DEFAULT only changes what future inserts get; it does
-- not touch any existing BotSettings row, so this is safe to run on a
-- database that already has one.
ALTER TABLE "BotSettings"
  ALTER COLUMN "minConfidenceScore"   SET DEFAULT 65,
  ALTER COLUMN "minRiskReward"        SET DEFAULT 2.0,
  ALTER COLUMN "minHotScoreForScan"   SET DEFAULT 45,
  ALTER COLUMN "reversionEnabled"     SET DEFAULT false,
  ALTER COLUMN "minPositionUsd"       SET DEFAULT 5,
  ALTER COLUMN "maxPositionUsd"       SET DEFAULT 20;
