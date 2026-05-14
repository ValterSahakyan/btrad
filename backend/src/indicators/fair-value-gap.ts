import { Candle } from '../common/types/trading.types';

export interface FairValueGap {
  type: 'bullish' | 'bearish';
  /** Upper boundary of the gap */
  top: number;
  /** Lower boundary of the gap */
  bottom: number;
}

/**
 * Detects Fair Value Gaps (FVGs / price imbalances) in the last 30 candles.
 *
 * A 3-candle FVG forms when the middle candle's move is so strong that it
 * leaves a gap between candle[i].high and candle[i+2].low (bullish) or
 * candle[i+2].high and candle[i].low (bearish).  Price tends to revisit
 * ("fill") these gaps, making them high-probability entry or TP zones.
 *
 * Source: ICT Inner Circle Trader — "Dealing Range / Price Imbalance" concepts.
 */
export function detectFairValueGaps(candles: Candle[], scanBack = 30): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const start = Math.max(0, candles.length - scanBack);

  for (let i = start; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c3 = candles[i + 2];

    // Bullish FVG: gap between the top of c1 and the bottom of c3
    if (c3.low > c1.high) {
      // Only track if price hasn't fully passed down through it
      if (currentPrice >= c1.high) {
        gaps.push({ type: 'bullish', bottom: c1.high, top: c3.low });
      }
    }

    // Bearish FVG: gap between the bottom of c1 and the top of c3
    if (c3.high < c1.low) {
      // Only track if price hasn't fully passed up through it
      if (currentPrice <= c1.low) {
        gaps.push({ type: 'bearish', top: c1.low, bottom: c3.high });
      }
    }
  }

  // Return the most recent 5 gaps
  return gaps.slice(-5);
}

/** Returns the FVG if price is currently sitting inside it (filling the gap). */
export function priceInFvg(price: number, fvgs: FairValueGap[]): FairValueGap | null {
  return fvgs.find((g) => price >= g.bottom && price <= g.top) ?? null;
}

/** Returns the nearest FVG whose midpoint is within `tolerance` of `price`. */
export function priceNearFvg(price: number, fvgs: FairValueGap[], tolerance: number): FairValueGap | null {
  return (
    fvgs.find((g) => {
      const mid = (g.top + g.bottom) / 2;
      return Math.abs(price - mid) <= tolerance;
    }) ?? null
  );
}
