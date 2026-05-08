import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderExecutionService } from '../execution/order-execution.service';
import { LogsService } from '../logs/logs.service';

@Injectable()
export class SignalsService {
  private static readonly CLEANUP_STATUSES = ['skipped', 'expired', 'failed', 'cancelled'] as const;

  constructor(
    private readonly prisma: PrismaService,
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

  async approveLive(id: string, actor = 'system') {
    await this.logsService.warn('signals', 'Live trade approval requested', { signalId: id, actor });
    await this.logsService.audit('signal.approve_live', actor, { signalId: id });
    return this.orderExecutionService.approveLive(id, actor);
  }

  async skip(id: string) {
    return this.prisma.signal.update({ where: { id }, data: { status: 'skipped' } });
  }

  async cancel(id: string) {
    return this.prisma.signal.update({ where: { id }, data: { status: 'cancelled' } });
  }

  async cleanupOldSignals(actor = 'system', olderThanDays = 0) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const deleted = await this.prisma.signal.deleteMany({
      where: {
        status: { in: [...SignalsService.CLEANUP_STATUSES] },
        ...(olderThanDays > 0 ? { createdAt: { lt: cutoff } } : {}),
        trades: { none: {} },
      },
    });

    await this.logsService.info('signals', 'Terminal signals cleaned up', {
      actor,
      olderThanDays,
      deletedCount: deleted.count,
      statuses: [...SignalsService.CLEANUP_STATUSES],
    });
    await this.logsService.audit('signal.cleanup_old', actor, {
      olderThanDays,
      deletedCount: deleted.count,
      statuses: [...SignalsService.CLEANUP_STATUSES],
    });

    return {
      deletedCount: deleted.count,
      olderThanDays,
      statuses: [...SignalsService.CLEANUP_STATUSES],
      message:
        olderThanDays > 0
          ? `Deleted ${deleted.count} terminal signal${deleted.count === 1 ? '' : 's'} older than ${olderThanDays} day${olderThanDays === 1 ? '' : 's'}.`
          : `Deleted ${deleted.count} terminal signal${deleted.count === 1 ? '' : 's'} with no linked trades.`,
    };
  }
}
