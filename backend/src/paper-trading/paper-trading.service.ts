import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TradeStatus = 'paper_open' | 'take_profit' | 'stopped';

@Injectable()
export class PaperTradingService {
  constructor(private readonly prisma: PrismaService) {}

  async openFromSignal(signalId: string): Promise<unknown> {
    const claimed = await this.prisma.signal.updateMany({
      where: { id: signalId, status: { in: ['active', 'pending'] } },
      data: { status: 'approved' },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.signal.findUnique({ where: { id: signalId } });
      if (!current) throw new NotFoundException('Signal not found');
      throw new BadRequestException(`Signal cannot be paper traded (current status: ${current.status})`);
    }

    const signal = await this.prisma.signal.findUnique({ where: { id: signalId }, include: { symbol: true } });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    if (signal.expiresAt < new Date()) {
      await this.prisma.signal.update({ where: { id: signal.id }, data: { status: 'expired' } });
      throw new BadRequestException('Signal has expired');
    }

    const existingOpenTrade = await this.prisma.trade.findFirst({
      where: { symbol: signal.symbol.symbol, status: { in: ['paper_open', 'live_open'] } },
    });
    if (existingOpenTrade) {
      await this.prisma.signal.update({ where: { id: signal.id }, data: { status: 'active' } });
      throw new BadRequestException(`A trade for ${signal.symbol.symbol} is already open`);
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
    if (trade.status !== 'paper_open') {
      throw new BadRequestException('Trade is not an open paper trade');
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
