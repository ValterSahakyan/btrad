import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, Trade } from '@prisma/client';

// Must match SYMBOL_COOLDOWN_MS in scanner.service.ts
const SYMBOL_COOLDOWN_MS = 90 * 60_000;
import { BinanceService } from '../binance/binance.service';
import { OrderExecutionService } from '../execution/order-execution.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { applyWeekendOverrides } from '../settings/weekend-settings';
type LiveTradeWithOrders = Prisma.TradeGetPayload<{
  include: { orders: true };
}>;

type LiveTradeWithSignal = Prisma.TradeGetPayload<{
  include: {
    orders: true;
    signal: { select: { takeProfit1: true } };
  };
}>;

@Injectable()
export class PositionMonitorService implements OnModuleInit {
  private readonly logger = new Logger(PositionMonitorService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly orderExecutionService: OrderExecutionService,
    private readonly logsService: LogsService,
    private readonly scannerService: ScannerService,
  ) {}

  onModuleInit(): void {
    void this.reconcileStartupState();
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.monitorLiveTrades();
      await this.trailBreakeven();
      await this.expireStaleSignals();
      await this.refillOpenSlots();
      await this.ensureContinuousLiveFlow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Position monitor run failed: ${message}`);
      await this.logsService.error('monitor', 'Position monitor run failed', { error: message });
    } finally {
      this.running = false;
    }
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
      await this.logsService.error('startup-reconcile', 'Exchange positions found without matching DB trades; manual review required', {
        symbols,
      });
      await this.logsService.risk(
        'startup_position_mismatch',
        'Exchange positions found without matching DB trades; manual review required',
        'critical',
        { symbols },
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
    const settings = (await this.prisma.botSettings.findFirst()) as ({ maxHoldingHours?: number; mode?: string; isPaused?: boolean } | null);
    if (settings?.mode !== 'live') return;

    const openLiveTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      include: { orders: true },
    });

    // Enforce time-stop on known DB trades (skip if DB is empty — nothing to enforce).
    if (openLiveTrades.length > 0) {
      const maxHoldingHours = settings.maxHoldingHours ?? 0;
      if (maxHoldingHours > 0 && !settings.isPaused) {
        for (const trade of openLiveTrades) {
          if (!this.isTradeTimedOut(trade, maxHoldingHours)) continue;
          await this.closeTimedOutTrade(trade, maxHoldingHours);
        }
      }
    }

    // Always reconcile with Binance — even if the DB is empty we still need
    // to import any positions that exist on the exchange without a DB record.
    try {
      const binancePositions = await this.binanceService.fetchOpenPositions();
      const activeSymbols = new Set(binancePositions.map((p) => p.symbol));

      // Re-fetch after time-stop closures so dbSymbols reflects current state.
      const currentDbTrades = await this.prisma.trade.findMany({ where: { status: 'live_open' } });
      const dbSymbols = new Set(currentDbTrades.map((t) => t.symbol));

      // Close DB trades that disappeared from the exchange.
      for (const trade of currentDbTrades) {
        if (activeSymbols.has(trade.symbol)) continue;
        await this.finalizeExchangeClosedTrade(trade);
      }

      // Import orphan positions — Binance positions with no matching DB record.
      // Handles: externally-opened positions, DB records lost due to errors, etc.
      for (const pos of binancePositions) {
        if (dbSymbols.has(pos.symbol)) continue;

        const quantity = Math.abs(Number(pos.positionAmt));
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        try {
          const alreadyExists = await this.prisma.trade.findFirst({
            where: { symbol: pos.symbol, status: 'live_open' },
          });
          if (alreadyExists) continue;

          const entryPrice = Number(pos.entryPrice);
          const leverage = Math.max(1, Number(pos.leverage) || 1);
          const margin = (quantity * entryPrice) / leverage;

          await this.prisma.trade.create({
            data: {
              symbol: pos.symbol,
              direction: Number(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
              entryPrice,
              quantity,
              leverage,
              margin: Number(margin.toFixed(4)),
              status: 'live_open',
              openedAt: new Date(pos.updateTime || Date.now()),
            },
          });

          await this.logsService.risk(
            'orphan_position_imported',
            `Orphan position imported: ${pos.symbol} — no DB record found (lost on crash or opened externally).`,
            'high',
            { symbol: pos.symbol, quantity, entryPrice, leverage },
          );
        } catch (importErr) {
          await this.logsService.warn('monitor', `Failed to import orphan position for ${pos.symbol}`, {
            symbol: pos.symbol,
            error: importErr instanceof Error ? importErr.message : String(importErr),
          });
        }
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
        const cancelRequest = this.binanceService.cancelOrder(trade.symbol, order.binanceOrderId!);

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

  /**
   * Moves the stop-loss to breakeven once price reaches TP1.
   *
   * This is the "let profits run" principle from Van Tharp and Larry Williams:
   * once the trade is in profit by 1R, lock in breakeven so the worst outcome
   * becomes a scratch rather than a loss.  This materially improves the
   * risk-adjusted returns without needing any additional signal logic.
   */
  private async trailBreakeven(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst();
    if (settings?.mode !== 'live') return;
    // Moving an SL on Binance is active order placement — skip while paused.
    if (settings?.isPaused) return;

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      include: {
        orders: true,
        signal: { select: { takeProfit1: true } },
      },
    }) as LiveTradeWithSignal[];

    for (const trade of openTrades) {
      const tp1 = trade.signal?.takeProfit1;
      if (!tp1) continue;

      const slOrders = trade.orders.filter((o) => o.type === 'STOP_MARKET');

      // Already moved to breakeven if any SL is on the profitable side of entry
      const breakevenAlreadySet = slOrders.some((o) => {
        const slPrice = o.price ?? 0;
        if (trade.direction === 'LONG') return slPrice >= trade.entryPrice * 0.999;
        return slPrice > 0 && slPrice <= trade.entryPrice * 1.001;
      });
      if (breakevenAlreadySet) continue;

      // Fetch current mark price (safe: live endpoint)
      const markPrice = await this.binanceService.fetchMarkPrice(trade.symbol).catch(() => null);
      if (markPrice === null) continue;

      const tp1Reached =
        trade.direction === 'LONG' ? markPrice >= tp1 : markPrice <= tp1;
      if (!tp1Reached) continue;

      // Find the open SL order
      const openSl = slOrders.find((o) => o.status === 'open' && o.binanceOrderId);
      if (!openSl?.binanceOrderId) continue;

      try {
        // Look up symbol precision for rounding
        const sym = await this.prisma.symbol.findFirst({ where: { symbol: trade.symbol } });
        const pricePrecision = sym?.pricePrecision ?? 4;

        // Breakeven = entry + tiny buffer (covers maker fee ~0.02%)
        const bePrice = Number(
          (trade.direction === 'LONG'
            ? trade.entryPrice * 1.0003
            : trade.entryPrice * 0.9997
          ).toFixed(pricePrecision),
        );

        // Cancel the existing SL
        await this.binanceService.cancelOrder(trade.symbol, openSl.binanceOrderId!).catch(async (err) => {
          await this.logsService.warn('monitor', `Breakeven: failed to cancel old SL for ${trade.symbol}`, {
            tradeId: trade.id,
            binanceOrderId: openSl.binanceOrderId,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        });

        await this.prisma.order.update({
          where: { id: openSl.id },
          data: { status: 'cancelled' },
        });

        // Place new SL at breakeven
        const side = trade.direction === 'LONG' ? 'SELL' : 'BUY';
        const ts = Date.now();
        const newSlResult = await this.binanceService.placeOrder({
          symbol: trade.symbol,
          side,
          type: 'STOP_MARKET',
          quantity: trade.quantity,
          stopPrice: bePrice,
          reduceOnly: true,
          clientOrderId: `${trade.id.slice(0, 8)}-be-${ts}`,
        });

        await this.prisma.order.create({
          data: {
            tradeId: trade.id,
            binanceOrderId: String(newSlResult.orderId),
            symbol: trade.symbol,
            side,
            type: 'STOP_MARKET',
            quantity: trade.quantity,
            price: bePrice,
            status: 'open',
            rawResponseJson: newSlResult as unknown as Prisma.InputJsonValue,
          },
        });

        await this.logsService.info('monitor', 'Stop-loss moved to breakeven after TP1 reached', {
          tradeId: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          tp1,
          markPrice,
          newSlPrice: bePrice,
        });
      } catch {
        // Non-critical — SL stays where it was; monitor will retry next cycle
      }
    }
  }

  private async expireStaleSignals(): Promise<void> {
    await this.prisma.signal.updateMany({
      where: { status: { in: ['pending', 'active', 'approved'] }, expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
  }

  private async refillOpenSlots(): Promise<void> {
    const settings = applyWeekendOverrides(await this.prisma.botSettings.findFirst());
    if (!settings) return;
    if (settings.isPaused) return;
    if (settings.mode !== 'live') return;
    if (!settings.realTradingEnabled) return;
    if (settings.requireDashboardConfirmation !== false) return;

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      select: { symbol: true },
    });
    const openSymbols = new Set(openTrades.map((trade) => trade.symbol));

    // Symbols that closed recently are on cooldown — skip them even if a signal exists.
    // Keeps the refill from immediately re-entering a symbol that just exited.
    const recentlyClosed = await this.prisma.trade.findMany({
      where: { closedAt: { gte: new Date(Date.now() - SYMBOL_COOLDOWN_MS) } },
      select: { symbol: true },
    });
    const cooledDownSymbols = new Set(recentlyClosed.map((t) => t.symbol));

    // Only pick up 'active' signals — never touch 'approved' ones.
    // A signal in 'approved' is already mid-execution by autoExecute; reviving it
    // (approved → active) races with the in-progress executor and causes duplicate trades.
    const candidates = await this.prisma.signal.findMany({
      where: {
        status: 'active',
        expiresAt: { gt: new Date() },
      },
      include: { symbol: true },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'asc' }],
      take: 50,
    });

    let executed = 0;

    for (const signal of candidates) {
      if (openSymbols.has(signal.symbol.symbol)) continue;
      if (cooledDownSymbols.has(signal.symbol.symbol)) continue;

      try {
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
      await this.logsService.info('monitor', 'Auto-refilled open live trade slots', { executed });
    }
  }

  private async ensureContinuousLiveFlow(): Promise<void> {
    const settings = applyWeekendOverrides(await this.prisma.botSettings.findFirst());
    if (!settings) return;
    if (settings.isPaused) return;
    if (settings.mode !== 'live') return;
    if (!settings.realTradingEnabled) return;
    if (settings.requireDashboardConfirmation !== false) return;

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      select: { symbol: true },
    });
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
      processed: scan.processed,
      signalsCreated: scan.signalsCreated,
      skipped: scan.skipped ?? false,
    });

    await this.refillOpenSlots();
  }
}
