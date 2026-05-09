import { Candle, MarketRegimeResult } from '../common/types/trading.types';
import { PullbackContinuationStrategy } from './pullback-continuation.strategy';
import { StrategyContext } from './strategy.interface';

describe('PullbackContinuationStrategy', () => {
  const strategy = new PullbackContinuationStrategy();
  const marketRegime: MarketRegimeResult = {
    regime: 'bullish',
    score: 82,
    btcTrend: 'bullish',
    ethTrend: 'bullish',
    volatility: 2.1,
    caution: [],
  };

  const baseContext = (candles15m: Candle[], candles1h: Candle[]): StrategyContext => ({
    symbol: 'TESTUSDT',
    candles15m,
    candles1h,
    hotScore: 74,
    spread: 0.18,
    marketRegime,
    minRiskReward: 1.5,
    strategyConfig: {
      breakout: {
        enabled: true,
        minVolumeRatio: 1.5,
        lookbackPeriod: 20,
        maxSlPercent: 5,
        tp1Multiplier: 1.5,
        tp2Multiplier: 2.5,
        minHotScore: 55,
      },
      pullback: {
        enabled: true,
        rsiLongMin: 38,
        rsiLongMax: 60,
        rsiShortMin: 42,
        rsiShortMax: 62,
        atrMultiplier: 1.5,
        maxSlPercent: 4,
        minHotScore: 40,
      },
      reversion: {
        enabled: true,
        rsiOverbought: 75,
        rsiOversold: 25,
        vwapDeviationPct: 3,
        volumeDeclineRatio: 0.6,
        maxSlPercent: 5,
      },
      trendReclaim: {
        enabled: true,
        emaBufferAtr: 0.35,
        reclaimVolumeRatio: 1.1,
        maxSlPercent: 3.5,
        tp1Multiplier: 1.4,
        tp2Multiplier: 2.3,
        minHotScore: 50,
      },
      rangeBounce: {
        enabled: true,
        lookbackPeriod: 24,
        proximityAtr: 0.8,
        rsiLongMax: 45,
        rsiShortMin: 55,
        maxSlPercent: 3.2,
        tp1Multiplier: 1.3,
        tp2Multiplier: 2,
        minHotScore: 35,
      },
    },
  });

  it('accepts a strong bullish pullback reclaim', () => {
    const candles1h = buildBullishCandles(60, 100, 0.12, 0.1);
    const candles15m = buildBullishCandles(60, 100, 0.1, 0.08);
    const reclaimSequence = [106.4, 106.25, 106.1, 105.95, 105.8, 105.65, 105.5, 105.35, 105.2, 105.1, 105.0, 104.92, 105.05, 105.28];

    applySequence(candles15m, 46, reclaimSequence, 104.98);

    const signal = strategy.evaluate(baseContext(candles15m, candles1h));

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('LONG');
    expect(signal?.strategyScore).toBeGreaterThanOrEqual(80);
  });

  it('rejects a weak reclaim candle even when trend is bullish', () => {
    const candles1h = buildBullishCandles(60, 100, 0.12, 0.1);
    const candles15m = buildBullishCandles(60, 100, 0.1, 0.08);
    const weakSequence = [106.4, 106.25, 106.1, 105.95, 105.8, 105.65, 105.5, 105.35, 105.2, 105.1, 105.0, 104.92, 105.05, 105.12];

    applySequence(candles15m, 46, weakSequence, 105.08);

    const signal = strategy.evaluate(baseContext(candles15m, candles1h));

    expect(signal).toBeNull();
  });
});

function buildBullishCandles(count: number, start: number, drift: number, wave: number): Candle[] {
  const candles: Candle[] = [];

  for (let i = 0; i < count; i += 1) {
    const open = start + i * drift + Math.sin(i / 5) * wave;
    const close = open + 0.08 + Math.cos(i / 6) * 0.03;
    const high = Math.max(open, close) + 0.14;
    const low = Math.min(open, close) - 0.14;
    candles.push(makeCandle(open, close, high, low, close, 1000 + i * 20, i));
  }

  return candles;
}

function applySequence(candles: Candle[], startIndex: number, closes: number[], finalOpen: number): void {
  for (let i = 0; i < closes.length; i += 1) {
    const index = startIndex + i;
    const prevClose = i === 0 ? candles[index - 1].close : closes[i - 1];
    const close = closes[i];
    const open = i === closes.length - 1 ? finalOpen : prevClose + (close < prevClose ? 0.02 : -0.02);
    const high = Math.max(open, close) + 0.11;
    const low = Math.min(open, close) - 0.13;
    candles[index] = makeCandle(open, close, high, low, close, 1500 + i * 80, index);
  }
}

function makeCandle(
  open: number,
  close: number,
  high: number,
  low: number,
  lastPrice: number,
  volume: number,
  index: number,
): Candle {
  const openTime = index * 60_000;
  const closeTime = openTime + 59_999;

  return {
    openTime,
    open,
    high: Math.max(high, open, close, lastPrice),
    low: Math.min(low, open, close, lastPrice),
    close: lastPrice,
    volume,
    closeTime,
  };
}
