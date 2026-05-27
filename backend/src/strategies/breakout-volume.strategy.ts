import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectBreakout } from '../indicators/breakout';
import { detectCandlePatterns } from '../indicators/candlestick-patterns';
import { ema } from '../indicators/ema';
import { detectFairValueGaps, priceNearFvg } from '../indicators/fair-value-gap';
import { analyzeMarketStructure } from '../indicators/market-structure';
import { detectTrend } from '../indicators/trend';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { sessionScoreAdjustment } from '../settings/session-filter';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class BreakoutVolumeStrategy implements TradingStrategy {
  readonly name = 'breakout_volume';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.breakout;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h, candles4h } = context;
    const closes15m = candles15m.map((c) => c.close);
    const volumes15m = candles15m.map((c) => c.volume);
    const currentPrice = closes15m[closes15m.length - 1] ?? 0;

    const ema50 = ema(closes15m, 50)[closes15m.length - 1] ?? currentPrice;
    const ema200 = ema(closes15m, 200)[closes15m.length - 1] ?? currentPrice;
    const avgVolume = volumeAverage(volumes15m, 20);
    const currentVolume = volumes15m[volumes15m.length - 1] ?? 0;
    const volumeRatio = volumeSpike(currentVolume, avgVolume);
    const atr14 = atr(candles15m, 14);
    const breakout = detectBreakout(candles1h, cfg.lookbackPeriod);

    if (context.hotScore < cfg.minHotScore || volumeRatio < cfg.minVolumeRatio || context.spread > 0.4 || atr14 <= 0) {
      return null;
    }

    const lastCandle = candles15m[candles15m.length - 1]!;
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = Math.max(lastCandle.high - lastCandle.low, atr14 * 0.1);
    const candleBodyRatio = lastCandleBody / lastCandleRange;

    // Candlestick patterns on the current 15m bar
    const patterns = detectCandlePatterns(candles15m);

    // FVGs on 1h for confluence
    const fvgs1h = detectFairValueGaps(candles1h);

    // 4h trend alignment (Elder Triple Screen — trade in direction of HTF trend)
    const htf4Trend = candles4h && candles4h.length >= 50 ? detectTrend(candles4h) : null;

    // 15m market structure for BOS confirmation
    const structure = analyzeMarketStructure(candles15m);

    // Session score bonus/penalty (ICT kill zones)
    const sessionAdj = sessionScoreAdjustment();

    const volumeBonus = Math.min(15, (volumeRatio - cfg.minVolumeRatio) * 10);

    // ── LONG ──────────────────────────────────────────────────────────────────
    if (
      currentPrice > ema50 &&
      currentPrice > ema200 &&
      breakout.longBreakout &&
      structure.breakOfStructure &&
      context.marketRegime.regime !== 'no_trade' &&
      htf4Trend !== 'bearish'
    ) {
      // Require at least one bullish candle confirmation (Steve Nison / Al Brooks)
      const hasBullishCandle =
        patterns.bullishEngulfing ||
        patterns.bullishMarubozu ||
        patterns.pinBarBullish ||
        patterns.hammer ||
        patterns.morningStar ||
        (lastCandle.close > lastCandle.open && candleBodyRatio >= 0.55);

      if (!hasBullishCandle) return null;

      // SL: below breakout level or 1.5×ATR, whichever is tighter for risk
      const stopLoss = Math.max(breakout.resistance * 0.995, currentPrice - 1.5 * atr14);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice + risk * cfg.tp2Multiplier;
      const riskReward = (takeProfit2 - currentPrice) / risk;
      if (riskReward < context.minRiskReward) return null;

      // Bonus for FVG confluence (ICT — price near an unfilled imbalance above)
      const nearBullFvg = priceNearFvg(currentPrice, fvgs1h.filter((f) => f.type === 'bullish'), atr14);
      const fvgBonus = nearBullFvg ? 5 : 0;

      // Bonus for 4h bullish alignment
      const htfBonus = htf4Trend === 'bullish' ? 4 : 0;

      // Bonus for clean BOS (price already broke structure = momentum confirmed)
      const bosBonus = structure.breakOfStructure ? 3 : 0;

      // Pattern quality bonus
      const patternBonus = patterns.bullishEngulfing || patterns.bullishMarubozu ? 4 : 2;

      const strategyScore = Math.round(72 + volumeBonus + fvgBonus + htfBonus + bosBonus + patternBonus + sessionAdj);

      const reasons = [
        `1h resistance broken (${breakout.resistance.toFixed(4)})`,
        `Volume spike ${volumeRatio.toFixed(1)}x (min ${cfg.minVolumeRatio}x)`,
        `Price above EMA50 (${ema50.toFixed(4)})`,
        `Bullish candle: ${activePatternsLabel(patterns, 'bullish')}`,
        `Market regime: ${context.marketRegime.regime}`,
      ];
      if (htf4Trend) reasons.push(`4h trend: ${htf4Trend}`);
      if (nearBullFvg) reasons.push(`FVG confluence ${nearBullFvg.bottom.toFixed(4)}–${nearBullFvg.top.toFixed(4)}`);
      if (ema200 > 0) reasons.push(`EMA200: ${ema200.toFixed(4)}`);

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
        reasonList: reasons,
        invalidationRules: [
          'Close below breakout resistance',
          'BTC trend turns bearish',
          'Bullish candle high breaks',
          'Signal expires',
        ],
      };
    }

    // ── SHORT ─────────────────────────────────────────────────────────────────
    if (
      currentPrice < ema50 &&
      currentPrice < ema200 &&
      breakout.shortBreakout &&
      structure.breakOfStructure &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade' &&
      htf4Trend !== 'bullish'
    ) {
      const hasBearishCandle =
        patterns.bearishEngulfing ||
        patterns.bearishMarubozu ||
        patterns.pinBarBearish ||
        patterns.shootingStar ||
        patterns.eveningStar ||
        (lastCandle.close < lastCandle.open && candleBodyRatio >= 0.55);

      if (!hasBearishCandle) return null;

      const stopLoss = Math.min(breakout.support * 1.005, currentPrice + 1.5 * atr14);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice - risk * cfg.tp2Multiplier;
      const riskReward = (currentPrice - takeProfit2) / risk;
      if (riskReward < context.minRiskReward) return null;

      const nearBearFvg = priceNearFvg(currentPrice, fvgs1h.filter((f) => f.type === 'bearish'), atr14);
      const fvgBonus = nearBearFvg ? 5 : 0;
      const htfBonus = htf4Trend === 'bearish' ? 4 : 0;
      const bosBonus = structure.breakOfStructure ? 3 : 0;
      const patternBonus = patterns.bearishEngulfing || patterns.bearishMarubozu ? 4 : 2;
      const strategyScore = Math.round(72 + volumeBonus + fvgBonus + htfBonus + bosBonus + patternBonus + sessionAdj);

      const reasons = [
        `1h support broken (${breakout.support.toFixed(4)})`,
        `Volume spike ${volumeRatio.toFixed(1)}x (min ${cfg.minVolumeRatio}x)`,
        `Price below EMA50 (${ema50.toFixed(4)})`,
        `Bearish candle: ${activePatternsLabel(patterns, 'bearish')}`,
        `Market regime: ${context.marketRegime.regime}`,
      ];
      if (htf4Trend) reasons.push(`4h trend: ${htf4Trend}`);
      if (nearBearFvg) reasons.push(`FVG confluence ${nearBearFvg.bottom.toFixed(4)}–${nearBearFvg.top.toFixed(4)}`);

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
        reasonList: reasons,
        invalidationRules: [
          'Close above breakdown support',
          'BTC trend turns bullish',
          'Bearish candle high breaks',
          'Signal expires',
        ],
      };
    }

    return null;
  }
}

function activePatternsLabel(p: ReturnType<typeof detectCandlePatterns>, side: 'bullish' | 'bearish'): string {
  const bullish = ['bullishEngulfing', 'hammer', 'pinBarBullish', 'morningStar', 'bullishMarubozu'];
  const bearish = ['bearishEngulfing', 'shootingStar', 'pinBarBearish', 'eveningStar', 'bearishMarubozu'];
  const keys = side === 'bullish' ? bullish : bearish;
  const active = keys.filter((k) => (p as unknown as Record<string, boolean>)[k]);
  return active.length > 0 ? active.join(', ') : 'none';
}
