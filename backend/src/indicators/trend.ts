import { Candle } from '../common/types/trading.types';
import { ema } from './ema';

export const detectTrend = (candles: Candle[]): 'bullish' | 'bearish' | 'sideways' => {
  const closes = candles.map((c) => c.close);
  const last = closes.at(-1) ?? 0;
  const ema20 = ema(closes, 20).at(-1) ?? last;
  const ema50 = ema(closes, 50).at(-1) ?? last;

  // If we have enough candles, use EMA200 for stronger confirmation
  if (closes.length >= 200) {
    const ema200 = ema(closes, 200).at(-1) ?? last;
    if (last > ema20 && ema20 > ema50 && ema50 > ema200) return 'bullish';
    if (last < ema20 && ema20 < ema50 && ema50 < ema200) return 'bearish';
    // Partial alignment
    if (last > ema50 && ema50 > ema200) return 'bullish';
    if (last < ema50 && ema50 < ema200) return 'bearish';
    return 'sideways';
  }

  // Fallback: EMA20/EMA50 only
  if (last > ema20 && ema20 > ema50) return 'bullish';
  if (last < ema20 && ema20 < ema50) return 'bearish';
  return 'sideways';
};
