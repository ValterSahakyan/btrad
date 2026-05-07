import { ConfidenceScoreService } from './confidence-score.service';

describe('ConfidenceScoreService', () => {
  it('combines weighted scores', () => {
    const service = new ConfidenceScoreService();
    expect(
      service.calculate({
        hotScore: 80,
        strategyScore: 85,
        marketScore: 75,
        liquidityScore: 90,
        riskScore: 70,
      }),
    ).toBeCloseTo(81, 0);
  });
});
