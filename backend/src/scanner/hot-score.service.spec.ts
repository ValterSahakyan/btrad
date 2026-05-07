import { HotScoreService } from './hot-score.service';

describe('HotScoreService', () => {
  it('calculates a hot score between 0 and 100', () => {
    const service = new HotScoreService();
    const score = service.calculate({
      volume24h: 10_000_000,
      priceChange24h: 8,
      volumeSpikeRatio: 2,
      volatility: 3,
      openInterest: 6_000_000,
      fundingRate: 0.001,
      spread: 0.1,
      liquidity: 90,
    });
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThanOrEqual(100);
  });
});
