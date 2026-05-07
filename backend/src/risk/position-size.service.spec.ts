import { PositionSizeService } from './position-size.service';

describe('PositionSizeService', () => {
  it('calculates position size from risk and stop distance', () => {
    const service = new PositionSizeService();
    const result = service.calculate(1000, 1, 100, 98);
    expect(result.riskAmount).toBe(10);
    expect(result.quantity).toBe(5);
  });
});
