import { Candle } from '../common/types/trading.types';

export const detectSupportResistance = (candles: Candle[], lookback = 20): { support: number; resistance: number } => {
  const window = candles.slice(-lookback);
  const support = Math.min(...window.map((candle) => candle.low));
  const resistance = Math.max(...window.map((candle) => candle.high));
  return { support, resistance };
};

export interface StrongLevel {
  price: number;
  /** Number of swing touches — higher = stronger level */
  strength: number;
}

/**
 * Identifies support and resistance levels by clustering swing pivot points.
 * Levels tested multiple times carry more weight than single-touch extremes.
 *
 * This is a significant improvement over the simple min/max approach because
 * "well-tested" levels respect far more reliably on retests.
 *
 * Source: John Murphy "Technical Analysis of the Financial Markets",
 *         Stan Weinstein "Secrets For Profiting in Bull and Bear Markets".
 */
export function detectSwingLevels(
  candles: Candle[],
  lookback = 24,
  swingSize = 2,
  proximityPct = 0.004,
): { support: StrongLevel; resistance: StrongLevel } {
  const window = candles.slice(-lookback);
  const currentPrice = window[window.length - 1]?.close ?? 0;

  // Collect swing pivot highs and lows
  const swingHighPrices: number[] = [];
  const swingLowPrices: number[] = [];

  for (let i = swingSize; i < window.length - swingSize; i++) {
    const c = window[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - swingSize; j <= i + swingSize; j++) {
      if (j === i) continue;
      if (window[j].high >= c.high) isHigh = false;
      if (window[j].low <= c.low) isLow = false;
    }
    if (isHigh) swingHighPrices.push(c.high);
    if (isLow) swingLowPrices.push(c.low);
  }

  // Cluster nearby pivots — pivots within proximityPct of each other form one level
  function cluster(prices: number[]): Array<{ price: number; count: number }> {
    const groups: Array<{ price: number; count: number }> = [];
    const sorted = [...prices].sort((a, b) => a - b);
    for (const p of sorted) {
      const existing = groups.find((g) => Math.abs(g.price - p) / Math.max(g.price, 1) < proximityPct);
      if (existing) {
        existing.price = (existing.price * existing.count + p) / (existing.count + 1);
        existing.count++;
      } else {
        groups.push({ price: p, count: 1 });
      }
    }
    return groups;
  }

  const resClusters = cluster(swingHighPrices).filter((g) => g.price > currentPrice);
  const supClusters = cluster(swingLowPrices).filter((g) => g.price < currentPrice);

  // Pick the strongest (most-touched) level closest to current price
  const bestRes = resClusters.sort((a, b) => {
    const distA = a.price - currentPrice;
    const distB = b.price - currentPrice;
    // Prefer high-strength levels; break ties by proximity
    return b.count * 10 - a.count * 10 + distA - distB;
  })[0];

  const bestSup = supClusters.sort((a, b) => {
    const distA = currentPrice - a.price;
    const distB = currentPrice - b.price;
    return b.count * 10 - a.count * 10 + distA - distB;
  })[0];

  const fallbackRes = Math.max(...window.map((c) => c.high));
  const fallbackSup = Math.min(...window.map((c) => c.low));

  return {
    support: { price: bestSup?.price ?? fallbackSup, strength: bestSup?.count ?? 1 },
    resistance: { price: bestRes?.price ?? fallbackRes, strength: bestRes?.count ?? 1 },
  };
}
