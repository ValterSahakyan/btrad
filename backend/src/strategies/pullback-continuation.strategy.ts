import { Injectable } from '@nestjs/common';
import { clamp } from '../common/utils/math';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectCandlePatterns } from '../indicators/candlestick-patterns';
import { ema } from '../indicators/ema';
import { priceNearOrderBlock, detectOrderBlocks } from '../indicators/order-block';
import { rsi, detectRsiDivergence } from '../indicators/rsi';
import { detectTrend } from '../indicators/trend';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { sessionScoreAdjustment } from '../settings/session-filter';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class PullbackContinuationStrategy implements TradingStrategy {
  readonly name = 'pullback_continuation';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.pullback;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h, candles4h } = context;
    if (candles15m.length < 60 || candles1h.length < 60) return null;

    const closes15m = candles15m.map((c) => c.close);
    const closes1h = candles1h.map((c) => c.close);
    const currentPrice = closes15m[closes15m.length - 1] ?? 0;
    const lastCandle = candles15m[candles15m.length - 1];
    const prevCandle = candles15m[candles15m.length - 2];
    const prev2Candle = candles15m[candles15m.length - 3];
    if (!lastCandle || !prevCandle || !prev2Candle) return null;

    const htfTrend = detectTrend(candles1h);
    if (htfTrend === 'sideways') return null;

    // 4h alignment (Elder Triple Screen — only enter with 4h backing)
    const htf4Trend = candles4h && candles4h.length >= 50 ? detectTrend(candles4h) : null;
    if (htf4Trend !== null && htf4Trend !== htfTrend && htf4Trend !== 'sideways') return null;

    const ema20arr = ema(closes15m, 20);
    const ema50arr = ema(closes15m, 50);
    const ema20 = ema20arr[ema20arr.length - 1] ?? currentPrice;
    const ema50 = ema50arr[ema50arr.length - 1] ?? currentPrice;
    const ema20Prev = ema20arr[ema20arr.length - 2] ?? ema20;
    const ema50Prev = ema50arr[ema50arr.length - 2] ?? ema50;
    const atr14 = atr(candles15m, 14);
    const rsiValues = rsi(closes15m, 14);
    const currentRsi = rsiValues[rsiValues.length - 1] ?? 50;
    const ema20_1h = ema(closes1h, 20)[closes1h.length - 1] ?? currentPrice;
    const ema50_1h = ema(closes1h, 50)[closes1h.length - 1] ?? currentPrice;
    const volumes15m = candles15m.map((c) => c.volume);
    const avgVolume = volumeAverage(volumes15m, 20);
    const volumeRatio = volumeSpike(volumes15m[volumes15m.length - 1] ?? 0, avgVolume);

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.5) return null;

    const pullbackDistance = Math.abs(currentPrice - ema20);
    const recentPullbackLow = Math.min(lastCandle.low, prevCandle.low);
    const recentPullbackHigh = Math.max(lastCandle.high, prevCandle.high);
    const trendStrengthAtr = Math.abs(ema20 - ema50) / atr14;
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = Math.max(lastCandle.high - lastCandle.low, atr14 * 0.1);
    const candleBodyRatio = lastCandleBody / lastCandleRange;

    // Candlestick patterns on the reclaim candle (Steve Nison / Al Brooks)
    const patterns = detectCandlePatterns(candles15m);

    // RSI divergence check (Alexander Elder — confirms pullback is not a reversal)
    const divergence = detectRsiDivergence(closes15m, rsiValues);

    // Order blocks on 15m (ICT — institutional re-entry zones)
    const obs = detectOrderBlocks(candles15m);

    // Session bonus
    const sessionAdj = sessionScoreAdjustment();

    // Two-legged pullback detection (Al Brooks — a-b-c structure is more reliable)
    // The pullback has two distinct legs if prev2 low was above prevCandle low for LONG
    // (price went lower in two steps, now reclaiming — cleaner setup)
    const twoLeggedPullbackLong = prev2Candle.low > prevCandle.low && prevCandle.low <= ema20 + atr14 * 0.3;
    const twoLeggedPullbackShort = prev2Candle.high < prevCandle.high && prevCandle.high >= ema20 - atr14 * 0.3;

    const bullishStructure =
      ema20 > ema50 &&
      ema20 > ema20Prev &&
      ema50 >= ema50Prev &&
      ema20_1h > ema50_1h;
    const bearishStructure =
      ema20 < ema50 &&
      ema20 < ema20Prev &&
      ema50 <= ema50Prev &&
      ema20_1h < ema50_1h;

    // ── LONG ──────────────────────────────────────────────────────────────────
    if (
      htfTrend === 'bullish' &&
      bullishStructure &&
      currentPrice > ema50_1h &&
      currentRsi >= Math.max(cfg.rsiLongMin, 45) &&
      currentRsi <= Math.min(cfg.rsiLongMax, 65) &&
      pullbackDistance >= atr14 * 0.05 &&
      pullbackDistance <= cfg.atrMultiplier * atr14 * 0.85 &&
      recentPullbackLow <= ema20 + atr14 * 0.2 &&
      trendStrengthAtr >= 0.24 &&
      currentPrice > ema50 &&
      currentPrice >= ema20 &&
      lastCandle.close > lastCandle.open &&
      lastCandle.close >= prevCandle.close &&
      candleBodyRatio >= 0.5 &&
      volumeRatio >= 0.9 &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade' &&
      // Require a bullish confirmation: formal pattern OR body that dominates the range
      (patterns.pinBarBullish || patterns.hammer || patterns.bullishEngulfing || patterns.bullishMarubozu || candleBodyRatio >= 0.55)
    ) {
      // Reject if RSI bearish divergence is present (price continuing higher but RSI not)
      if (divergence.bearishDivergence) return null;

      const swingLow = Math.min(...candles15m.slice(-6).map((c) => c.low));
      const stopLoss = Math.min(swingLow - atr14 * 0.2, ema50 - atr14 * 0.25);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice + risk * cfg.tp2Multiplier;
      const riskReward = (takeProfit1 - currentPrice) / risk;
      if (riskReward + 1e-6 < context.minRiskReward) return null;

      const nearBullOb = priceNearOrderBlock(currentPrice, obs.filter((ob) => ob.type === 'bullish'), atr14);
      const obBonus = nearBullOb ? 5 : 0;
      const twoLegBonus = twoLeggedPullbackLong ? 4 : 0;
      const patternBonus = patterns.bullishEngulfing ? 5 : patterns.pinBarBullish || patterns.hammer ? 3 : 0;
      const divergenceBonus = divergence.bullishDivergence ? 3 : 0;

      return {
        symbol: context.symbol,
        direction: 'LONG',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        strategyScore: scorePullbackSetup({
          hotScore: context.hotScore,
          trendStrengthAtr,
          candleBodyRatio,
          rsi: currentRsi,
          pullbackDistanceAtr: pullbackDistance / atr14,
          bonuses: obBonus + twoLegBonus + patternBonus + divergenceBonus + sessionAdj,
        }),
        reasonList: [
          'Bullish 1h structure aligned above EMA20/EMA50',
          `Pullback tagged 15m EMA20 (${ema20.toFixed(4)}) and reclaimed with a strong close`,
          `RSI ${currentRsi.toFixed(1)} in continuation pocket${divergence.bullishDivergence ? ' + bullish divergence' : ''}`,
          `Candle: ${patterns.bullishEngulfing ? 'engulfing' : patterns.pinBarBullish ? 'pin bar' : patterns.hammer ? 'hammer' : 'strong body'} — ${candleBodyRatio.toFixed(2)} ratio`,
          `Volume ${volumeRatio.toFixed(1)}x${twoLeggedPullbackLong ? ' | two-legged pullback' : ''}${nearBullOb ? ' | near OB' : ''}`,
          ...(htf4Trend ? [`4h trend: ${htf4Trend}`] : []),
        ],
        invalidationRules: [
          '15m close back below EMA20',
          '1h EMA20 loses EMA50',
          `RSI drops below ${cfg.rsiLongMin - 3}`,
        ],
      };
    }

    // ── SHORT ─────────────────────────────────────────────────────────────────
    if (
      htfTrend === 'bearish' &&
      bearishStructure &&
      currentPrice < ema50_1h &&
      currentRsi >= Math.max(cfg.rsiShortMin, 42) &&
      currentRsi <= Math.min(cfg.rsiShortMax, 58) &&
      pullbackDistance >= atr14 * 0.05 &&
      pullbackDistance <= cfg.atrMultiplier * atr14 * 0.85 &&
      recentPullbackHigh >= ema20 - atr14 * 0.2 &&
      trendStrengthAtr >= 0.24 &&
      currentPrice < ema50 &&
      currentPrice <= ema20 &&
      lastCandle.close < lastCandle.open &&
      lastCandle.close <= prevCandle.close &&
      candleBodyRatio >= 0.5 &&
      volumeRatio >= 0.9 &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade' &&
      (patterns.pinBarBearish || patterns.shootingStar || patterns.bearishEngulfing || patterns.bearishMarubozu || candleBodyRatio >= 0.55)
    ) {
      if (divergence.bullishDivergence) return null;

      const swingHigh = Math.max(...candles15m.slice(-6).map((c) => c.high));
      const stopLoss = Math.max(swingHigh + atr14 * 0.2, ema50 + atr14 * 0.25);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice - risk * cfg.tp2Multiplier;
      const riskReward = (currentPrice - takeProfit1) / risk;
      if (riskReward + 1e-6 < context.minRiskReward) return null;

      const nearBearOb = priceNearOrderBlock(currentPrice, obs.filter((ob) => ob.type === 'bearish'), atr14);
      const obBonus = nearBearOb ? 5 : 0;
      const twoLegBonus = twoLeggedPullbackShort ? 4 : 0;
      const patternBonus = patterns.bearishEngulfing ? 5 : patterns.pinBarBearish || patterns.shootingStar ? 3 : 0;
      const divergenceBonus = divergence.bearishDivergence ? 3 : 0;

      return {
        symbol: context.symbol,
        direction: 'SHORT',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        strategyScore: scorePullbackSetup({
          hotScore: context.hotScore,
          trendStrengthAtr,
          candleBodyRatio,
          rsi: 100 - currentRsi,
          pullbackDistanceAtr: pullbackDistance / atr14,
          bonuses: obBonus + twoLegBonus + patternBonus + divergenceBonus + sessionAdj,
        }),
        reasonList: [
          'Bearish 1h structure aligned below EMA20/EMA50',
          `Pullback tagged 15m EMA20 (${ema20.toFixed(4)}) and rejected with a strong close`,
          `RSI ${currentRsi.toFixed(1)} in continuation pocket${divergence.bearishDivergence ? ' + bearish divergence' : ''}`,
          `Candle: ${patterns.bearishEngulfing ? 'engulfing' : patterns.pinBarBearish ? 'pin bar' : patterns.shootingStar ? 'shooting star' : 'strong body'} — ${candleBodyRatio.toFixed(2)} ratio`,
          `Volume ${volumeRatio.toFixed(1)}x${twoLeggedPullbackShort ? ' | two-legged pullback' : ''}${nearBearOb ? ' | near OB' : ''}`,
          ...(htf4Trend ? [`4h trend: ${htf4Trend}`] : []),
        ],
        invalidationRules: [
          '15m close back above EMA20',
          '1h EMA20 reclaims EMA50',
          `RSI breaks above ${cfg.rsiShortMax + 3}`,
        ],
      };
    }

    return null;
  }
}

function scorePullbackSetup(input: {
  hotScore: number;
  trendStrengthAtr: number;
  candleBodyRatio: number;
  rsi: number;
  pullbackDistanceAtr: number;
  bonuses: number;
}): number {
  const trendBonus = Math.min(8, Math.max(0, (input.trendStrengthAtr - 0.18) * 12));
  const candleBonus = Math.min(7, Math.max(0, (input.candleBodyRatio - 0.45) * 20));
  const rsiBonus = Math.max(0, 6 - Math.abs(input.rsi - 50) * 0.4);
  const pullbackBonus = Math.max(0, 5 - Math.abs(input.pullbackDistanceAtr - 0.35) * 8);
  const hotScoreBonus = Math.max(0, Math.min(4, (input.hotScore - 55) / 10));

  return Math.round(
    clamp(74 + trendBonus + candleBonus + rsiBonus + pullbackBonus + hotScoreBonus + input.bonuses, 74, 99),
  );
}
