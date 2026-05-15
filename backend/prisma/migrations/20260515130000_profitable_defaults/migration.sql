-- Update existing BotSettings rows to profitable defaults for live trading.
-- reversionEnabled=false: mean reversion is counter-trend and unsuitable for small accounts.
-- minRiskReward=2.0: at 40% win rate, 1.5 RR loses money after fees; 2.0 provides margin of safety.
UPDATE "BotSettings" SET
  "reversionEnabled" = false,
  "minRiskReward" = 2.0,
  "maxOpenTrades" = CASE WHEN "maxOpenTrades" > 3 THEN 2 ELSE "maxOpenTrades" END,
  "maxDailyLossPercent" = CASE WHEN "maxDailyLossPercent" > 5 THEN 2.0 ELSE "maxDailyLossPercent" END,
  "riskPerTradePercent" = CASE WHEN "riskPerTradePercent" > 2 THEN 1.0 ELSE "riskPerTradePercent" END,
  "minPositionUsd" = CASE WHEN "minPositionUsd" < 5 THEN 5.0 ELSE "minPositionUsd" END,
  "maxPositionUsd" = CASE WHEN "maxPositionUsd" > 15 THEN 15.0 ELSE "maxPositionUsd" END;

UPDATE "BotSettings" SET
  "sessionModeEnabled" = true,
  "tradingWindowStartHourUtc" = 7,
  "tradingWindowEndHourUtc" = 16
WHERE "sessionModeEnabled" = false;
