import { toFixedStep } from './binance.utils';

describe('toFixedStep', () => {
  it('formats quantities to step and precision', () => {
    expect(toFixedStep(1.23456, 0.01, 2)).toBe(1.23);
  });
});
