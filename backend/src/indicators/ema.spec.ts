import { ema } from './ema';

describe('ema', () => {
  it('calculates an EMA series', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result.at(-1)).toBeCloseTo(4.0625, 4);
  });
});
