import { Injectable } from '@nestjs/common';
import { clamp } from '../common/utils/math';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { ema } from '../indicators/ema';
import { rsi } from '../indicators/rsi';
import { detectTrend } from '../indicators/trend';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class PullbackContinuationStrategy implements TradingStrategy {
  readonly name = 'pullback_continuation';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.pullback;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h } = context;
    if (candles15m.length < 60 || candles1h.length < 60) return null;

    const closes15m = candles15m.map((c) => c.close);
    const closes1h = candles1h.map((c) => c.close);
    const currentPrice = closes15m.at(-1) ?? 0;
    const lastCandle = candles15m.at(-1);
    const prevCandle = candles15m.at(-2);
    if (!lastCandle || !prevCandle) return null;

    const htfTrend = detectTrend(candles1h);
    if (htfTrend === 'sideways') return null;

    const ema20arr = ema(closes15m, 20);
    const ema50arr = ema(closes15m, 50);
    const ema20 = ema20arr.at(-1) ?? currentPrice;
    const ema50 = ema50arr.at(-1) ?? currentPrice;
    const ema20Prev = ema20arr.at(-2) ?? ema20;
    const ema50Prev = ema50arr.at(-2) ?? ema50;
    const atr14 = atr(candles15m, 14);
    const currentRsi = rsi(closes15m, 14).at(-1) ?? 50;
    const ema20_1h = ema(closes1h, 20).at(-1) ?? currentPrice;
    const ema50_1h = ema(closes1h, 50).at(-1) ?? currentPrice;
    const volumes15m = candles15m.map((c) => c.volume);
    const avgVolume = volumeAverage(volumes15m, 20);
    const volumeRatio = volumeSpike(volumes15m.at(-1) ?? 0, avgVolume);

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.5) return null;

    const pullbackDistance = Math.abs(currentPrice - ema20);
    const recentPullbackLow = Math.min(lastCandle.low, prevCandle.low);
    const recentPullbackHigh = Math.max(lastCandle.high, prevCandle.high);
    const trendStrengthAtr = Math.abs(ema20 - ema50) / atr14;
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = Math.max(lastCandle.high - lastCandle.low, atr14 * 0.1);
    const candleBodyRatio = lastCandleBody / lastCandleRange;

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

    if (
      htfTrend === 'bullish' &&
      bullishStructure &&
      currentPrice > ema50_1h &&
      currentRsi >= Math.max(cfg.rsiLongMin, 45) &&
      currentRsi <= Math.min(cfg.rsiLongMax, 60) &&
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
      context.marketRegime.regime !== 'no_trade'
    ) {
      const swingLow = Math.min(...candles15m.slice(-6).map((c) => c.low));
      const stopLoss = Math.min(swingLow - atr14 * 0.2, ema50 - atr14 * 0.25);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * 1.5;
      const takeProfit2 = currentPrice + risk * 2.5;
      const riskReward = (takeProfit1 - currentPrice) / risk;
      if (riskReward + 1e-6 < context.minRiskReward) return null;

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
        }),
        reasonList: [
          'Bullish 1h structure aligned above EMA20/EMA50',
          `Pullback tagged 15m EMA20 (${ema20.toFixed(4)}) and reclaimed with a strong close`,
          `RSI ${currentRsi.toFixed(1)} stayed in the continuation pocket after the dip`,
          `15m trend strength ${trendStrengthAtr.toFixed(2)} ATR with candle body ratio ${candleBodyRatio.toFixed(2)}`,
          `Participation confirmed with ${volumeRatio.toFixed(1)}x relative volume on reclaim`,
        ],
        invalidationRules: ['15m close back below EMA20', '1h EMA20 loses EMA50', `RSI drops below ${cfg.rsiLongMin - 3}`],
      };
    }

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
      context.marketRegime.regime !== 'no_trade'
    ) {
      const swingHigh = Math.max(...candles15m.slice(-6).map((c) => c.high));
      const stopLoss = Math.max(swingHigh + atr14 * 0.2, ema50 + atr14 * 0.25);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * 1.5;
      const takeProfit2 = currentPrice - risk * 2.5;
      const riskReward = (currentPrice - takeProfit1) / risk;
      if (riskReward + 1e-6 < context.minRiskReward) return null;

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
        }),
        reasonList: [
          'Bearish 1h structure aligned below EMA20/EMA50',
          `Pullback tagged 15m EMA20 (${ema20.toFixed(4)}) and rejected with a strong close`,
          `RSI ${currentRsi.toFixed(1)} stayed in the continuation pocket after the bounce`,
          `15m trend strength ${trendStrengthAtr.toFixed(2)} ATR with candle body ratio ${candleBodyRatio.toFixed(2)}`,
          `Participation confirmed with ${volumeRatio.toFixed(1)}x relative volume on rejection`,
        ],
        invalidationRules: ['15m close back above EMA20', '1h EMA20 reclaims EMA50', `RSI breaks above ${cfg.rsiShortMax + 3}`],
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
}): number {
  const trendBonus = Math.min(8, Math.max(0, (input.trendStrengthAtr - 0.18) * 12));
  const candleBonus = Math.min(7, Math.max(0, (input.candleBodyRatio - 0.45) * 20));
  const rsiBonus = Math.max(0, 6 - Math.abs(input.rsi - 50) * 0.4);
  const pullbackBonus = Math.max(0, 5 - Math.abs(input.pullbackDistanceAtr - 0.35) * 8);
  const hotScoreBonus = Math.max(0, Math.min(4, (input.hotScore - 55) / 10));

  return Math.round(clamp(74 + trendBonus + candleBonus + rsiBonus + pullbackBonus + hotScoreBonus, 74, 94));
}
