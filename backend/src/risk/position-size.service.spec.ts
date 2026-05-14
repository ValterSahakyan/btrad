import { PositionSizeService } from './position-size.service';

describe('PositionSizeService', () => {
  const svc = new PositionSizeService();

  it('calculates position size from risk and stop distance', () => {
    const result = svc.calculate(1000, 1, 100, 98);
    expect(result.riskAmount).toBe(10);
    expect(result.quantity).toBe(5);
  });

  it('floors quantity to minNotionalUsd when risk formula is too small', () => {
    // balance=$60, risk=7% → riskAmount=$4.20; SL 2% → rawNotional=$210 → cap at $10
    // With minNotional=$10 the result should be pinned at $10 / entryPrice
    const result = svc.calculate(60, 7, 100, 98, 0.001, 10, 10);
    expect(result.quantity * 100).toBeCloseTo(10, 1);
  });

  it('respects maxNotionalUsd ceiling even when risk formula is larger', () => {
    // riskAmount=$70, SL 1% → rawNotional=$7000 → capped at $15
    const result = svc.calculate(10000, 0.7, 100, 99, 0.001, 15, 10);
    expect(result.quantity * 100).toBeCloseTo(15, 1);
  });

  it('min is applied before max so max still wins when min>max', () => {
    // Defensive: if somehow minNotional > maxNotional, max wins
    const result = svc.calculate(1000, 1, 100, 99, 0.001, 5, 20);
    expect(result.quantity * 100).toBeCloseTo(5, 1);
  });

  it('returns zero quantity when stopDistance is zero', () => {
    const result = svc.calculate(1000, 1, 100, 100);
    expect(result.quantity).toBe(0);
  });
});
