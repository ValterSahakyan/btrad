import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, Trade } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { OrderExecutionService } from '../execution/order-execution.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { TelegramService } from '../telegram/telegram.service';

type LiveTradeWithOrders = Prisma.TradeGetPayload<{
  include: { orders: true };
}>;

@Injectable()
export class PositionMonitorService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly orderExecutionService: OrderExecutionService,
    private readonly logsService: LogsService,
    private readonly scannerService: ScannerService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    void this.reconcileStartupState();
  }

  async run(): Promise<void> {
    await this.monitorLiveTrades();
    await this.expireStaleSignals();
    await this.refillOpenSlots();
    await this.ensureContinuousLiveFlow();
  }

  private async reconcileStartupState(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst().catch(() => null);
    if (!settings || settings.mode !== 'live') return;

    try {
      await this.run();

      const [dbTrades, exchangePositions] = await Promise.all([
        this.prisma.trade.findMany({ where: { status: 'live_open' } }),
        this.binanceService.fetchOpenPositions(),
      ]);

      const dbSymbols = new Set(dbTrades.map((trade) => trade.symbol));
      const orphanPositions = exchangePositions.filter((position) => !dbSymbols.has(position.symbol));
      if (orphanPositions.length === 0) return;

      const symbols = orphanPositions.map((position) => position.symbol);
      await this.prisma.botSettings.updateMany({
        where: { isPaused: false },
        data: { isPaused: true },
      });
      await this.logsService.error('startup-reconcile', 'Exchange positions found without matching DB trades; bot paused', {
        symbols,
      });
      await this.logsService.risk(
        'startup_position_mismatch',
        'Exchange positions found without matching DB trades; bot paused',
        'critical',
        { symbols },
      );
      await this.telegramService.sendMessage(
        `<b>CRITICAL:</b> startup reconciliation paused the bot.\nOpen Binance positions without DB trades: ${symbols.join(', ')}`,
      );
    } catch (err) {
      await this.logsService.error('startup-reconcile', 'Startup reconciliation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async monitorLiveTrades(): Promise<void> {
    // Only reconcile when actually in live mode; signed requests go to testnet
    // otherwise, which would return 0 positions and incorrectly close live DB
    // records.
    const settings = (await this.prisma.botSettings.findFirst()) as ({ maxHoldingHours?: number; mode?: string } | null);
    if (settings?.mode !== 'live') return;

    const openLiveTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      include: { orders: true },
    });
    if (openLiveTrades.length === 0) return;

    const maxHoldingHours = settings.maxHoldingHours ?? 0;
    if (maxHoldingHours > 0) {
      for (const trade of openLiveTrades) {
        if (!this.isTradeTimedOut(trade, maxHoldingHours)) continue;
        await this.closeTimedOutTrade(trade, maxHoldingHours);
      }
    }

    const remainingOpenLiveTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
    });
    if (remainingOpenLiveTrades.length === 0) return;

    try {
      const binancePositions = await this.binanceService.fetchOpenPositions();
      const activeSymbols = new Set(binancePositions.map((p) => p.symbol));

      for (const trade of remainingOpenLiveTrades) {
        if (activeSymbols.has(trade.symbol)) continue;
        await this.finalizeExchangeClosedTrade(trade);
      }
    } catch (err) {
      await this.logsService.warn('monitor', 'Live position check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private isTradeTimedOut(trade: Pick<Trade, 'openedAt' | 'createdAt'>, maxHoldingHours: number): boolean {
    if (maxHoldingHours <= 0) return false;
    const openedAtMs = trade.openedAt ? trade.openedAt.getTime() : trade.createdAt.getTime();
    return Date.now() >= openedAtMs + maxHoldingHours * 60 * 60 * 1000;
  }

  private async closeTimedOutTrade(trade: LiveTradeWithOrders, maxHoldingHours: number): Promise<void> {
    try {
      const openOrders = trade.orders.filter((order) => order.status === 'open' && order.binanceOrderId);
      for (const order of openOrders) {
        const cancelRequest =
          order.type === 'STOP_MARKET' || order.type === 'TAKE_PROFIT_MARKET'
            ? this.binanceService.cancelAlgoOrder(order.binanceOrderId!)
            : this.binanceService.cancelOrder(trade.symbol, order.binanceOrderId!);

        await cancelRequest.catch(async (err) => {
          await this.logsService.warn('monitor', `Failed to cancel timeout order ${order.binanceOrderId}`, {
            tradeId: trade.id,
            symbol: trade.symbol,
            orderType: order.type,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      await this.prisma.order.updateMany({
        where: { tradeId: trade.id, status: 'open' },
        data: { status: 'cancelled' },
      });

      const side = trade.direction === 'LONG' ? 'SELL' : 'BUY';
      const ts = Date.now();
      const closeResult = await this.binanceService.placeOrder({
        symbol: trade.symbol,
        side,
        type: 'MARKET',
        quantity: trade.quantity,
        reduceOnly: true,
        clientOrderId: `${trade.id.slice(0, 8)}-timeout-${ts}`,
      });

      const fillPrice = Number(closeResult.avgPrice);
      const exitPrice = fillPrice > 0 ? fillPrice : await this.binanceService.fetchMarkPrice(trade.symbol);
      const dirMult = trade.direction === 'LONG' ? 1 : -1;
      const pnl = (exitPrice - trade.entryPrice) * trade.quantity * dirMult;
      const pnlPercent = trade.margin === 0 ? 0 : (pnl / trade.margin) * 100;

      const updated = await this.prisma.trade.updateMany({
        where: { id: trade.id, status: 'live_open' },
        data: {
          exitPrice: Number(exitPrice.toFixed(8)),
          pnl: Number(pnl.toFixed(4)),
          pnlPercent: Number(pnlPercent.toFixed(2)),
          status: 'time_stop' as never,
          closedAt: new Date(),
        },
      });

      if (updated.count === 0) return;

      await this.prisma.order.create({
        data: {
          tradeId: trade.id,
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

      await this.logsService.info('monitor', 'Live trade closed by max holding time', {
        tradeId: trade.id,
        symbol: trade.symbol,
        maxHoldingHours,
        exitPrice,
        pnl,
      });
    } catch (err) {
      await this.logsService.warn('monitor', `Failed to close timed-out trade: ${trade.symbol}`, {
        tradeId: trade.id,
        maxHoldingHours,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async finalizeExchangeClosedTrade(trade: Trade): Promise<void> {
    try {
      const openedAtMs = trade.openedAt ? trade.openedAt.getTime() : trade.createdAt.getTime();
      const realizedPnl = await this.binanceService.fetchRealizedPnl(trade.symbol, openedAtMs).catch(() => null);

      let pnl: number;
      let exitPrice: number;

      if (realizedPnl !== null) {
        pnl = realizedPnl;
        const dirMult = trade.direction === 'LONG' ? 1 : -1;
        exitPrice = trade.entryPrice + pnl / (trade.quantity * dirMult);
      } else {
        exitPrice = await this.binanceService.fetchMarkPrice(trade.symbol);
        const dirMult = trade.direction === 'LONG' ? 1 : -1;
        pnl = (exitPrice - trade.entryPrice) * trade.quantity * dirMult;
      }

      const pnlPercent = trade.margin === 0 ? 0 : (pnl / trade.margin) * 100;
      const status = pnl >= 0 ? 'take_profit' : 'stopped';

      const updated = await this.prisma.trade.updateMany({
        where: { id: trade.id, status: 'live_open' },
        data: {
          exitPrice: Number(exitPrice.toFixed(8)),
          pnl: Number(pnl.toFixed(4)),
          pnlPercent: Number(pnlPercent.toFixed(2)),
          status,
          closedAt: new Date(),
        },
      });

      if (updated.count === 0) return;

      await this.prisma.order.updateMany({
        where: { tradeId: trade.id, status: 'open' },
        data: { status: pnl >= 0 ? 'filled' : 'triggered' },
      });

      await this.logsService.info('monitor', `Live trade closed by exchange: ${status}`, {
        tradeId: trade.id,
        symbol: trade.symbol,
        exitPrice,
        pnl,
      });
    } catch (err) {
      await this.logsService.warn('monitor', `Failed to close live trade record: ${trade.symbol}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async expireStaleSignals(): Promise<void> {
    await this.prisma.signal.updateMany({
      where: { status: { in: ['pending', 'active', 'approved'] }, expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
  }

  private async refillOpenSlots(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst();
    if (!settings) return;
    if (settings.isPaused) return;
    if (settings.mode !== 'live') return;
    if (!settings.realTradingEnabled) return;
    if (settings.requireDashboardConfirmation !== false) return;

    const maxOpenTrades = settings.maxOpenTrades ?? 0;
    if (maxOpenTrades <= 0) return;

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      select: { symbol: true },
    });
    const availableSlots = maxOpenTrades - openTrades.length;
    if (availableSlots <= 0) return;

    const openSymbols = new Set(openTrades.map((trade) => trade.symbol));
    const candidates = await this.prisma.signal.findMany({
      where: {
        status: { in: ['active', 'approved'] },
        expiresAt: { gt: new Date() },
      },
      include: { symbol: true },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'asc' }],
      take: Math.max(availableSlots * 4, 10),
    });

    let executed = 0;

    for (const signal of candidates) {
      if (executed >= availableSlots) break;
      if (openSymbols.has(signal.symbol.symbol)) continue;

      try {
        if (signal.status === 'approved') {
          const revived = await this.prisma.signal.updateMany({
            where: { id: signal.id, status: 'approved' },
            data: { status: 'active' },
          });
          if (revived.count === 0) continue;
        }

        await this.orderExecutionService.approveLive(signal.id, 'system-auto-refill');
        openSymbols.add(signal.symbol.symbol);
        executed += 1;
      } catch (err) {
        await this.logsService.warn('monitor', `Auto-refill execution failed for ${signal.symbol.symbol}`, {
          signalId: signal.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (executed > 0) {
      await this.logsService.info('monitor', 'Auto-refilled open live trade slots', {
        executed,
        maxOpenTrades,
      });
    }
  }

  private async ensureContinuousLiveFlow(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst();
    if (!settings) return;
    if (settings.isPaused) return;
    if (settings.mode !== 'live') return;
    if (!settings.realTradingEnabled) return;
    if (settings.requireDashboardConfirmation !== false) return;

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      select: { symbol: true },
    });
    const maxOpenTrades = settings.maxOpenTrades ?? 0;
    if (openTrades.length >= maxOpenTrades) return;

    const openSymbols = openTrades.map((trade) => trade.symbol);
    const queuedSignals = await this.prisma.signal.count({
      where: {
        status: { in: ['active', 'approved'] },
        expiresAt: { gt: new Date() },
        symbol: openSymbols.length > 0 ? { symbol: { notIn: openSymbols } } : undefined,
      },
    });

    if (queuedSignals > 0) return;

    const scan = await this.scannerService.runScan();
    await this.logsService.info('monitor', 'Triggered immediate scan to maintain continuous live trading', {
      openTrades: openTrades.length,
      maxOpenTrades,
      processed: scan.processed,
      signalsCreated: scan.signalsCreated,
      skipped: scan.skipped ?? false,
    });

    await this.refillOpenSlots();
  }
}
