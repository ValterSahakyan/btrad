import { ConfigService } from '@nestjs/config';
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
    const config = new ConfigService({
      riskPerTradePercent: 1,
      maxOpenTrades: 2,
      maxDailyLossPercent: 3,
      maxConsecutiveLosses: 3,
      maxLeverage: 5,
      minRiskReward: 1.5,
      defaultLeverage: 3,
    });
    const binance = { fetchAccountBalance: jest.fn().mockResolvedValue([]) };
    const service = new RiskEngineService(prisma as never, config, binance as never, new PositionSizeService());

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
