import { PaperTradingService } from './paper-trading.service';

describe('PaperTradingService', () => {
  it('calculates paper-trade pnl when closing', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = new PaperTradingService({
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trade-1',
          direction: 'LONG',
          entryPrice: 100,
          quantity: 2,
          margin: 20,
          signal: { takeProfit1: 110 },
        }),
        update,
      },
    } as never);

    await service.closeTrade('trade-1', 110);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pnl: 20,
          pnlPercent: 100,
        }),
      }),
    );
  });
});
