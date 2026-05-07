import { Candle } from '../common/types/trading.types';

export const detectSupportResistance = (candles: Candle[], lookback = 20): { support: number; resistance: number } => {
  const window = candles.slice(-lookback);
  const support = Math.min(...window.map((candle) => candle.low));
  const resistance = Math.max(...window.map((candle) => candle.high));
  return { support, resistance };
};
