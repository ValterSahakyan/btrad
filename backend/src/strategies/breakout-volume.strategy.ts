import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectBreakout } from '../indicators/breakout';
import { ema } from '../indicators/ema';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class BreakoutVolumeStrategy implements TradingStrategy {
  readonly name = 'breakout_volume';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.breakout;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h } = context;
    const closes15m = candles15m.map((c) => c.close);
    const volumes15m = candles15m.map((c) => c.volume);
    const currentPrice = closes15m.at(-1) ?? 0;

    const ema50 = ema(closes15m, 50).at(-1) ?? currentPrice;
    const avgVolume = volumeAverage(volumes15m, 20);
    const currentVolume = volumes15m.at(-1) ?? 0;
    const volumeRatio = volumeSpike(currentVolume, avgVolume);
    const atr14 = atr(candles15m, 14);
    const breakout = detectBreakout(candles1h, cfg.lookbackPeriod);

    if (context.hotScore < cfg.minHotScore || volumeRatio < cfg.minVolumeRatio || context.spread > 0.4 || atr14 <= 0) {
      return null;
    }

    const volumeBonus = Math.min(15, (volumeRatio - cfg.minVolumeRatio) * 10);
    const strategyScore = Math.round(72 + volumeBonus);

    // LONG: price breaks 1h resistance with strong volume above EMA50
    if (
      currentPrice > ema50 &&
      breakout.longBreakout &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.max(breakout.resistance * 0.995, currentPrice - 1.5 * atr14);
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
          `1h resistance broken (${breakout.resistance.toFixed(4)})`,
          `Volume spike ${volumeRatio.toFixed(1)}x average (min ${cfg.minVolumeRatio}x)`,
          `Price above EMA50 (${ema50.toFixed(4)})`,
          `Market regime: ${context.marketRegime.regime}`,
        ],
        invalidationRules: ['Close below breakout resistance', 'BTC trend turns bearish', 'Signal expires'],
      };
    }

    // SHORT: price breaks 1h support with strong volume below EMA50
    if (
      currentPrice < ema50 &&
      breakout.shortBreakout &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.min(breakout.support * 1.005, currentPrice + 1.5 * atr14);
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
          `1h support broken (${breakout.support.toFixed(4)})`,
          `Volume spike ${volumeRatio.toFixed(1)}x average (min ${cfg.minVolumeRatio}x)`,
          `Price below EMA50 (${ema50.toFixed(4)})`,
          `Market regime: ${context.marketRegime.regime}`,
        ],
        invalidationRules: ['Close above breakdown support', 'BTC trend turns bullish', 'Signal expires'],
      };
    }

    return null;
  }
}
