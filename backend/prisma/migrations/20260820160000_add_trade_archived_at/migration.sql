-- Add archivedAt to Trade so "Clear Closed" archives instead of hard-deleting.
-- Previously clearClosed() permanently deleted rows via deleteMany; this is
-- the fix for that data-loss path — closed trades are now hidden from the
-- Trades list (archivedAt IS NULL filter) but retained for /performance and
-- CSV export, which query Trade without an archivedAt filter.
-- IF NOT EXISTS on both statements: the CD deploy script deletes unfinished
-- _prisma_migrations rows and does `git reset --hard` before every deploy, so a
-- migration that half-applied on a failed deploy must be safe to re-run. Every
-- other migration in this repo follows the same convention.
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Trade_archivedAt_idx" ON "Trade"("archivedAt");
