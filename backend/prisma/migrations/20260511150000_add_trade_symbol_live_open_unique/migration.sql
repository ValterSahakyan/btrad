-- Prevents two live_open trades for the same symbol at the DB level.
-- This is the definitive fix for the race condition where two concurrent
-- executions both pass the application-level duplicate check and both
-- succeed in creating a trade record.
--
-- NOTE: If this migration fails with "could not create unique index" it means
-- there are currently duplicate live_open rows for the same symbol. Resolve
-- them on Binance first (close the duplicate position), then re-run.

CREATE UNIQUE INDEX "trades_symbol_live_open_unique"
  ON "Trade"(symbol)
  WHERE status = 'live_open';
