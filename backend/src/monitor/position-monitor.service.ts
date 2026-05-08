import { Injectable, OnModuleInit } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class PositionMonitorService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    void this.reconcileStartupState();
  }

  async run(): Promise<void> {
    await Promise.all([
      this.monitorLiveTrades(),
      this.expireStaleSignals(),
    ]);
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
    // Only reconcile when actually in live mode — signedRequest goes to testnet otherwise,
    // which would return 0 positions and incorrectly close live DB records.
    const settings = await this.prisma.botSettings.findFirst();
    if (settings?.mode !== 'live') return;

    const openLiveTrades = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
    });
    if (openLiveTrades.length === 0) return;

    try {
      const binancePositions = await this.binanceService.fetchOpenPositions();
      const activeSymbols = new Set(binancePositions.map((p) => p.symbol));

      for (const trade of openLiveTrades) {
        if (activeSymbols.has(trade.symbol)) continue; // still open on exchange

        // Position is gone — closed by SL/TP or external action.
        try {
          const openedAtMs = trade.openedAt ? trade.openedAt.getTime() : trade.createdAt.getTime();
          const realizedPnl = await this.binanceService
            .fetchRealizedPnl(trade.symbol, openedAtMs)
            .catch(() => null);

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

          // Use updateMany with status guard to prevent race condition with manual close.
          // If another process already closed this trade, count will be 0 and we skip.
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

          if (updated.count === 0) {
            // Trade was already closed by manual action — skip
            continue;
          }

          // Mark open SL/TP orders as settled
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
    } catch (err) {
      await this.logsService.warn('monitor', 'Live position check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async expireStaleSignals(): Promise<void> {
    await this.prisma.signal.updateMany({
      where: { status: 'active', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
  }
}
