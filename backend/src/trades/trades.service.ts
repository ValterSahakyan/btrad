import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paperTradingService: PaperTradingService,
  ) {}

  async list() {
    return this.prisma.trade.findMany({
      include: { signal: true, orders: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getById(id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: { signal: true, orders: true },
    });
    if (!trade) {
      throw new NotFoundException('Trade not found');
    }
    return trade;
  }

  async closePaper(id: string) {
    return this.paperTradingService.closeTrade(id);
  }

  async closeLive(_id: string) {
    return { success: false, message: 'Live close flow is not enabled in the MVP' };
  }
}
