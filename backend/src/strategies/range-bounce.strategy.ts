import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectCandlePatterns } from '../indicators/candlestick-patterns';
import { rsi } from '../indicators/rsi';
import { detectSupportResistance, detectSwingLevels } from '../indicators/support-resistance';
import { sessionScoreAdjustment } from '../settings/session-filter';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class RangeBounceStrategy implements TradingStrategy {
  readonly name = 'range_bounce';

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const cfg = context.strategyConfig.rangeBounce;
    if (!cfg.enabled) return null;

    const { candles15m, candles1h } = context;
    if (candles15m.length < 40 || candles1h.length < cfg.lookbackPeriod) return null;

    const current = candles15m[candles15m.length - 1];
    const prev = candles15m[candles15m.length - 2];
    if (!current || !prev) return null;

    const currentPrice = current.close;
    const atr14 = atr(candles15m, 14);
    const currentRsi = rsi(candles15m.map((c) => c.close), 14).at(-1) ?? 50;

    // Use swing-based levels (multi-touch S/R is far stronger than simple min/max)
    // Source: John Murphy "Technical Analysis" — levels with multiple touches are key
    const swingLevels = detectSwingLevels(candles1h, cfg.lookbackPeriod);
    // Fallback to simple levels if swing detection finds nothing useful
    const simpleLevels = detectSupportResistance(candles1h, cfg.lookbackPeriod);

    const support = swingLevels.support.price > 0 ? swingLevels.support.price : simpleLevels.support;
    const resistance = swingLevels.resistance.price > 0 ? swingLevels.resistance.price : simpleLevels.resistance;
    const supportStrength = swingLevels.support.strength;
    const resistanceStrength = swingLevels.resistance.strength;

    if (atr14 <= 0) return null;
    if (context.hotScore < cfg.minHotScore || context.spread > 0.45) return null;
    if (context.marketRegime.regime === 'no_trade' || context.marketRegime.regime === 'high_volatility') return null;

    const supportDistance = Math.abs(current.low - support);
    const resistanceDistance = Math.abs(current.high - resistance);
    const nearSupport = supportDistance <= atr14 * cfg.proximityAtr;
    const nearResistance = resistanceDistance <= atr14 * cfg.proximityAtr;
    const rangeWidthPct = support > 0 ? ((resistance - support) / support) * 100 : 0;
    if (rangeWidthPct < 1) return null;

    // Candlestick patterns — critical at S/R (Steve Nison: "patterns only matter at key levels")
    const patterns = detectCandlePatterns(candles15m);

    // Session adjustment (ICT — S/R reactions are sharpest at London/NY opens)
    const sessionAdj = sessionScoreAdjustment();

    // Strength bonus: well-tested levels are more reliable (John Murphy)
    const supportStrengthBonus = Math.min(6, (supportStrength - 1) * 3);
    const resistanceStrengthBonus = Math.min(6, (resistanceStrength - 1) * 3);

    // ── LONG: bounce off support ───────────────────────────────────────────────
    if (
      nearSupport &&
      current.low <= support * 1.003 &&
      current.close > current.open &&
      prev.close < prev.open &&
      currentRsi <= cfg.rsiLongMax &&
      context.marketRegime.regime !== 'bearish'
    ) {
      // REQUIRE a bullish rejection candle at support (Nison — the candle confirms the level)
      const hasBullishRejection =
        patterns.hammer ||
        patterns.pinBarBullish ||
        patterns.bullishEngulfing ||
        patterns.morningStar ||
        // Strong close near range high also acceptable
        (current.close > current.open && (current.close - current.open) / (current.high - current.low) > 0.55);

      if (!hasBullishRejection) return null;

      const stopLoss = Math.min(support - atr14 * 0.35, current.low - atr14 * 0.2);
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = Math.min(currentPrice + risk * cfg.tp1Multiplier, resistance - atr14 * 0.3);
      const takeProfit2 = Math.min(currentPrice + risk * cfg.tp2Multiplier, resistance);
      const riskReward = (takeProfit2 - currentPrice) / risk;
      if (riskReward < context.minRiskReward) return null;

      const patternBonus = patterns.hammer ? 4 : patterns.pinBarBullish ? 3 : patterns.bullishEngulfing ? 5 : 2;
      const strategyScore = Math.round(76 + patternBonus + supportStrengthBonus + sessionAdj);

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
          `1h support at ${support.toFixed(4)} (${supportStrength} touch${supportStrength > 1 ? 'es' : ''})`,
          `Rejection candle: ${bullishRejectionLabel(patterns)}`,
          `RSI ${currentRsi.toFixed(1)} — not overbought`,
          `Range width ${rangeWidthPct.toFixed(1)}% — target resistance ${resistance.toFixed(4)}`,
        ],
        invalidationRules: [
          'Support breaks on a 15m close',
          'Range expands into trend',
          'Rejection candle low breaks',
        ],
      };
    }

    // ── SHORT: rejection from resistance ──────────────────────────────────────
    if (
      nearResistance &&
      current.high >= resistance * 0.997 &&
      current.close < current.open &&
      prev.close > prev.open &&
      currentRsi >= cfg.rsiShortMin &&
      context.marketRegime.regime !== 'bullish'
    ) {
      const hasBearishRejection =
        patterns.shootingStar ||
        patterns.pinBarBearish ||
        patterns.bearishEngulfing ||
        patterns.eveningStar ||
        (current.close < current.open && (current.open - current.close) / (current.high - current.low) > 0.55);

      if (!hasBearishRejection) return null;

      const stopLoss = Math.max(resistance + atr14 * 0.35, current.high + atr14 * 0.2);
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = Math.max(currentPrice - risk * cfg.tp1Multiplier, support + atr14 * 0.3);
      const takeProfit2 = Math.max(currentPrice - risk * cfg.tp2Multiplier, support);
      const riskReward = (currentPrice - takeProfit2) / risk;
      if (riskReward < context.minRiskReward) return null;

      const patternBonus = patterns.shootingStar ? 4 : patterns.pinBarBearish ? 3 : patterns.bearishEngulfing ? 5 : 2;
      const strategyScore = Math.round(76 + patternBonus + resistanceStrengthBonus + sessionAdj);

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
          `1h resistance at ${resistance.toFixed(4)} (${resistanceStrength} touch${resistanceStrength > 1 ? 'es' : ''})`,
          `Rejection candle: ${bearishRejectionLabel(patterns)}`,
          `RSI ${currentRsi.toFixed(1)} — stretched upside`,
          `Range width ${rangeWidthPct.toFixed(1)}% — target support ${support.toFixed(4)}`,
        ],
        invalidationRules: [
          'Resistance breaks on a 15m close',
          'Range breaks into trend',
          'Rejection candle high breaks',
        ],
      };
    }

    return null;
  }
}

function bullishRejectionLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bullishEngulfing) return 'bullish engulfing';
  if (p.hammer) return 'hammer';
  if (p.pinBarBullish) return 'bullish pin bar';
  if (p.morningStar) return 'morning star';
  return 'bullish close';
}

function bearishRejectionLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bearishEngulfing) return 'bearish engulfing';
  if (p.shootingStar) return 'shooting star';
  if (p.pinBarBearish) return 'bearish pin bar';
  if (p.eveningStar) return 'evening star';
  return 'bearish close';
}
