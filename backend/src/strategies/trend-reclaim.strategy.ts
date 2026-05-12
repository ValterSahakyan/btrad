import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { ema } from '../indicators/ema';
import { rsi } from '../indicators/rsi';
import { detectTrend } from '../indicators/trend';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class TrendReclaimStrategy implements TradingStrategy {
  readonly name = 'trend_reclaim';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.trendReclaim;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h } = context;
    if (candles15m.length < 60 || candles1h.length < 60) return null;

    const closes15m = candles15m.map((c) => c.close);
    const closes1h = candles1h.map((c) => c.close);
    const volumes15m = candles15m.map((c) => c.volume);
    const currentPrice = closes15m.at(-1) ?? 0;
    const lastCandle = candles15m.at(-1);
    const prevCandle = candles15m.at(-2);
    if (!lastCandle || !prevCandle) return null;

    const ema20arr = ema(closes15m, 20);
    const ema50arr = ema(closes15m, 50);
    const ema20 = ema20arr.at(-1) ?? currentPrice;
    const ema50 = ema50arr.at(-1) ?? currentPrice;
    const ema20Prev = ema20arr.at(-2) ?? ema20;
    const ema20_1h = ema(closes1h, 20).at(-1) ?? currentPrice;
    const ema50_1h = ema(closes1h, 50).at(-1) ?? currentPrice;
    const atr14 = atr(candles15m, 14);
    const currentRsi = rsi(closes15m, 14).at(-1) ?? 50;
    const avgVolume = volumeAverage(volumes15m, 20);
    const volumeRatio = volumeSpike(volumes15m.at(-1) ?? 0, avgVolume);
    const htfTrend = detectTrend(candles1h);

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.45) return null;
    if (htfTrend === 'sideways') return null;

    const reclaimBand = atr14 * cfg.emaBufferAtr;
    const strategyScore = Math.round(79 + Math.min(8, Math.max(0, volumeRatio - cfg.reclaimVolumeRatio) * 8));
    const trendStrengthAtr = Math.abs(ema20 - ema50) / atr14;
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = Math.max(lastCandle.high - lastCandle.low, atr14 * 0.1);
    const candleBodyRatio = lastCandleBody / lastCandleRange;

    const strongBullTrend = currentPrice > ema20_1h && ema20_1h > ema50_1h && currentPrice > ema50;
    const strongBearTrend = currentPrice < ema20_1h && ema20_1h < ema50_1h && currentPrice < ema50;

    if (
      htfTrend === 'bullish' &&
      strongBullTrend &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade' &&
      ema20 > ema20Prev &&
      trendStrengthAtr >= 0.28 &&
      prevCandle.low <= ema20 + reclaimBand &&
      lastCandle.close > ema20 &&
      lastCandle.close > lastCandle.open &&
      candleBodyRatio >= 0.55 &&
      volumeRatio >= cfg.reclaimVolumeRatio &&
      currentRsi >= 52 && currentRsi <= 65
    ) {
      const swingLow = Math.min(...candles15m.slice(-6).map((c) => c.low));
      const stopLoss = Math.min(swingLow - atr14 * 0.25, ema50 - reclaimBand);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice + risk * cfg.tp2Multiplier;
      const riskReward = (takeProfit2 - currentPrice) / risk;
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
          `Strong 1h bullish structure above EMA20/EMA50`,
          `15m pullback reclaimed EMA20 (${ema20.toFixed(4)})`,
          `Bullish reclaim candle with ${volumeRatio.toFixed(1)}x volume`,
          `RSI ${currentRsi.toFixed(1)} confirms momentum without being stretched`,
        ],
        invalidationRules: ['15m close back below EMA20', '1h trend weakens', 'Reclaim candle low breaks'],
      };
    }

    if (
      htfTrend === 'bearish' &&
      strongBearTrend &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade' &&
      ema20 < ema20Prev &&
      trendStrengthAtr >= 0.28 &&
      prevCandle.high >= ema20 - reclaimBand &&
      lastCandle.close < ema20 &&
      lastCandle.close < lastCandle.open &&
      candleBodyRatio >= 0.55 &&
      volumeRatio >= cfg.reclaimVolumeRatio &&
      currentRsi >= 35 && currentRsi <= 48
    ) {
      const swingHigh = Math.max(...candles15m.slice(-6).map((c) => c.high));
      const stopLoss = Math.max(swingHigh + atr14 * 0.25, ema50 + reclaimBand);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * cfg.tp1Multiplier;
      const takeProfit2 = currentPrice - risk * cfg.tp2Multiplier;
      const riskReward = (currentPrice - takeProfit2) / risk;
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
          `Strong 1h bearish structure below EMA20/EMA50`,
          `15m pullback failed and lost EMA20 (${ema20.toFixed(4)})`,
          `Bearish reclaim candle with ${volumeRatio.toFixed(1)}x volume`,
          `RSI ${currentRsi.toFixed(1)} confirms downside momentum`,
        ],
        invalidationRules: ['15m close back above EMA20', '1h trend weakens', 'Reclaim candle high breaks'],
      };
    }

    return null;
  }
}
