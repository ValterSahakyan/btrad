import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TradeStatus = 'paper_open' | 'take_profit' | 'stopped';

@Injectable()
export class PaperTradingService {
  constructor(private readonly prisma: PrismaService) {}

  async openFromSignal(signalId: string): Promise<unknown> {
    const signal = await this.prisma.signal.findUnique({ where: { id: signalId }, include: { symbol: true } });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }

    const trade = await this.prisma.trade.create({
      data: {
        signalId: signal.id,
        symbol: signal.symbol.symbol,
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        quantity: signal.positionSize,
        leverage: signal.leverage,
        margin: signal.riskAmount,
        status: 'paper_open',
        openedAt: new Date(),
      },
    });

    await this.prisma.signal.update({
      where: { id: signal.id },
      data: { status: 'paper_opened' },
    });

    return trade;
  }

  async closeTrade(tradeId: string, exitPrice?: number): Promise<unknown> {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId }, include: { signal: true } });
    if (!trade) {
      throw new NotFoundException('Trade not found');
    }

    const resolvedExitPrice = exitPrice ?? trade.signal?.takeProfit1 ?? trade.entryPrice;
    const directionMultiplier = trade.direction === 'LONG' ? 1 : -1;
    const pnl = (resolvedExitPrice - trade.entryPrice) * trade.quantity * directionMultiplier;
    const pnlPercent = trade.margin === 0 ? 0 : (pnl / trade.margin) * 100;
    const status: TradeStatus = pnl >= 0 ? 'take_profit' : 'stopped';

    return this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        exitPrice: resolvedExitPrice,
        pnl,
        pnlPercent,
        status,
        closedAt: new Date(),
      },
    });
  }
}
