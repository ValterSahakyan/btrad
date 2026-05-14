import { Candle } from '../common/types/trading.types';

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  /** Top of the order block candle's body */
  high: number;
  /** Bottom of the order block candle's body */
  low: number;
}

/**
 * Detects institutional Order Blocks (OBs) in the last 40 candles.
 *
 * A Bullish OB is the last bearish candle before a significant upward impulse —
 * institutions are believed to have accumulated longs there.
 * A Bearish OB is the last bullish candle before a significant downward impulse.
 *
 * When price returns to an OB zone it often bounces — institutions re-enter at the
 * same level where they originally built their position.
 *
 * Source: ICT Inner Circle Trader / Smart Money Concepts (SMC).
 */
export function detectOrderBlocks(candles: Candle[], minImpulsePct = 0.4, scanBack = 40): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const start = Math.max(0, candles.length - scanBack);

  for (let i = start; i < candles.length - 4; i++) {
    const c = candles[i];
    const isCandleBear = c.close < c.open;
    const isCandleBull = c.close > c.open;

    // Measure the impulse over the next 3 candles
    const next3 = candles.slice(i + 1, i + 4);
    const maxImpulseHigh = Math.max(...next3.map((n) => n.high));
    const minImpulseLow = Math.min(...next3.map((n) => n.low));

    // Bullish OB: bearish candle, followed by upward impulse
    if (isCandleBear) {
      const impulsePct = ((maxImpulseHigh - c.open) / c.open) * 100;
      if (impulsePct >= minImpulsePct && currentPrice > c.low) {
        // OB body: open (top) to close (bottom) of the bearish candle
        blocks.push({ type: 'bullish', high: c.open, low: c.close });
      }
    }

    // Bearish OB: bullish candle, followed by downward impulse
    if (isCandleBull) {
      const impulsePct = ((c.open - minImpulseLow) / c.open) * 100;
      if (impulsePct >= minImpulsePct && currentPrice < c.high) {
        // OB body: close (top) to open (bottom) of the bullish candle
        blocks.push({ type: 'bearish', high: c.close, low: c.open });
      }
    }
  }

  // Return the 4 most recent valid OBs
  return blocks.slice(-4);
}

/**
 * Returns the nearest OB whose zone (±bufferAtr) contains `price`.
 */
export function priceNearOrderBlock(
  price: number,
  blocks: OrderBlock[],
  atr: number,
  bufferAtr = 0.3,
): OrderBlock | null {
  const buf = atr * bufferAtr;
  return blocks.find((ob) => price >= ob.low - buf && price <= ob.high + buf) ?? null;
}
