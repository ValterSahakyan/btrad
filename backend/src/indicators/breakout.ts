import { Candle } from '../common/types/trading.types';
import { detectSupportResistance } from './support-resistance';

export const detectBreakout = (candles: Candle[]): { longBreakout: boolean; shortBreakout: boolean; support: number; resistance: number } => {
  const { support, resistance } = detectSupportResistance(candles);
  const lastClose = candles.at(-1)?.close ?? 0;
  return {
    longBreakout: lastClose > resistance * 0.998,
    shortBreakout: lastClose < support * 1.002,
    support,
    resistance,
  };
};
