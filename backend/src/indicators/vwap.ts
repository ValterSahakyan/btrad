import { Candle } from '../common/types/trading.types';

export const vwap = (candles: Candle[]): number => {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }

  return cumulativeVolume === 0 ? 0 : cumulativePriceVolume / cumulativeVolume;
};
