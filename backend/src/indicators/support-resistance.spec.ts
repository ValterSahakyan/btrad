import { Candle } from '../common/types/trading.types';
import { detectSupportResistance } from './support-resistance';

describe('detectSupportResistance', () => {
  it('detects support and resistance from candles', () => {
    const candles: Candle[] = [
      { openTime: 1, open: 10, high: 12, low: 9, close: 11, volume: 10, closeTime: 2 },
      { openTime: 2, open: 11, high: 13, low: 10, close: 12, volume: 10, closeTime: 3 },
      { openTime: 3, open: 12, high: 14, low: 8, close: 13, volume: 10, closeTime: 4 },
    ];
    const result = detectSupportResistance(candles, 3);
    expect(result.support).toBe(8);
    expect(result.resistance).toBe(14);
  });
});
