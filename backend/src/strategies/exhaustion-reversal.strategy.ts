import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { atr } from '../indicators/atr';
import { detectCandlePatterns } from '../indicators/candlestick-patterns';
import { ema } from '../indicators/ema';
import { rsi, detectRsiDivergence } from '../indicators/rsi';
import { vwap } from '../indicators/vwap';
import { volumeAverage } from '../indicators/volume';
import { sessionScoreAdjustment } from '../settings/session-filter';
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
    const currentPrice = closes[closes.length - 1] ?? 0;
    const lastCandle = candles15m[candles15m.length - 1];
    const prevCandle = candles15m[candles15m.length - 2];

    if (!lastCandle || !prevCandle) return null;

    const rsiValues = rsi(closes, 14);
    const currentRsi = rsiValues[rsiValues.length - 1] ?? 50;
    const currentVwap = vwap(candles15m.slice(-96));
    const atr14 = atr(candles15m, 14);
    const ema20 = ema(closes, 20)[closes.length - 1] ?? currentPrice;

    const recentPeakVolume = Math.max(...volumes.slice(-6));
    const currentVolume = volumes[volumes.length - 1] ?? 0;
    const volumeDeclining = currentVolume < recentPeakVolume * cfg.volumeDeclineRatio;

    if (context.spread > 0.5 || atr14 <= 0) return null;
    if (context.marketRegime.regime === 'no_trade') return null;
    if (context.marketRegime.regime === 'high_volatility') return null;

    const vwapDeviation = currentVwap > 0 ? ((currentPrice - currentVwap) / currentVwap) * 100 : 0;

    const hostileBullTrend = context.marketRegime.regime === 'bullish';
    const hostileBearTrend = context.marketRegime.regime === 'bearish';
    const countertrendShortAllowed =
      !hostileBullTrend ||
      (currentRsi > cfg.rsiOverbought + 4 && vwapDeviation > cfg.vwapDeviationPct + 0.5);
    const countertrendLongAllowed =
      !hostileBearTrend ||
      (currentRsi < cfg.rsiOversold - 4 && vwapDeviation < -(cfg.vwapDeviationPct + 0.5));

    // Candlestick patterns — REQUIRED for exhaustion_reversal.
    // Fading a move without a reversal candle is the #1 cause of losses in mean-reversion.
    // Source: Steve Nison "Japanese Candlestick Charting Techniques" — always wait for
    // the reversal signal, never enter mid-impulse.
    const patterns = detectCandlePatterns(candles15m);

    // RSI divergence adds strong confirmation (Alexander Elder)
    const divergence = detectRsiDivergence(closes, rsiValues);

    // Session adjustment
    const sessionAdj = sessionScoreAdjustment();

    // ── SHORT: price exhausted after sharp pump ────────────────────────────────
    if (
      currentRsi > cfg.rsiOverbought &&
      vwapDeviation > cfg.vwapDeviationPct &&
      currentPrice > ema20 * 1.02 &&
      volumeDeclining &&
      prevCandle.close > prevCandle.open &&
      lastCandle.close < lastCandle.open &&
      countertrendShortAllowed
    ) {
      // REQUIRE a bearish reversal pattern — no pattern = no trade
      const hasBearishReversal =
        patterns.bearishEngulfing ||
        patterns.shootingStar ||
        patterns.pinBarBearish ||
        patterns.eveningStar ||
        patterns.bearishMarubozu;

      if (!hasBearishReversal) return null;

      const recentHigh = Math.max(...candles15m.slice(-5).map((c) => c.high));
      const stopLoss = recentHigh + atr14 * 0.5;
      const risk = stopLoss - currentPrice;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice - risk * 1.5;
      const takeProfit2 = Math.min(currentPrice - risk * 2.5, currentVwap);
      const riskReward = (currentPrice - takeProfit1) / risk;
      if (riskReward < context.minRiskReward) return null;

      // Score bonuses
      const patternBonus = patterns.bearishEngulfing ? 6 : patterns.shootingStar ? 4 : patterns.pinBarBearish ? 3 : 2;
      const divergenceBonus = divergence.bearishDivergence ? 6 : 0;
      const extremeRsiBonus = currentRsi > cfg.rsiOverbought + 8 ? 4 : 0;
      const strategyScore = Math.round(74 + patternBonus + divergenceBonus + extremeRsiBonus + sessionAdj);

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
          `Volume declining — sellers entering (${(currentVolume / recentPeakVolume * 100).toFixed(0)}% of peak)`,
          `Bearish reversal candle: ${bearishPatternLabel(patterns)}`,
          ...(divergence.bearishDivergence ? ['RSI bearish divergence confirmed'] : []),
        ],
        invalidationRules: [
          'RSI stays above 80 (momentum extension)',
          'Volume picks up on upside',
          'New local high above SL',
        ],
      };
    }

    // ── LONG: price exhausted after sharp dump ─────────────────────────────────
    if (
      currentRsi < cfg.rsiOversold &&
      vwapDeviation < -cfg.vwapDeviationPct &&
      currentPrice < ema20 * 0.98 &&
      volumeDeclining &&
      prevCandle.close < prevCandle.open &&
      lastCandle.close > lastCandle.open &&
      countertrendLongAllowed
    ) {
      const hasBullishReversal =
        patterns.bullishEngulfing ||
        patterns.hammer ||
        patterns.pinBarBullish ||
        patterns.morningStar ||
        patterns.bullishMarubozu;

      if (!hasBullishReversal) return null;

      const recentLow = Math.min(...candles15m.slice(-5).map((c) => c.low));
      const stopLoss = recentLow - atr14 * 0.5;
      const risk = currentPrice - stopLoss;
      if (risk <= 0 || risk / currentPrice > cfg.maxSlPercent / 100) return null;

      const takeProfit1 = currentPrice + risk * 1.5;
      const takeProfit2 = Math.max(currentPrice + risk * 2.5, currentVwap);
      const riskReward = (takeProfit1 - currentPrice) / risk;
      if (riskReward < context.minRiskReward) return null;

      const patternBonus = patterns.bullishEngulfing ? 6 : patterns.hammer ? 4 : patterns.pinBarBullish ? 3 : 2;
      const divergenceBonus = divergence.bullishDivergence ? 6 : 0;
      const extremeRsiBonus = currentRsi < cfg.rsiOversold - 8 ? 4 : 0;
      const strategyScore = Math.round(74 + patternBonus + divergenceBonus + extremeRsiBonus + sessionAdj);

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
          `Selling volume declining (${(currentVolume / recentPeakVolume * 100).toFixed(0)}% of peak)`,
          `Bullish reversal candle: ${bullishPatternLabel(patterns)}`,
          ...(divergence.bullishDivergence ? ['RSI bullish divergence confirmed'] : []),
        ],
        invalidationRules: [
          'RSI drops below 20 (momentum extension)',
          'Volume picks up on downside',
          'New local low below SL',
        ],
      };
    }

    return null;
  }
}

function bullishPatternLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bullishEngulfing) return 'bullish engulfing';
  if (p.hammer) return 'hammer';
  if (p.pinBarBullish) return 'bullish pin bar';
  if (p.morningStar) return 'morning star';
  if (p.bullishMarubozu) return 'bullish marubozu';
  return 'reversal bar';
}

function bearishPatternLabel(p: ReturnType<typeof detectCandlePatterns>): string {
  if (p.bearishEngulfing) return 'bearish engulfing';
  if (p.shootingStar) return 'shooting star';
  if (p.pinBarBearish) return 'bearish pin bar';
  if (p.eveningStar) return 'evening star';
  if (p.bearishMarubozu) return 'bearish marubozu';
  return 'reversal bar';
}
