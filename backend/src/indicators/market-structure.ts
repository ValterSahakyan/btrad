import { Candle } from '../common/types/trading.types';

export interface SwingPoint {
  price: number;
  index: number;
}

export interface MarketStructure {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  /** HH/HL = bullish, LH/LL = bearish, mixed = sideways */
  structureTrend: 'bullish' | 'bearish' | 'sideways';
  lastSwingHigh: number;
  lastSwingLow: number;
  /** Price just broke the last swing level in the direction of trend (continuation) */
  breakOfStructure: boolean;
  /** Price broke the OPPOSITE swing, signalling a potential trend flip */
  changeOfChar: boolean;
}

/**
 * Identifies swing pivots by requiring `lookback` bars on each side
 * to be strictly lower/higher than the pivot bar.
 */
function findSwings(
  candles: Candle[],
  lookback = 3,
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }

    if (isHigh) highs.push({ price: c.high, index: i });
    if (isLow) lows.push({ price: c.low, index: i });
  }

  return { highs, lows };
}

/**
 * Analyses market structure from a candle window.
 *
 * Concept: ICT / SMC — Higher Highs + Higher Lows = bullish structure.
 * Lower Highs + Lower Lows = bearish structure.
 * Break of Structure (BOS) = continuation; Change of Character (CHoCH) = reversal warning.
 *
 * Sources: ICT Inner Circle Trader concepts, Al Brooks "Trading Price Action".
 */
export function analyzeMarketStructure(candles: Candle[], lookback = 3): MarketStructure {
  const window = candles.slice(-60);
  const { highs, lows } = findSwings(window, lookback);
  const currentPrice = window[window.length - 1].close;

  const lastSwingHigh = highs.length > 0 ? highs[highs.length - 1].price : currentPrice * 1.02;
  const lastSwingLow = lows.length > 0 ? lows[lows.length - 1].price : currentPrice * 0.98;

  let structureTrend: 'bullish' | 'bearish' | 'sideways' = 'sideways';

  if (highs.length >= 2 && lows.length >= 2) {
    const hhPattern = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const hlPattern = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const llPattern = lows[lows.length - 1].price < lows[lows.length - 2].price;
    const lhPattern = highs[highs.length - 1].price < highs[highs.length - 2].price;

    if (hhPattern && hlPattern) structureTrend = 'bullish';
    else if (llPattern && lhPattern) structureTrend = 'bearish';
  }

  // BOS: price extends beyond the last swing in the current trend direction
  const breakOfStructure =
    (structureTrend === 'bullish' && currentPrice > lastSwingHigh) ||
    (structureTrend === 'bearish' && currentPrice < lastSwingLow);

  // CHoCH: price crosses the OPPOSITE swing — potential trend flip
  const changeOfChar =
    (structureTrend === 'bullish' && currentPrice < lastSwingLow) ||
    (structureTrend === 'bearish' && currentPrice > lastSwingHigh);

  return {
    swingHighs: highs,
    swingLows: lows,
    structureTrend,
    lastSwingHigh,
    lastSwingLow,
    breakOfStructure,
    changeOfChar,
  };
}
