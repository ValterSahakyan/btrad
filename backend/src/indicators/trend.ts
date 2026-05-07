import { Candle } from '../common/types/trading.types';
import { ema } from './ema';

export const detectTrend = (candles: Candle[]): 'bullish' | 'bearish' | 'sideways' => {
  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20).at(-1) ?? closes.at(-1) ?? 0;
  const ema50 = ema(closes, 50).at(-1) ?? closes.at(-1) ?? 0;
  const last = closes.at(-1) ?? 0;

  if (last > ema20 && ema20 > ema50) {
    return 'bullish';
  }
  if (last < ema20 && ema20 < ema50) {
    return 'bearish';
  }
  return 'sideways';
};
