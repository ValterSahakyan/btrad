import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paperTradingService: PaperTradingService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
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
    if (!trade) throw new NotFoundException('Trade not found');
    return trade;
  }

  async closePaper(id: string) {
    return this.paperTradingService.closeTrade(id);
  }

  async closeLive(id: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id }, include: { orders: true } });
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.status !== 'live_open') throw new NotFoundException('Trade is not open');

    // Cancel only the SL/TP orders that belong to THIS trade.
    // Never use cancelAllOpenOrders — that would wipe orders from other trades on the same symbol.
    const openOrders = trade.orders.filter((o) => o.status === 'open' && o.binanceOrderId);
    for (const order of openOrders) {
      await this.binanceService
        .cancelOrder(trade.symbol, order.binanceOrderId!)
        .catch(async (err) => {
          await this.logsService.warn('trades', `Failed to cancel order ${order.binanceOrderId}`, {
            tradeId: id,
            symbol: trade.symbol,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    // Mark those orders as cancelled in DB
    await this.prisma.order.updateMany({
      where: { tradeId: id, status: 'open' },
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
      clientOrderId: `${id.slice(0, 8)}-close-${ts}`,
    });

    // Use actual fill price from Binance; fall back to mark price only if avgPrice is missing
    const fillPrice = Number(closeResult.avgPrice);
    const exitPrice = fillPrice > 0 ? fillPrice : await this.binanceService.fetchMarkPrice(trade.symbol);

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

    await this.logsService.info('trades', 'Live trade manually closed', {
      tradeId: id,
      symbol: trade.symbol,
      exitPrice,
      pnl,
    });

    return updated;
  }
}
