import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PositionMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly paperTradingService: PaperTradingService,
    private readonly logsService: LogsService,
  ) {}

  async run(): Promise<void> {
    await Promise.all([
      this.monitorPaperTrades(),
      this.monitorLiveTrades(),
      this.expireStaleSignals(),
    ]);
  }

  private async monitorPaperTrades(): Promise<void> {
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'paper_open' },
      include: { signal: true },
    });

    for (const trade of openTrades) {
      try {
        const markPrice = await this.binanceService.fetchMarkPrice(trade.symbol);
        const sl = trade.signal?.stopLoss ?? null;
        const tp = trade.signal?.takeProfit1 ?? null;

        const hitSL = sl !== null && (
          trade.direction === 'LONG' ? markPrice <= sl : markPrice >= sl
        );
        const hitTP = tp !== null && (
          trade.direction === 'LONG' ? markPrice >= tp : markPrice <= tp
        );

        if (hitSL) {
          await this.paperTradingService.closeTrade(trade.id, sl!);
          await this.logsService.info('monitor', 'Paper trade stopped out', {
            tradeId: trade.id,
            symbol: trade.symbol,
            exitPrice: sl,
          });
        } else if (hitTP) {
          await this.paperTradingService.closeTrade(trade.id, tp!);
          await this.logsService.info('monitor', 'Paper trade hit take profit', {
            tradeId: trade.id,
            symbol: trade.symbol,
            exitPrice: tp,
          });
        }
      } catch (err) {
        await this.logsService.warn('monitor', `Paper trade monitor failed: ${trade.symbol}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async monitorLiveTrades(): Promise<void> {
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
        // Fetch actual realized PnL from Binance income history for accurate accounting.
        try {
          const openedAtMs = trade.openedAt ? trade.openedAt.getTime() : trade.createdAt.getTime();
          const realizedPnl = await this.binanceService
            .fetchRealizedPnl(trade.symbol, openedAtMs)
            .catch(() => null);

          let pnl: number;
          let exitPrice: number;

          if (realizedPnl !== null) {
            pnl = realizedPnl;
            // Derive approximate exit price from realized PnL for display purposes
            const dirMult = trade.direction === 'LONG' ? 1 : -1;
            exitPrice = trade.entryPrice + (pnl / (trade.quantity * dirMult));
          } else {
            // Fall back to mark price if income API fails
            exitPrice = await this.binanceService.fetchMarkPrice(trade.symbol);
            const dirMult = trade.direction === 'LONG' ? 1 : -1;
            pnl = (exitPrice - trade.entryPrice) * trade.quantity * dirMult;
          }

          const pnlPercent = trade.margin === 0 ? 0 : (pnl / trade.margin) * 100;
          const status = pnl >= 0 ? 'take_profit' : 'stopped';

          await this.prisma.trade.update({
            where: { id: trade.id },
            data: {
              exitPrice: Number(exitPrice.toFixed(8)),
              pnl: Number(pnl.toFixed(4)),
              pnlPercent: Number(pnlPercent.toFixed(2)),
              status,
              closedAt: new Date(),
            },
          });

          // Mark open SL/TP orders as filled/cancelled since position is gone
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
