import { Candle } from '../common/types/trading.types';
import { detectBreakout } from './breakout';

describe('detectBreakout', () => {
  it('flags a long breakout when the last close is near resistance', () => {
    const candles: Candle[] = [
      { openTime: 1, open: 10, high: 11, low: 9, close: 10.5, volume: 1, closeTime: 2 },
      { openTime: 2, open: 10.5, high: 11.5, low: 10, close: 11, volume: 1, closeTime: 3 },
      { openTime: 3, open: 11, high: 12, low: 10.8, close: 12.1, volume: 1, closeTime: 4 },
    ];
    const result = detectBreakout(candles);
    expect(result.longBreakout).toBe(true);
  });
});
