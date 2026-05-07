import { RiskEngineService } from './risk-engine.service';
import { PositionSizeService } from './position-size.service';

describe('RiskEngineService', () => {
  it('blocks expired signals', async () => {
    const prisma = {
      botSettings: { findFirst: jest.fn().mockResolvedValue(null) },
      trade: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const binance = { fetchAccountBalance: jest.fn().mockResolvedValue([]) };
    const service = new RiskEngineService(prisma as never, binance as never, new PositionSizeService());

    const result = await service.validateSignal({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 100,
      stopLoss: 99,
      riskReward: 2,
      spread: 0.1,
      confidenceScore: 80,
      expiresAt: new Date(Date.now() - 60_000),
      marketRegime: 'bullish',
    });

    expect(result.allowed).toBe(false);
    expect(result.messages).toContain('Signal expired');
  });
});
