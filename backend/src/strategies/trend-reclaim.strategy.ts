import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectCandlePatterns } from '../indicators/candlestick-patterns';
import { ema } from '../indicators/ema';
import { detectFairValueGaps, priceInFvg } from '../indicators/fair-value-gap';
import { detectOrderBlocks, priceNearOrderBlock } from '../indicators/order-block';
import { rsi } from '../indicators/rsi';
import { detectTrend } from '../indicators/trend';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { sessionScoreAdjustment } from '../settings/session-filter';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class TrendReclaimStrategy implements TradingStrategy {
  readonly name = 'trend_reclaim';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.trendReclaim;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h, candles4h } = context;
    if (candles15m.length < 60 || candles1h.length < 60) return null;

    const closes15m = candles15m.map((c) => c.close);
    const closes1h = candles1h.map((c) => c.close);
    const volumes15m = candles15m.map((c) => c.volume);
    const currentPrice = closes15m[closes15m.length - 1] ?? 0;
    const lastCandle = candles15m[candles15m.length - 1];
    const prevCandle = candles15m[candles15m.length - 2];
    if (!lastCandle || !prevCandle) return null;

    const ema20arr = ema(closes15m, 20);
    const ema50arr = ema(closes15m, 50);
    const ema20 = ema20arr[ema20arr.length - 1] ?? currentPrice;
    const ema50 = ema50arr[ema50arr.length - 1] ?? currentPrice;
    const ema20Prev = ema20arr[ema20arr.length - 2] ?? ema20;
    const ema20_1h = ema(closes1h, 20)[closes1h.length - 1] ?? currentPrice;
    const ema50_1h = ema(closes1h, 50)[closes1h.length - 1] ?? currentPrice;
    const atr14 = atr(candles15m, 14);
    const currentRsi = rsi(closes15m, 14).at(-1) ?? 50;
    const avgVolume = volumeAverage(volumes15m, 20);
    const volumeRatio = volumeSpike(volumes15m[volumes15m.length - 1] ?? 0, avgVolume);
    const htfTrend = detectTrend(candles1h);

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.45) return null;
    if (htfTrend === 'sideways') return null;

    // 4h alignment — strongest when all three timeframes agree
    const htf4Trend = candles4h && candles4h.length >= 50 ? detectTrend(candles4h) : null;
    if (htf4Trend !== null && htf4Trend !== htfTrend && htf4Trend !== 'sideways') return null;

    const reclaimBand = atr14 * cfg.emaBufferAtr;
    const trendStrengthAtr = Math.abs(ema20 - ema50) / atr14;
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = Math.max(lastCandle.high - lastCandle.low, atr14 * 0.1);
    const candleBodyRatio = lastCandleBody / lastCandleRange;

    // Candle patterns on the reclaim bar (Steve Nison — confirm the reclaim with a pattern)
    const patterns = detectCandlePatterns(candles15m);

    // Order blocks — reclaiming into an OB is institutional confirmation (ICT)
    const obs15m = detectOrderBlocks(candles15m);

    // FVGs on 1h — price filling a FVG on reclaim = extra confluence (ICT)
    const fvgs1h = detectFairValueGaps(candles1h);

    // Session bonus
    const sessionAdj = sessionScoreAdjustment();

    const volumeBonus = Math.round(Math.min(8, Math.max(0, volumeRatio - cfg.reclaimVolumeRatio) * 8));
    const strongBullTrend = currentPrice > ema20_1h && ema20_1h > ema50_1h && currentPrice > ema50;
    const strongBearTrend = currentPrice < ema20_1h && ema20_1h < ema50_1h && currentPrice < ema50;

    // ── LONG ──────────────────────────────────────────────────────────────────
    if (
      htfTrend === 'bullish' &&
      strongBullTrend &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade' &&
      ema20 > ema20Prev &&
      trendStrengthAtr >= 0.22 &&
      prevCandle.low <= ema20 + reclaimBand &&
      lastCandle.close > ema20 &&
      lastCandle.close > lastCandle.open &&
      candleBodyRatio >= 0.55 &&
      volumeRatio >= cfg.reclaimVolumeRatio &&
      currentRsi >= 45 && currentRsi <= 72
    ) {
      // Candlestick confirmation — a strong reclaim candle matters
      const hasBullishPattern =
        patterns.bullishEngulfing ||
        patterns.bullishMarubozu ||
        patterns.pinBarBullish ||
        patterns.hammer ||
        candleBodyRatio >= 0.70;

      if (!hasBullishPattern) return null;

      const swingLow = Math.min(...candles15m.slice(-6).map((c) => c.low));
      const stopLoss = Math.min(swingLow - atr14 * 0.25, ema50 - reclaimBand);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice + risk * cfg.tp2Multiplier;
      const riskReward = (takeProfit2 - currentPrice) / risk;
      if (riskReward < context.minRiskReward) return null;

      const nearBullOb = priceNearOrderBlock(currentPrice, obs15m.filter((ob) => ob.type === 'bullish'), atr14);
      const inFvg = priceInFvg(currentPrice, fvgs1h.filter((f) => f.type === 'bullish'));
      const obBonus = nearBullOb ? 5 : 0;
      const fvgBonus = inFvg ? 5 : 0;
      const patternBonus = patterns.bullishEngulfing || patterns.bullishMarubozu ? 4 : 2;
      const htfBonus = htf4Trend === 'bullish' ? 4 : 0;

      const strategyScore = Math.round(79 + volumeBonus + obBonus + fvgBonus + patternBonus + htfBonus + sessionAdj);

      return {
        symbol: context.symbol,
        direction: 'LONG',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        strategyScore,
        reasonList: [
          `Strong 1h bullish structure above EMA20/EMA50`,
          `15m pullback reclaimed EMA20 (${ema20.toFixed(4)})`,
          `Reclaim candle: ${bullishPatternLabel(patterns)} — body ratio ${candleBodyRatio.toFixed(2)}`,
          `Volume ${volumeRatio.toFixed(1)}x — RSI ${currentRsi.toFixed(1)}`,
          ...(nearBullOb ? [`Near bullish order block (OB: ${nearBullOb.low.toFixed(4)}–${nearBullOb.high.toFixed(4)})`] : []),
          ...(inFvg ? [`Price filling bullish FVG (${inFvg.bottom.toFixed(4)}–${inFvg.top.toFixed(4)})`] : []),
          ...(htf4Trend ? [`4h trend: ${htf4Trend}`] : []),
        ],
        invalidationRules: ['15m close back below EMA20', '1h trend weakens', 'Reclaim candle low breaks'],
      };
    }

    // ── SHORT ─────────────────────────────────────────────────────────────────
    if (
      htfTrend === 'bearish' &&
      strongBearTrend &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade' &&
      ema20 < ema20Prev &&
      trendStrengthAtr >= 0.22 &&
      prevCandle.high >= ema20 - reclaimBand &&
      lastCandle.close < ema20 &&
      lastCandle.close < lastCandle.open &&
      candleBodyRatio >= 0.55 &&
      volumeRatio >= cfg.reclaimVolumeRatio &&
      currentRsi >= 28 && currentRsi <= 55
    ) {
      const hasBearishPattern =
        patterns.bearishEngulfing ||
        patterns.bearishMarubozu ||
        patterns.pinBarBearish ||
        patterns.shootingStar ||
        candleBodyRatio >= 0.70;

      if (!hasBearishPattern) return null;

      const swingHigh = Math.max(...candles15m.slice(-6).map((c) => c.high));
      const stopLoss = Math.max(swingHigh + atr14 * 0.25, ema50 + reclaimBand);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice - risk * cfg.tp2Multiplier;
      const riskReward = (currentPrice - takeProfit2) / risk;
      if (riskReward < context.minRiskReward) return null;

      const nearBearOb = priceNearOrderBlock(currentPrice, obs15m.filter((ob) => ob.type === 'bearish'), atr14);
      const inFvg = priceInFvg(currentPrice, fvgs1h.filter((f) => f.type === 'bearish'));
      const obBonus = nearBearOb ? 5 : 0;
      const fvgBonus = inFvg ? 5 : 0;
      const patternBonus = patterns.bearishEngulfing || patterns.bearishMarubozu ? 4 : 2;
      const htfBonus = htf4Trend === 'bearish' ? 4 : 0;

      const strategyScore = Math.round(79 + volumeBonus + obBonus + fvgBonus + patternBonus + htfBonus + sessionAdj);

      return {
        symbol: context.symbol,
        direction: 'SHORT',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        strategyScore,
        reasonList: [
          `Strong 1h bearish structure below EMA20/EMA50`,
          `15m pullback failed and lost EMA20 (${ema20.toFixed(4)})`,
          `Loss candle: ${bearishPatternLabel(patterns)} — body ratio ${candleBodyRatio.toFixed(2)}`,
          `Volume ${volumeRatio.toFixed(1)}x — RSI ${currentRsi.toFixed(1)}`,
          ...(nearBearOb ? [`Near bearish order block (OB: ${nearBearOb.low.toFixed(4)}–${nearBearOb.high.toFixed(4)})`] : []),
          ...(inFvg ? [`Price filling bearish FVG (${inFvg.bottom.toFixed(4)}–${inFvg.top.toFixed(4)})`] : []),
          ...(htf4Trend ? [`4h trend: ${htf4Trend}`] : []),
        ],
        invalidationRules: ['15m close back above EMA20', '1h trend weakens', 'Rejection candle high breaks'],
      };
    }

    return null;
  }
}

function bullishPatternLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bullishEngulfing) return 'bullish engulfing';
  if (p.bullishMarubozu) return 'bullish marubozu';
  if (p.pinBarBullish) return 'bullish pin bar';
  if (p.hammer) return 'hammer';
  return 'strong reclaim bar';
}

function bearishPatternLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bearishEngulfing) return 'bearish engulfing';
  if (p.bearishMarubozu) return 'bearish marubozu';
  if (p.pinBarBearish) return 'bearish pin bar';
  if (p.shootingStar) return 'shooting star';
  return 'strong loss bar';
}
