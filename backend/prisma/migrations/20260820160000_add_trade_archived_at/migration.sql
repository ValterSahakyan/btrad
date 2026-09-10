-- Add archivedAt to Trade so "Clear Closed" archives instead of hard-deleting.
-- Previously clearClosed() permanently deleted rows via deleteMany; this is
-- the fix for that data-loss path — closed trades are now hidden from the
-- Trades list (archivedAt IS NULL filter) but retained for /performance and
-- CSV export, which query Trade without an archivedAt filter.
ALTER TABLE "Trade" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Trade_archivedAt_idx" ON "Trade"("archivedAt");
