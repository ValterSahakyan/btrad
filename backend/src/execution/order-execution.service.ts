import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
  ) {}

  async approveLive(signalId: string): Promise<unknown> {
    if (!this.binanceService.hasApiKeys()) {
      throw new BadRequestException('Binance API keys are not configured — set BINANCE_API_KEY and BINANCE_API_SECRET');
    }

    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { symbol: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');

    // Idempotency guard — prevent double-execution from rapid approvals
    if (signal.status === 'live_executed') {
      throw new BadRequestException('Signal has already been executed');
    }
    if (signal.expiresAt < new Date()) throw new BadRequestException('Signal has expired');

    const settings = await this.prisma.botSettings.findFirst();
    if (!settings?.realTradingEnabled) throw new BadRequestException('Real trading is not enabled in settings');
    if (settings.mode !== 'live') throw new BadRequestException('Bot must be in live mode to place live orders');

    // Re-validate open trade count at execution time (could have changed since signal was created)
    const openTrades = await this.prisma.trade.count({
      where: { status: { in: ['paper_open', 'live_open'] } },
    });
    if (openTrades >= (settings.maxOpenTrades ?? 2)) {
      throw new BadRequestException(`Max open trades limit reached (${settings.maxOpenTrades})`);
    }

    // Also block if another live trade already exists for this symbol
    const existingTrade = await this.prisma.trade.findFirst({
      where: { symbol: signal.symbol.symbol, status: 'live_open' },
    });
    if (existingTrade) {
      throw new BadRequestException(`A live trade for ${signal.symbol.symbol} is already open`);
    }

    const sym = signal.symbol;
    const stepSize = sym.stepSize;
    const steps = Math.floor(signal.positionSize / stepSize);
    const quantity = Number((steps * stepSize).toFixed(sym.quantityPrecision));

    if (quantity <= 0) throw new BadRequestException('Position size is zero after step-size rounding');
    if (quantity * signal.entryPrice < sym.minNotional) {
      throw new BadRequestException(`Position size below Binance minimum notional ($${sym.minNotional})`);
    }

    // Validate available balance covers the required margin (with 0.5% fee buffer)
    const balanceRows = await this.binanceService.fetchAccountBalance();
    const availableBalance = Number(balanceRows.find((row) => row.asset === 'USDT')?.availableBalance ?? 0);
    const requiredMargin = ((quantity * signal.entryPrice) / signal.leverage) * 1.005;
    if (availableBalance < requiredMargin) {
      throw new BadRequestException(
        `Insufficient USDT balance: need $${requiredMargin.toFixed(2)}, have $${availableBalance.toFixed(2)}`,
      );
    }

    await this.binanceService.setLeverage(sym.symbol, signal.leverage);

    const side = signal.direction === 'LONG' ? 'BUY' : 'SELL';
    const closeSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
    const ts = Date.now();
    const idPrefix = signalId.slice(0, 8);
    // Add short random suffix to prevent clientOrderId collision on same-millisecond approvals
    const rand = Math.random().toString(36).slice(2, 5);

    // Entry MARKET order
    const entryResult = await this.binanceService.placeOrder({
      symbol: sym.symbol,
      side,
      type: 'MARKET',
      quantity,
      clientOrderId: `${idPrefix}-e-${ts}-${rand}`,
    });

    const trade = await this.prisma.trade.create({
      data: {
        signalId: signal.id,
        symbol: sym.symbol,
        direction: signal.direction,
        entryPrice: Number(entryResult.avgPrice) || signal.entryPrice,
        quantity,
        leverage: signal.leverage,
        margin: signal.riskAmount,
        status: 'live_open',
        openedAt: new Date(),
      },
    });

    await this.prisma.order.create({
      data: {
        tradeId: trade.id,
        binanceOrderId: String(entryResult.orderId),
        symbol: sym.symbol,
        side,
        type: 'MARKET',
        quantity,
        price: Number(entryResult.avgPrice) || signal.entryPrice,
        status: 'filled',
        rawResponseJson: entryResult as unknown as Prisma.InputJsonValue,
      },
    });

    // Stop-loss STOP_MARKET order
    const slResult = await this.binanceService
      .placeOrder({
        symbol: sym.symbol,
        side: closeSide,
        type: 'STOP_MARKET',
        quantity,
        stopPrice: Number(signal.stopLoss.toFixed(sym.pricePrecision)),
        reduceOnly: true,
        clientOrderId: `${idPrefix}-sl-${ts}-${rand}`,
      })
      .catch(async (err) => {
        await this.logsService.error('execution', 'SL order failed — position has no stop loss', {
          error: err.message,
          signalId,
          tradeId: trade.id,
        });
        return null;
      });

    if (slResult) {
      await this.prisma.order.create({
        data: {
          tradeId: trade.id,
          binanceOrderId: String(slResult.orderId),
          symbol: sym.symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          quantity,
          price: signal.stopLoss,
          status: 'open',
          rawResponseJson: slResult as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Take-profit TAKE_PROFIT_MARKET order
    const tpResult = await this.binanceService
      .placeOrder({
        symbol: sym.symbol,
        side: closeSide,
        type: 'TAKE_PROFIT_MARKET',
        quantity,
        stopPrice: Number(signal.takeProfit1.toFixed(sym.pricePrecision)),
        reduceOnly: true,
        clientOrderId: `${idPrefix}-tp-${ts}-${rand}`,
      })
      .catch(async (err) => {
        await this.logsService.error('execution', 'TP order failed', {
          error: err.message,
          signalId,
          tradeId: trade.id,
        });
        return null;
      });

    if (tpResult) {
      await this.prisma.order.create({
        data: {
          tradeId: trade.id,
          binanceOrderId: String(tpResult.orderId),
          symbol: sym.symbol,
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          quantity,
          price: signal.takeProfit1,
          status: 'open',
          rawResponseJson: tpResult as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'live_executed' } });
    await this.logsService.info('execution', 'Live order placed', {
      signalId,
      tradeId: trade.id,
      symbol: sym.symbol,
      direction: signal.direction,
      quantity,
      leverage: signal.leverage,
      entryPrice: trade.entryPrice,
    });

    return trade;
  }
}
