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

  async exportDailyCsv(date?: string): Promise<{ filename: string; csv: string }> {
    const { start, end, label } = resolveUtcDayRange(date);
    const signals = await this.prisma.signal.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        symbol: true,
        trades: {
          select: {
            id: true,
            pnl: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'id',
      'createdAtUtc',
      'expiresAtUtc',
      'symbol',
      'direction',
      'strategy',
      'status',
      'entryPrice',
      'stopLoss',
      'takeProfit1',
      'takeProfit2',
      'leverage',
      'positionSize',
      'riskAmount',
      'riskReward',
      'hotScore',
      'confidenceScore',
      'tradeCount',
      'tradeStatuses',
      'tradeTotalPnl',
    ];

    const rows = signals.map((signal) => [
      signal.id,
      signal.createdAt.toISOString(),
      signal.expiresAt.toISOString(),
      signal.symbol.symbol,
      signal.direction,
      signal.strategy,
      signal.status,
      num(signal.entryPrice),
      num(signal.stopLoss),
      num(signal.takeProfit1),
      num(signal.takeProfit2),
      num(signal.leverage),
      num(signal.positionSize),
      num(signal.riskAmount),
      num(signal.riskReward),
      num(signal.hotScore),
      num(signal.confidenceScore),
      num(signal.trades.length),
      signal.trades.map((trade) => trade.status).join('|'),
      num(signal.trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)),
    ]);

    return {
      filename: `signals-${label}.csv`,
      csv: toCsv(header, rows),
    };
  }
}

function resolveUtcDayRange(date?: string): { start: Date; end: Date; label: string } {
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const label = start.toISOString().slice(0, 10);
  return { start, end, label };
}

function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
