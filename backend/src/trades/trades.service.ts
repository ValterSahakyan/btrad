import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
  ) {}

  async list() {
    const openTradesQ = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      include: { signal: true, orders: true },
      orderBy: { createdAt: 'desc' },
    });

    const closedTradesQ = await this.prisma.trade.findMany({
      where: { status: { not: 'live_open' } },
      include: { signal: true, orders: true },
      orderBy: { closedAt: 'desc' },
    });

    const trades = [...openTradesQ, ...closedTradesQ];

    try {
      const positions = await this.binanceService.fetchOpenPositions();
      const posMap = new Map(positions.map((p) => [p.symbol, p]));
      const openTrades = trades.filter((t) => t.status === 'live_open');

      const hydratedTrades = trades.map((trade) => {
        if (trade.status !== 'live_open') return trade;
        const pos = posMap.get(trade.symbol);
        if (!pos) return trade;
        const unrealizedPnl = Number(pos.unRealizedProfit);
        const pnlPercent = trade.margin > 0 ? (unrealizedPnl / trade.margin) * 100 : 0;
        return {
          ...trade,
          pnl: unrealizedPnl,
          pnlPercent,
          markPrice: Number(pos.markPrice),
        };
      });

      const dbOpenSymbols = new Set(openTrades.map((trade) => trade.symbol));
      const orphanTrades = positions
        .filter((position) => !dbOpenSymbols.has(position.symbol))
        .map((position) => {
          const quantity = Math.abs(Number(position.positionAmt));
          const entryPrice = Number(position.entryPrice);
          const leverage = Math.max(1, Number(position.leverage) || 1);
          const margin = quantity * entryPrice / leverage;
          return {
            id: `exchange:${position.symbol}`,
            signalId: null,
            symbol: position.symbol,
            direction: Number(position.positionAmt) > 0 ? 'LONG' : 'SHORT',
            entryPrice,
            exitPrice: null,
            quantity,
            leverage,
            margin: Number(margin.toFixed(4)),
            pnl: Number(position.unRealizedProfit),
            pnlPercent: margin > 0 ? (Number(position.unRealizedProfit) / margin) * 100 : 0,
            status: 'live_open',
            openedAt: new Date(position.updateTime || Date.now()),
            closedAt: null,
            createdAt: new Date(position.updateTime || Date.now()),
            updatedAt: new Date(position.updateTime || Date.now()),
            signal: null,
            orders: [],
            markPrice: Number(position.markPrice),
            orphanedFromDb: true,
          };
        });

      return [...orphanTrades, ...hydratedTrades];
    } catch {
      return trades;
    }
  }

  async getById(id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: { signal: true, orders: true },
    });
    if (!trade) throw new NotFoundException('Trade not found');
    return trade;
  }

  async closeLive(id: string, actor = 'system') {
    const trade = await this.prisma.trade.findUnique({ where: { id }, include: { orders: true } });
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.status !== 'live_open') throw new NotFoundException('Trade is not open');

    // Cancel only the SL/TP orders that belong to this trade
    const openOrders = trade.orders.filter((o) => o.status === 'open' && o.binanceOrderId);
    for (const order of openOrders) {
      await this.binanceService.cancelOrder(trade.symbol, order.binanceOrderId!)
        .catch(() => this.binanceService.cancelAlgoOrder(order.binanceOrderId!))
        .catch(async (err) => {
          await this.logsService.warn('trades', `Failed to cancel order ${order.binanceOrderId}`, {
            tradeId: id,
            symbol: trade.symbol,
            orderType: order.type,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    await this.prisma.order.updateMany({
      where: { tradeId: id, status: 'open' },
      data: { status: 'cancelled' },
    });

    const side = trade.direction === 'LONG' ? 'SELL' : 'BUY';
    const ts = Date.now();
    const posMode = await this.binanceService.getPositionMode();
    const positionSide = posMode === 'hedge'
      ? (trade.direction === 'LONG' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT'
      : ('BOTH' as const);
    const closeReduceOnly = posMode === 'one-way' ? true : undefined;

    let exitPrice: number;
    const closeResult = await this.binanceService.placeOrder({
      symbol: trade.symbol,
      side,
      type: 'MARKET',
      quantity: trade.quantity,
      reduceOnly: closeReduceOnly,
      positionSide,
      clientOrderId: `${id.slice(0, 8)}-close-${ts}`,
    }).catch(async (err) => {
      // Position may have already been closed by SL/TP on the exchange.
      // Finalize the DB record using mark price rather than throwing.
      await this.logsService.warn('trades', `Market close order failed — position likely already closed: ${err instanceof Error ? err.message : String(err)}`, {
        tradeId: id,
        symbol: trade.symbol,
      });
      return null;
    });

    if (closeResult === null) {
      exitPrice = await this.binanceService.fetchMarkPrice(trade.symbol);
    } else {
      const fillPrice = Number(closeResult.avgPrice);
      exitPrice = fillPrice > 0 ? fillPrice : await this.binanceService.fetchMarkPrice(trade.symbol);
    }

    const dirMult = trade.direction === 'LONG' ? 1 : -1;
    const pnl = (exitPrice - trade.entryPrice) * trade.quantity * dirMult;
    const pnlPercent = trade.margin === 0 ? 0 : (pnl / trade.margin) * 100;

    const updated = await this.prisma.trade.update({
      where: { id },
      data: {
        exitPrice,
        pnl: Number(pnl.toFixed(4)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        status: 'manually_closed',
        closedAt: new Date(),
      },
    });

    if (closeResult) {
      await this.prisma.order.create({
        data: {
          tradeId: id,
          binanceOrderId: String(closeResult.orderId),
          symbol: trade.symbol,
          side,
          type: 'MARKET',
          quantity: trade.quantity,
          price: exitPrice,
          status: 'filled',
          rawResponseJson: closeResult as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.logsService.info('trades', 'Live trade manually closed', {
      tradeId: id,
      symbol: trade.symbol,
      exitPrice,
      pnl,
    });
    await this.logsService.audit('trade.close_live', actor, { tradeId: id, symbol: trade.symbol });

    return updated;
  }

  async clearClosed(): Promise<{ deletedCount: number; message: string }> {
    const closedStatuses = [
      'live_closed', 'stopped',
      'take_profit', 'time_stop', 'manually_closed', 'failed',
    ] as const;

    const rows = await this.prisma.trade.findMany({
      where: { status: { in: [...closedStatuses] as never } },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { deletedCount: 0, message: 'No closed trades to clear' };

    // Orders must be deleted first — no cascade configured
    await this.prisma.order.deleteMany({ where: { tradeId: { in: ids } } });
    const result = await this.prisma.trade.deleteMany({ where: { id: { in: ids } } });

    await this.logsService.info('trades', 'Closed trades cleared', { count: result.count });
    await this.logsService.audit('trade.clear_closed', 'system', { count: result.count });

    return {
      deletedCount: result.count,
      message: `Cleared ${result.count} closed trade${result.count !== 1 ? 's' : ''}`,
    };
  }

  async exportDailyCsv(date?: string): Promise<{ filename: string; csv: string }> {
    const { start, end, label } = resolveUtcDayRange(date);
    const trades = await this.prisma.trade.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        signal: {
          select: {
            strategy: true,
            confidenceScore: true,
            riskReward: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'id',
      'createdAtUtc',
      'openedAtUtc',
      'closedAtUtc',
      'symbol',
      'direction',
      'strategy',
      'status',
      'entryPrice',
      'exitPrice',
      'quantity',
      'leverage',
      'margin',
      'pnl',
      'pnlPercent',
      'signalConfidenceScore',
      'signalRiskReward',
    ];

    const rows = trades.map((trade) => [
      trade.id,
      toIso(trade.createdAt),
      toIso(trade.openedAt),
      toIso(trade.closedAt),
      trade.symbol,
      trade.direction,
      trade.signal?.strategy ?? '',
      trade.status,
      num(trade.entryPrice),
      num(trade.exitPrice),
      num(trade.quantity),
      num(trade.leverage),
      num(trade.margin),
      num(trade.pnl),
      num(trade.pnlPercent),
      num(trade.signal?.confidenceScore),
      num(trade.signal?.riskReward),
    ]);

    return {
      filename: `trades-${label}.csv`,
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

function toIso(value: Date | null): string {
  return value ? value.toISOString() : '';
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
