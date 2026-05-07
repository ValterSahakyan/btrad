import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { OrderExecutionService } from '../execution/order-execution.service';
import { LogsService } from '../logs/logs.service';

@Injectable()
export class SignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paperTradingService: PaperTradingService,
    private readonly orderExecutionService: OrderExecutionService,
    private readonly logsService: LogsService,
  ) {}

  async list() {
    return this.prisma.signal.findMany({
      include: { symbol: true, trades: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getById(id: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { id },
      include: { symbol: true, trades: { include: { orders: true } } },
    });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    return signal;
  }

  async approvePaper(id: string) {
    const signal = await this.prisma.signal.findUnique({ where: { id } });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.expiresAt < new Date()) throw new BadRequestException('Signal has expired');
    await this.logsService.info('signals', 'Paper trade approved', { signalId: id });
    await this.prisma.signal.update({ where: { id }, data: { status: 'approved' } });
    return this.paperTradingService.openFromSignal(id);
  }

  async approveLive(id: string) {
    await this.logsService.warn('signals', 'Live trade approval requested', { signalId: id });
    return this.orderExecutionService.approveLive(id);
  }

  async skip(id: string) {
    return this.prisma.signal.update({ where: { id }, data: { status: 'skipped' } });
  }

  async cancel(id: string) {
    return this.prisma.signal.update({ where: { id }, data: { status: 'cancelled' } });
  }
}
