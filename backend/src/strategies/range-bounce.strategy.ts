import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { rsi } from '../indicators/rsi';
import { detectSupportResistance } from '../indicators/support-resistance';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class RangeBounceStrategy implements TradingStrategy {
  readonly name = 'range_bounce';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.rangeBounce;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h } = context;
    if (candles15m.length < 40 || candles1h.length < cfg.lookbackPeriod) return null;

    const current = candles15m.at(-1);
    const prev = candles15m.at(-2);
    if (!current || !prev) return null;

    const currentPrice = current.close;
    const atr14 = atr(candles15m, 14);
    const currentRsi = rsi(candles15m.map((c) => c.close), 14).at(-1) ?? 50;
    const levels = detectSupportResistance(candles1h, cfg.lookbackPeriod);

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.45) return null;
    if (context.marketRegime.regime === 'no_trade' || context.marketRegime.regime === 'high_volatility') return null;

    const supportDistance = Math.abs(current.low - levels.support);
    const resistanceDistance = Math.abs(current.high - levels.resistance);
    const nearSupport = supportDistance <= atr14 * cfg.proximityAtr;
    const nearResistance = resistanceDistance <= atr14 * cfg.proximityAtr;
    const rangeWidthPct = levels.support > 0 ? ((levels.resistance - levels.support) / levels.support) * 100 : 0;
    if (rangeWidthPct < 1) return null;

    const strategyScore = 76;

    if (
      nearSupport &&
      current.low <= levels.support * 1.003 &&
      current.close > current.open &&
      prev.close < prev.open &&
      currentRsi <= cfg.rsiLongMax &&
      context.marketRegime.regime !== 'bearish'
    ) {
      const stopLoss = Math.min(levels.support - atr14 * 0.35, current.low - atr14 * 0.2);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = Math.min(currentPrice + risk * cfg.tp1Multiplier, levels.resistance - atr14 * 0.3);
      const takeProfit2 = Math.min(currentPrice + risk * cfg.tp2Multiplier, levels.resistance);
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
          `1h support reaction near ${levels.support.toFixed(4)}`,
          `Bullish rejection candle at range floor`,
          `RSI ${currentRsi.toFixed(1)} is not overbought`,
          `Targeting range rotation back toward resistance ${levels.resistance.toFixed(4)}`,
        ],
        invalidationRules: ['Support breaks on a 15m close', 'Range expands into trend', 'Bounce candle low breaks'],
      };
    }

    if (
      nearResistance &&
      current.high >= levels.resistance * 0.997 &&
      current.close < current.open &&
      prev.close > prev.open &&
      currentRsi >= cfg.rsiShortMin &&
      context.marketRegime.regime !== 'bullish'
    ) {
      const stopLoss = Math.max(levels.resistance + atr14 * 0.35, current.high + atr14 * 0.2);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = Math.max(currentPrice - risk * cfg.tp1Multiplier, levels.support + atr14 * 0.3);
      const takeProfit2 = Math.max(currentPrice - risk * cfg.tp2Multiplier, levels.support);
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
          `1h resistance reaction near ${levels.resistance.toFixed(4)}`,
          `Bearish rejection candle at range ceiling`,
          `RSI ${currentRsi.toFixed(1)} confirms upside stretch`,
          `Targeting rotation back toward support ${levels.support.toFixed(4)}`,
        ],
        invalidationRules: ['Resistance breaks on a 15m close', 'Range breaks into trend', 'Rejection candle high breaks'],
      };
    }

    return null;
  }
}
