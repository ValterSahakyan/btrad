import { Candle } from '../common/types/trading.types';
import { detectSupportResistance } from './support-resistance';

export const detectBreakout = (
  candles: Candle[],
  lookback = 20,
): { longBreakout: boolean; shortBreakout: boolean; support: number; resistance: number } => {
  // Exclude the current candle so resistance isn't inflated by the breakout candle itself
  const priorCandles = candles.slice(-(lookback + 1), -1);
  const { support, resistance } = detectSupportResistance(priorCandles, lookback);
  const lastClose = candles.at(-1)?.close ?? 0;
  return {
    longBreakout: lastClose > resistance,
    shortBreakout: lastClose < support,
    support,
    resistance,
  };
};
