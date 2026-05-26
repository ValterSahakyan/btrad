import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { BinanceOrderResult } from '../binance/binance.types';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyWeekendOverrides } from '../settings/weekend-settings';
@Injectable()
export class OrderExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
  ) {}

  async approveLive(signalId: string, actor = 'system'): Promise<unknown> {
    if (!this.binanceService.hasApiKeys()) {
      throw new BadRequestException('Binance API keys are not configured — set BINANCE_API_KEY and BINANCE_API_SECRET');
    }

    // Atomically claim the signal — prevents double execution from race conditions
    // (e.g. auto-execute fires at same time as manual Execute button click)
    const claimed = await this.prisma.signal.updateMany({
      where: { id: signalId, status: { in: ['active', 'pending'] } },
      data: { status: 'approved' },
    });
    if (claimed.count === 0) {
      const signal = await this.prisma.signal.findUnique({ where: { id: signalId } });
      if (!signal) throw new NotFoundException('Signal not found');
      throw new BadRequestException(`Signal cannot be executed (current status: ${signal.status})`);
    }

    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { symbol: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (!signal.strategy) {
      await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'failed' } });
      throw new BadRequestException('Signal has no strategy — cannot execute');
    }

    // Helper to revert signal back to active so it can be retried
    const revertToActive = () =>
      this.prisma.signal.update({ where: { id: signalId }, data: { status: 'active' } }).catch(() => null);

    try {
    if (signal.expiresAt < new Date()) {
      await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'expired' } });
      throw new BadRequestException('Signal has expired');
    }

    const settings = applyWeekendOverrides(await this.prisma.botSettings.findFirst());
    if (settings?.isPaused) {
      // Auto-execution: cancel so resume doesn't re-execute this stale signal.
      // Manual execution: revert to active so the user can retry after unpausing.
      const isAutoExecute = actor === 'system' || actor === 'system-auto-refill';
      if (isAutoExecute) {
        await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'cancelled' } }).catch(() => null);
      } else {
        await revertToActive();
      }
      throw new BadRequestException('Bot is stopped');
    }
    if (!settings?.realTradingEnabled) {
      await revertToActive();
      throw new BadRequestException('Real trading is not enabled in settings');
    }
    if (settings.mode !== 'live') {
      await revertToActive();
      throw new BadRequestException('Bot must be in live mode to place live orders');
    }

    const existingTrade = await this.prisma.trade.findFirst({
      where: { symbol: signal.symbol.symbol, status: 'live_open' },
    });
    if (existingTrade) {
      await revertToActive();
      throw new BadRequestException(`A live trade for ${signal.symbol.symbol} is already open`);
    }

    const sym = signal.symbol;
    const steps = Math.floor(signal.positionSize / sym.stepSize);
    const quantity = Number((steps * sym.stepSize).toFixed(sym.quantityPrecision));

    if (quantity <= 0) {
      await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'failed' } });
      throw new BadRequestException('Position size is zero after step-size rounding');
    }
    if (quantity * signal.entryPrice < sym.minNotional) {
      await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'failed' } });
      throw new BadRequestException(`Position size below Binance minimum notional ($${sym.minNotional})`);
    }

    // Always use live balance endpoint for safety — never testnet
    const balanceRows = await this.binanceService.fetchLiveAccountBalance().catch(async (err) => {
      await revertToActive();
      throw err;
    });
    const availableBalance = Number(balanceRows.find((row) => row.asset === 'USDT')?.availableBalance ?? 0);
    const requiredMargin = ((quantity * signal.entryPrice) / signal.leverage) * 1.005;
    if (availableBalance < requiredMargin) {
      await revertToActive();
      throw new BadRequestException(
        `Insufficient USDT balance: need $${requiredMargin.toFixed(2)}, have $${availableBalance.toFixed(2)}`,
      );
    }

    // Validate SL/TP prices are still on the correct side of the current market.
    // If price moved since the signal was created, the Binance SL order will be rejected
    // (error -4047) which triggers emergency close and marks the trade as failed.
    const markPrice = await this.binanceService.fetchMarkPrice(sym.symbol).catch(() => null);
    if (markPrice !== null) {
      const slInvalid =
        signal.direction === 'LONG' ? signal.stopLoss >= markPrice : signal.stopLoss <= markPrice;
      if (slInvalid) {
        await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'expired' } });
        throw new BadRequestException(
          `Signal is stale: stop loss ${signal.stopLoss} is on the wrong side of current mark price ${markPrice}. Signal expired.`,
        );
      }
      const tpInvalid =
        signal.direction === 'LONG' ? signal.takeProfit2 <= markPrice : signal.takeProfit2 >= markPrice;
      if (tpInvalid) {
        await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'expired' } });
        throw new BadRequestException(
          `Signal is stale: take profit ${signal.takeProfit2} is on the wrong side of current mark price ${markPrice}. Signal expired.`,
        );
      }
    }

    // Second duplicate guard — same-symbol race (two signals for the same coin firing simultaneously).
    const raceGuard = await this.prisma.trade.findFirst({
      where: { symbol: sym.symbol, status: 'live_open' },
    });
    if (raceGuard) {
      await revertToActive();
      throw new BadRequestException(`A live trade for ${signal.symbol.symbol} is already open`);
    }

    // Third guard — isPaused re-check at the point of no return.
    // Stop may have fired after the first check. Any call past this line touches Binance.
    const pauseCheck = await this.prisma.botSettings.findFirst();
    if (pauseCheck?.isPaused) {
      const isAutoExecute = actor === 'system' || actor === 'system-auto-refill';
      if (isAutoExecute) {
        await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'cancelled' } }).catch(() => null);
      } else {
        await revertToActive();
      }
      throw new BadRequestException('Bot was stopped before order placement');
    }

    await this.binanceService.setLeverage(sym.symbol, signal.leverage);

    const side = signal.direction === 'LONG' ? 'BUY' : 'SELL';
    const closeSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
    const ts = Date.now();
    const idPrefix = signalId.slice(0, 8);
    const rand = Math.random().toString(36).slice(2, 5);

    // Detect position mode once — hedge mode requires positionSide on every order.
    // In one-way mode positionSide is BOTH (or omitted). Without correct positionSide
    // in hedge mode, Binance defaults BUY→open-LONG / SELL→open-SHORT, causing
    // reduceOnly SL/TP orders to fail because they target the wrong side.
    const posMode = await this.binanceService.getPositionMode();
    const positionSide = posMode === 'hedge'
      ? (signal.direction === 'LONG' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT'
      : ('BOTH' as const);

    // ── Entry MARKET order ───────────────────────────────────────────────────
    const entryResult = await this.binanceService.placeOrder({
      symbol: sym.symbol,
      side,
      type: 'MARKET',
      quantity,
      positionSide,
      clientOrderId: `${idPrefix}-e-${ts}-${rand}`,
    });

    const fillPrice = Number(entryResult.avgPrice) || signal.entryPrice;
    // Use actual fill price for margin — riskAmount is risk budget, not actual margin
    const actualMargin = Number(((quantity * fillPrice) / signal.leverage).toFixed(4));

    const trade = await this.prisma.trade.create({
      data: {
        signalId: signal.id,
        symbol: sym.symbol,
        direction: signal.direction,
        entryPrice: fillPrice,
        quantity,
        leverage: signal.leverage,
        margin: actualMargin,
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
        price: fillPrice,
        status: 'filled',
        rawResponseJson: entryResult as unknown as Prisma.InputJsonValue,
      },
    });

    // ── Stop-loss STOP_MARKET ─────────────────────────────────────────────────
    // CRITICAL: if this fails we close the position immediately — never leave
    // real money in an unprotected position.
    //
    // Retry strategy (3 attempts):
    //   1. Original SL price + MARK_PRICE trigger (standard path)
    //   2. Mark-price-adjusted SL ±2% + MARK_PRICE (price moved since signal)
    //   3. Mark-price-adjusted SL ±2% + CONTRACT_PRICE (fallback for accounts
    //      where MARK_PRICE conditional orders are restricted)
    const placeSl = async (
      stopPrice: number,
      clientOrderId: string,
      workingType: 'MARK_PRICE' | 'CONTRACT_PRICE' = 'MARK_PRICE',
    ) =>
      this.binanceService.placeOrder({
        symbol: sym.symbol,
        side: closeSide,
        type: 'STOP_MARKET',
        quantity,
        stopPrice: Number(stopPrice.toFixed(sym.pricePrecision)),
        reduceOnly: true,
        positionSide,
        clientOrderId,
        workingType,
      });

    let slResult = await placeSl(signal.stopLoss, `${idPrefix}-sl-${ts}-${rand}`).catch(async (err) => {
      await this.logsService.warn('execution', 'SL attempt 1 failed — retrying with adjusted price', {
        symbol: sym.symbol,
        error: err instanceof Error ? err.message : String(err),
        originalSl: signal.stopLoss,
        signalId,
        tradeId: trade.id,
      });

      // Fetch current mark price; retry at ±2% buffer — large enough for fast-moving markets.
      const markNow = await this.binanceService.fetchMarkPrice(sym.symbol).catch(() => null);
      if (markNow === null) return null;

      const adjustedSl = signal.direction === 'LONG'
        ? Number((markNow * 0.98).toFixed(sym.pricePrecision))
        : Number((markNow * 1.02).toFixed(sym.pricePrecision));

      // Attempt 2: MARK_PRICE with wider buffer
      const attempt2 = await placeSl(adjustedSl, `${idPrefix}-sl2-${ts}-${rand}`).catch(async (err2) => {
        await this.logsService.warn('execution', 'SL attempt 2 (MARK_PRICE) failed — retrying with CONTRACT_PRICE', {
          symbol: sym.symbol,
          error: err2 instanceof Error ? err2.message : String(err2),
          adjustedSl,
          signalId,
          tradeId: trade.id,
        });
        return null;
      });
      if (attempt2) return attempt2;

      // Attempt 3: CONTRACT_PRICE (fallback for accounts where MARK_PRICE triggers are restricted)
      return placeSl(adjustedSl, `${idPrefix}-sl3-${ts}-${rand}`, 'CONTRACT_PRICE').catch(async (err3) => {
        await this.logsService.error('execution', 'SL attempt 3 (CONTRACT_PRICE) also failed — emergency close', {
          symbol: sym.symbol,
          error: err3 instanceof Error ? err3.message : String(err3),
          adjustedSl,
          signalId,
          tradeId: trade.id,
        });
        return null;
      });
    });

    if (!slResult) {
      // Emergency close — get out of the position immediately
      const closeResult = await this.binanceService
        .placeOrder({
          symbol: sym.symbol,
          side: closeSide,
          type: 'MARKET',
          quantity,
          reduceOnly: true,
          positionSide,
          clientOrderId: `${idPrefix}-emergency-${ts}-${rand}`,
        })
        .catch(async (closeErr) => {
          await this.logsService.error(
            'execution',
            'CRITICAL: SL failed AND emergency close failed — MANUAL ACTION REQUIRED ON BINANCE',
            {
              symbol: sym.symbol,
              quantity,
              side: closeSide,
              error: closeErr instanceof Error ? closeErr.message : String(closeErr),
            },
          );
          return null;
        });

      // Record actual PnL from the emergency close fill, if available
      const closePrice = closeResult ? (Number(closeResult.avgPrice) || fillPrice) : fillPrice;
      const dirMult = signal.direction === 'LONG' ? 1 : -1;
      const emergencyPnl = (closePrice - fillPrice) * quantity * dirMult;
      const emergencyPnlPct = actualMargin > 0 ? (emergencyPnl / actualMargin) * 100 : 0;

      await this.prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: 'failed',
          closedAt: new Date(),
          exitPrice: Number(closePrice.toFixed(8)),
          pnl: Number(emergencyPnl.toFixed(4)),
          pnlPercent: Number(emergencyPnlPct.toFixed(2)),
        },
      });
      await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'failed' } });
      throw new BadRequestException('SL order failed — emergency close executed. Check Binance manually.');
    }

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

    // ── Take-profit TAKE_PROFIT_MARKET ───────────────────────────────────────
    // Non-critical: SL already protects downside. TP failure means position
    // stays open until monitor closes it or user closes manually.
    // Split into two half-qty orders: TP1 locks in profit, TP2 captures full move.
    // Binance reduceOnly auto-adjusts qty down if position is already partially closed.
    const halfQty = Math.floor(quantity / 2 / sym.stepSize) * sym.stepSize;

    if (halfQty <= 0) {
      await this.logsService.warn('execution', 'Position too small to split TP — using single full-qty TP2 order', {
        symbol: sym.symbol,
        quantity,
        stepSize: sym.stepSize,
        tradeId: trade.id,
      });
    }

    let tp1Result: BinanceOrderResult | null = null;
    let tp2Result: BinanceOrderResult | null = null;

    if (halfQty > 0) {
      tp1Result = await this.binanceService
        .placeOrder({
          symbol: sym.symbol,
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          quantity: halfQty,
          stopPrice: Number(signal.takeProfit1.toFixed(sym.pricePrecision)),
          reduceOnly: true,
          positionSide,
          clientOrderId: `${idPrefix}-tp1-${ts}-${rand}`,
        })
        .catch(async (err) => {
          await this.logsService.warn('execution', 'TP1 order failed — position protected by SL only', {
            symbol: sym.symbol,
            error: err instanceof Error ? err.message : String(err),
            signalId,
            tradeId: trade.id,
          });
          return null;
        });

      if (tp1Result) {
        await this.prisma.order.create({
          data: {
            tradeId: trade.id,
            binanceOrderId: String(tp1Result.orderId),
            symbol: sym.symbol,
            side: closeSide,
            type: 'TAKE_PROFIT_MARKET',
            quantity: halfQty,
            price: signal.takeProfit1,
            status: 'open',
            rawResponseJson: tp1Result as unknown as Prisma.InputJsonValue,
          },
        });
      }

      tp2Result = await this.binanceService
        .placeOrder({
          symbol: sym.symbol,
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          quantity: halfQty,
          stopPrice: Number(signal.takeProfit2.toFixed(sym.pricePrecision)),
          reduceOnly: true,
          positionSide,
          clientOrderId: `${idPrefix}-tp2-${ts}-${rand}`,
        })
        .catch(async (err) => {
          await this.logsService.warn('execution', 'TP2 order failed — position protected by SL only', {
            symbol: sym.symbol,
            error: err instanceof Error ? err.message : String(err),
            signalId,
            tradeId: trade.id,
          });
          return null;
        });

      if (tp2Result) {
        await this.prisma.order.create({
          data: {
            tradeId: trade.id,
            binanceOrderId: String(tp2Result.orderId),
            symbol: sym.symbol,
            side: closeSide,
            type: 'TAKE_PROFIT_MARKET',
            quantity: halfQty,
            price: signal.takeProfit2,
            status: 'open',
            rawResponseJson: tp2Result as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } else {
      // Quantity too small to split — fall back to single full-qty TP2 order
      tp2Result = await this.binanceService
        .placeOrder({
          symbol: sym.symbol,
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          quantity,
          stopPrice: Number(signal.takeProfit2.toFixed(sym.pricePrecision)),
          reduceOnly: true,
          positionSide,
          clientOrderId: `${idPrefix}-tp2-${ts}-${rand}`,
        })
        .catch(async (err) => {
          await this.logsService.warn('execution', 'TP order failed — position protected by SL only', {
            symbol: sym.symbol,
            error: err instanceof Error ? err.message : String(err),
            signalId,
            tradeId: trade.id,
          });
          return null;
        });

      if (tp2Result) {
        await this.prisma.order.create({
          data: {
            tradeId: trade.id,
            binanceOrderId: String(tp2Result.orderId),
            symbol: sym.symbol,
            side: closeSide,
            type: 'TAKE_PROFIT_MARKET',
            quantity,
            price: signal.takeProfit2,
            status: 'open',
            rawResponseJson: tp2Result as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    // Signal marked executed only after all orders are placed
    await this.prisma.signal.update({ where: { id: signalId }, data: { status: 'live_executed' } });
    await this.logsService.info('execution', 'Live order placed', {
      signalId,
      actor,
      tradeId: trade.id,
      symbol: sym.symbol,
      direction: signal.direction,
      quantity,
      leverage: signal.leverage,
      signalEntryPrice: signal.entryPrice,
      fillPrice,
      actualMargin,
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      slOrderId: slResult.orderId,
      tp1OrderId: tp1Result?.orderId ?? null,
      tp2OrderId: tp2Result?.orderId ?? null,
    });
    await this.logsService.audit('trade.open_live', actor, {
      signalId,
      tradeId: trade.id,
      symbol: sym.symbol,
      quantity,
      leverage: signal.leverage,
    });
    await this.logsService.risk('live_execution', 'Live order placed', 'high', {
      actor,
      signalId,
      tradeId: trade.id,
      symbol: sym.symbol,
      quantity,
      leverage: signal.leverage,
    });

    return trade;
    } catch (err) {
      const current = await this.prisma.signal.findUnique({
        where: { id: signalId },
        select: { status: true },
      });
      if (current?.status === 'approved') {
        await this.prisma.signal.update({
          where: { id: signalId },
          data: { status: shouldMarkSignalFailed(err) ? 'failed' : 'active' },
        });
      }
      throw err;
    }
  }
}

function shouldMarkSignalFailed(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return [
    'Please sign TradFi-Perps agreement contract fapi.',
    'API-key format invalid',
    'Position size is zero after step-size rounding',
    'Position size below Binance minimum notional',
    'Signal has expired',
    'Signal is stale',
    'Signal has no strategy',
    'SL order failed',
  ].some((text) => message.includes(text));
}
