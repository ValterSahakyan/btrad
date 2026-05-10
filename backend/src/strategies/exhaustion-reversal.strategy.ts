import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { ema } from '../indicators/ema';
import { rsi } from '../indicators/rsi';
import { vwap } from '../indicators/vwap';
import { volumeAverage } from '../indicators/volume';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class ExhaustionReversalStrategy implements TradingStrategy {
  readonly name = 'mean_reversion';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.reversion;
    if (!cfg.enabled) return null;

    const { candles15m } = context;
    if (candles15m.length < 30) return null;

    const closes = candles15m.map((c) => c.close);
    const volumes = candles15m.map((c) => c.volume);
    const currentPrice = closes.at(-1) ?? 0;
    const lastCandle = candles15m.at(-1);
    const prevCandle = candles15m.at(-2);

    if (!lastCandle || !prevCandle) return null;

    const rsiValues = rsi(closes, 14);
    const currentRsi = rsiValues.at(-1) ?? 50;
    const currentVwap = vwap(candles15m.slice(-96));
    const atr14 = atr(candles15m, 14);
    const ema20 = ema(closes, 20).at(-1) ?? currentPrice;

    const recentPeakVolume = Math.max(...volumes.slice(-6));
    const currentVolume = volumes.at(-1) ?? 0;
    const volumeDeclining = currentVolume < recentPeakVolume * cfg.volumeDeclineRatio;

    if (context.spread > 0.5 || atr14 <= 0) return null;
    if (context.marketRegime.regime === 'no_trade') return null;
    if (context.marketRegime.regime === 'high_volatility') return null;

    const vwapDeviation = currentVwap > 0 ? ((currentPrice - currentVwap) / currentVwap) * 100 : 0;
    const strategyScore = 74;
    const hostileBullTrend = context.marketRegime.regime === 'bullish';
    const hostileBearTrend = context.marketRegime.regime === 'bearish';
    const countertrendShortAllowed =
      !hostileBullTrend ||
      (currentRsi > cfg.rsiOverbought + 4 && vwapDeviation > cfg.vwapDeviationPct + 0.5);
    const countertrendLongAllowed =
      !hostileBearTrend ||
      (currentRsi < cfg.rsiOversold - 4 && vwapDeviation < -(cfg.vwapDeviationPct + 0.5));

    // SHORT: price exhausted after sharp pump
    if (
      currentRsi > cfg.rsiOverbought &&
      vwapDeviation > cfg.vwapDeviationPct &&
      currentPrice > ema20 * 1.02 &&
      volumeDeclining &&
      prevCandle.close > prevCandle.open &&
      lastCandle.close < lastCandle.open &&
      countertrendShortAllowed
    ) {
      const recentHigh = Math.max(...candles15m.slice(-5).map((c) => c.high));
      const stopLoss = recentHigh + atr14 * 0.5;
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * 1.5;
      const takeProfit2 = Math.min(currentPrice - risk * 2.5, currentVwap);
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
          `RSI ${currentRsi.toFixed(1)} — overbought exhaustion (threshold ${cfg.rsiOverbought})`,
          `Price ${vwapDeviation.toFixed(1)}% above VWAP (min ${cfg.vwapDeviationPct}%)`,
          `Volume declining — sellers entering`,
          `Bearish reversal candle after pump`,
        ],
        invalidationRules: ['RSI stays above 80 (momentum extension)', 'Volume picks up again', 'New local high'],
      };
    }

    // LONG: price exhausted after sharp dump
    if (
      currentRsi < cfg.rsiOversold &&
      vwapDeviation < -cfg.vwapDeviationPct &&
      currentPrice < ema20 * 0.98 &&
      volumeDeclining &&
      prevCandle.close < prevCandle.open &&
      lastCandle.close > lastCandle.open &&
      countertrendLongAllowed
    ) {
      const recentLow = Math.min(...candles15m.slice(-5).map((c) => c.low));
      const stopLoss = recentLow - atr14 * 0.5;
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * 1.5;
      const takeProfit2 = Math.max(currentPrice + risk * 2.5, currentVwap);
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
          `RSI ${currentRsi.toFixed(1)} — oversold exhaustion (threshold ${cfg.rsiOversold})`,
          `Price ${Math.abs(vwapDeviation).toFixed(1)}% below VWAP (min ${cfg.vwapDeviationPct}%)`,
          `Selling volume declining — buyers returning`,
          `Bullish reversal candle after dump`,
        ],
        invalidationRules: ['RSI drops below 20 (momentum extension)', 'Volume picks up again', 'New local low'],
      };
    }

    return null;
  }
}
