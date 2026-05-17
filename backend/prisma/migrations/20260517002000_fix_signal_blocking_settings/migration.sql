-- Fix settings that were mutually contradictory and blocking all signals.
--
-- Root causes identified (zero signals produced despite bot running):
--
-- 1. pullbackTp1Multiplier (1.5) < minRiskReward (2.0)
--    Pullback strategy checks: riskReward = (tp1 - entry) / risk = tp1Multiplier
--    So 1.5 < 2.0 → strategy always returned null → zero pullback signals.
--
-- 2. trendReclaimTp2Multiplier (1.8) < minRiskReward (2.0)
--    → strategy always returned null → zero trend_reclaim signals.
--
-- 3. rangeBounceTp2Multiplier (1.6) < minRiskReward (2.0)
--    → strategy always returned null → zero range_bounce signals.
--
-- 4. minConfidenceScore (78) too high for normal market conditions.
--    In typical markets confidence reaches 70-76; only exceptional setups hit 78+.
--
-- 5. defaultLeverage (1) with fixedRoeEnabled=true.
--    Fixed ROE SL/TP formula: distance = roe% / leverage = 20% / 1 = 20%.
--    Requires a 20% price move to close a trade — almost never happens in 15m scans.
--
-- 6. maxPositionUsd ($12) too small.
--    For coins with stepSize 0.001 and price >$12,000, qty rounds to 0
--    → "Invalid position size" → risk engine blocks the signal.

UPDATE "BotSettings"
SET
  "minRiskReward"      = 1.4,
  "minConfidenceScore" = 65,
  "defaultLeverage"    = 3,
  "maxLeverage"        = GREATEST("maxLeverage", 4),
  "maxPositionUsd"     = 50;
