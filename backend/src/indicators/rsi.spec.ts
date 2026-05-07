import { rsi } from './rsi';

describe('rsi', () => {
  it('calculates RSI values', () => {
    const result = rsi([44, 44.15, 43.9, 44.35, 44.8, 45.1, 44.95, 45.4, 45.8, 46.1, 45.6, 45.9, 46.4, 46.2, 46.8, 47.1], 14);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBeGreaterThan(50);
  });
});
