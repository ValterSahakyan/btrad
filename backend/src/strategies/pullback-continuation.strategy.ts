import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { ema } from '../indicators/ema';
import { rsi } from '../indicators/rsi';
import { detectTrend } from '../indicators/trend';
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

    const htfTrend = detectTrend(candles1h);
    if (htfTrend === 'sideways') return null;

    const ema20arr = ema(closes15m, 20);
    const ema50arr = ema(closes15m, 50);
    const ema20 = ema20arr.at(-1) ?? currentPrice;
    const ema50 = ema50arr.at(-1) ?? currentPrice;
    const atr14 = atr(candles15m, 14);
    const rsiValues = rsi(closes15m, 14);
    const currentRsi = rsiValues.at(-1) ?? 50;
    const ema50_1h = ema(closes1h, 50).at(-1) ?? currentPrice;

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.5) return null;

    const strategyScore = 78;

    // LONG setup: pullback in a bullish trend
    if (
      htfTrend === 'bullish' &&
      currentPrice > ema50_1h &&
      currentRsi >= cfg.rsiLongMin && currentRsi <= cfg.rsiLongMax &&
      Math.abs(currentPrice - ema20) < cfg.atrMultiplier * atr14 &&
      currentPrice > ema50 &&
      lastCandle && lastCandle.close > lastCandle.open &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.min(ema50 * 0.998, currentPrice - cfg.atrMultiplier * atr14);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * 1.5;
      const takeProfit2 = currentPrice + risk * 2.5;
      const riskReward = (takeProfit1 - currentPrice) / risk;
      if (riskReward < context.minRiskReward) return null;

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
          `1h trend bullish, pulling back to EMA20 (${ema20.toFixed(4)})`,
          `RSI ${currentRsi.toFixed(1)} in continuation zone (${cfg.rsiLongMin}–${cfg.rsiLongMax})`,
          `Bullish candle confirms reversal`,
          `Above 15m EMA50 (${ema50.toFixed(4)}) and 1h EMA50`,
        ],
        invalidationRules: ['Close below EMA50', '1h trend turns bearish', `RSI drops below ${cfg.rsiLongMin - 3}`],
      };
    }

    // SHORT setup: pullback in a bearish trend
    if (
      htfTrend === 'bearish' &&
      currentPrice < ema50_1h &&
      currentRsi >= cfg.rsiShortMin && currentRsi <= cfg.rsiShortMax &&
      Math.abs(currentPrice - ema20) < cfg.atrMultiplier * atr14 &&
      currentPrice < ema50 &&
      lastCandle && lastCandle.close < lastCandle.open &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.max(ema50 * 1.002, currentPrice + cfg.atrMultiplier * atr14);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * 1.5;
      const takeProfit2 = currentPrice - risk * 2.5;
      const riskReward = (currentPrice - takeProfit1) / risk;
      if (riskReward < context.minRiskReward) return null;

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
          `1h trend bearish, pullback to EMA20 (${ema20.toFixed(4)})`,
          `RSI ${currentRsi.toFixed(1)} in continuation zone (${cfg.rsiShortMin}–${cfg.rsiShortMax})`,
          `Bearish candle confirms reversal`,
          `Below 15m EMA50 (${ema50.toFixed(4)}) and 1h EMA50`,
        ],
        invalidationRules: ['Close above EMA50', '1h trend turns bullish', `RSI breaks above ${cfg.rsiShortMax + 3}`],
      };
    }

    return null;
  }
}
