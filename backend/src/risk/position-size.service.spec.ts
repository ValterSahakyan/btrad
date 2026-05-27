import { PositionSizeService } from './position-size.service';

describe('PositionSizeService', () => {
  const svc = new PositionSizeService();

  // Pass confidenceScore=80 (78–84 bracket → 1.0× multiplier) for deterministic baseline tests
  it('calculates position size from risk and stop distance', () => {
    const result = svc.calculate(1000, 1, 100, 98, 0.001, 0, 0, 80);
    expect(result.riskAmount).toBe(10);
    expect(result.quantity).toBe(5);
  });

  it('scales riskAmount down for borderline confidence (<72 → 0.5×)', () => {
    const result = svc.calculate(1000, 1, 100, 98, 0.001, 0, 0, 65);
    expect(result.riskAmount).toBeCloseTo(5, 5);
  });

  it('scales riskAmount up for high confidence (>=85 → 1.25×)', () => {
    const result = svc.calculate(1000, 1, 100, 98, 0.001, 0, 0, 90);
    expect(result.riskAmount).toBeCloseTo(12.5, 5);
  });

  it('floors quantity to minNotionalUsd when risk formula is too small', () => {
    // balance=$60, risk=7% → riskAmount=$4.20; SL 2% → rawNotional=$210 → cap at $10
    // With minNotional=$10 the result should be pinned at $10 / entryPrice
    const result = svc.calculate(60, 7, 100, 98, 0.001, 10, 10, 80);
    expect(result.quantity * 100).toBeCloseTo(10, 1);
  });

  it('respects maxNotionalUsd ceiling even when risk formula is larger', () => {
    // riskAmount=$70, SL 1% → rawNotional=$7000 → capped at $15
    const result = svc.calculate(10000, 0.7, 100, 99, 0.001, 15, 10, 80);
    expect(result.quantity * 100).toBeCloseTo(15, 1);
  });

  it('min is applied before max so max still wins when min>max', () => {
    // Defensive: if somehow minNotional > maxNotional, max wins
    const result = svc.calculate(1000, 1, 100, 99, 0.001, 5, 20, 80);
    expect(result.quantity * 100).toBeCloseTo(5, 1);
  });

  it('returns zero quantity when stopDistance is zero', () => {
    const result = svc.calculate(1000, 1, 100, 100, 0.001, 0, 0, 80);
    expect(result.quantity).toBe(0);
  });

  it('bumps up one step when floor truncation drops notional below minimum', () => {
    // ETH-style: entry=$3000, stepSize=0.001, minNotional=$10
    // minQty = 10/3000 = 0.003333 → floor to stepSize → 0.003 → notional=$9 < $10
    // Should bump to 0.004 → notional=$12 >= $10
    const result = svc.calculate(10, 100, 3000, 2970, 0.001, 15, 10, 80);
    expect(result.quantity * 3000).toBeGreaterThanOrEqual(10);
    expect(result.quantity * 3000).toBeLessThanOrEqual(15);
  });

  it('stays within [min, max] range for any valid setup', () => {
    const minUsd = 10;
    const maxUsd = 15;
    const result = svc.calculate(60, 7, 3000, 2940, 0.001, maxUsd, minUsd, 85);
    const notional = result.quantity * 3000;
    expect(notional).toBeGreaterThanOrEqual(minUsd);
    expect(notional).toBeLessThanOrEqual(maxUsd + 3000 * 0.001);
  });
});
