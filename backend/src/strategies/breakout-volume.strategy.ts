import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { ema } from '../indicators/ema';
import { detectBreakout } from '../indicators/breakout';
import { volumeAverage, volumeSpike } from '../indicators/volume';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class BreakoutVolumeStrategy implements TradingStrategy {
  readonly name = 'breakout_volume';
  readonly enabled = true;

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const closes = context.candles15m.map((candle) => candle.close);
    const volumes = context.candles15m.map((candle) => candle.volume);
    const currentPrice = closes.at(-1) ?? 0;
    const ema50 = ema(closes, 50).at(-1) ?? currentPrice;
    const avgVolume = volumeAverage(volumes, 20);
    const currentVolume = volumes.at(-1) ?? 0;
    const volumeRatio = volumeSpike(currentVolume, avgVolume);
    const breakout = detectBreakout(context.candles1h);
    const oneHourHigh = Math.max(...context.candles1h.slice(-6).map((candle) => candle.high));
    const oneHourLow = Math.min(...context.candles1h.slice(-6).map((candle) => candle.low));

    if (context.hotScore < 55 || volumeRatio < 1.2 || context.spread > 0.4) {
      return null;
    }

    if (
      currentPrice > ema50 &&
      currentPrice > oneHourHigh &&
      breakout.longBreakout &&
      context.marketRegime.regime !== 'bearish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.min(breakout.resistance, currentPrice * 0.985);
      const risk = currentPrice - stopLoss;
      const takeProfit1 = currentPrice + risk * 1.5;
      const takeProfit2 = currentPrice + risk * 2.2;
      const riskReward = (takeProfit1 - currentPrice) / risk;

      if (riskReward < context.minRiskReward || risk <= 0) {
        return null;
      }

      return {
        symbol: context.symbol,
        direction: 'LONG',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        reasonList: ['15m close above 1h high', 'Volume spike confirmed', 'Price above EMA50'],
        invalidationRules: ['Breakout level lost', 'BTC regime degrades', 'Signal expires'],
        strategyScore: 82,
      };
    }

    if (
      currentPrice < ema50 &&
      currentPrice < oneHourLow &&
      breakout.shortBreakout &&
      context.marketRegime.regime !== 'bullish' &&
      context.marketRegime.regime !== 'no_trade'
    ) {
      const stopLoss = Math.max(breakout.support, currentPrice * 1.015);
      const risk = stopLoss - currentPrice;
      const takeProfit1 = currentPrice - risk * 1.5;
      const takeProfit2 = currentPrice - risk * 2.2;
      const riskReward = (currentPrice - takeProfit1) / risk;

      if (riskReward < context.minRiskReward || risk <= 0) {
        return null;
      }

      return {
        symbol: context.symbol,
        direction: 'SHORT',
        strategy: this.name,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskReward,
        reasonList: ['15m close below 1h low', 'Volume spike confirmed', 'Price below EMA50'],
        invalidationRules: ['Breakdown level reclaimed', 'BTC regime improves', 'Signal expires'],
        strategyScore: 82,
      };
    }

    return null;
  }
}
