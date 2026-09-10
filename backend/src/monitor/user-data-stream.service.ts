import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WebSocket } from 'ws';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PositionMonitorService } from './position-monitor.service';

const LIVE_USER_STREAM_WS = 'wss://fstream.binance.com/ws/';

interface BinanceOrderTradeUpdateEvent {
  e: string;
  o?: {
    s: string; // symbol
    ot: string; // original order type
    X: string; // order status
    i: number; // order id
  };
}

/**
 * Binance USD-M Futures User Data Stream — pushes order fills, account, and
 * margin-call events over a WebSocket instead of requiring a poll.
 *
 * This does NOT replace PositionMonitorService's 5s REST poll — that stays
 * as the safety net for gaps between a WS disconnect and the next supervisor
 * tick, and for anything this handler doesn't cover. What this adds is
 * near-instant close detection: when a STOP_MARKET or TAKE_PROFIT_MARKET
 * bracket order fills, the DB trade is finalized within milliseconds instead
 * of waiting up to 5s for the next poll to notice the position vanished.
 */
@Injectable()
export class UserDataStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(UserDataStreamService.name);
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private connecting = false;

  constructor(
    private readonly binanceService: BinanceService,
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    private readonly positionMonitorService: PositionMonitorService,
  ) {}

  onModuleDestroy(): void {
    this.teardown();
  }

  // Supervises connection state: starts the stream when the bot is live,
  // tears it down otherwise, and reconnects if a prior connection dropped.
  // A flat 30s recheck is simpler than exponential-backoff bookkeeping and
  // frequent enough that a dropped WS is re-established quickly — the REST
  // poll covers the gap in between.
  @Cron('*/30 * * * * *')
  async supervise(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst().catch(() => null);
    const shouldRun = settings?.mode === 'live' && this.binanceService.hasApiKeys();

    if (!shouldRun) {
      if (this.ws) this.teardown();
      return;
    }
    if (this.ws || this.connecting) return;

    this.connecting = true;
    try {
      this.listenKey = await this.binanceService.createListenKey();
      this.connect();
    } catch (err) {
      await this.logsService.warn('user-data-stream', 'Failed to create listenKey — will retry next cycle', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.connecting = false;
    }
  }

  // Binance invalidates a listenKey after 60 minutes without a keepalive.
  @Cron('0 */30 * * * *')
  async keepAlive(): Promise<void> {
    if (!this.listenKey) return;
    await this.binanceService.keepAliveListenKey().catch(async (err) => {
      await this.logsService.warn('user-data-stream', 'listenKey keepalive failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private connect(): void {
    if (!this.listenKey) return;
    const ws = new WebSocket(LIVE_USER_STREAM_WS + this.listenKey);
    this.ws = ws;

    ws.on('open', () => {
      this.logger.log('Binance user data stream connected');
      void this.logsService.info('user-data-stream', 'Binance user data stream connected');
    });

    ws.on('message', (raw) => {
      void this.handleMessage(raw.toString()).catch(async (err) => {
        await this.logsService.warn('user-data-stream', 'Failed to process user data stream message', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    ws.on('error', (err) => {
      this.logger.warn(`User data stream error: ${err.message}`);
    });

    ws.on('close', () => {
      void this.logsService.warn('user-data-stream', 'Binance user data stream disconnected — will reconnect next cycle');
      this.ws = null;
      // listenKey stays valid for its TTL — supervise() reuses it on reconnect.
    });
  }

  private teardown(): void {
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    if (this.listenKey) {
      void this.binanceService.closeListenKey().catch(() => {});
    }
    this.listenKey = null;
  }

  private async handleMessage(raw: string): Promise<void> {
    const payload = JSON.parse(raw) as BinanceOrderTradeUpdateEvent;

    if (payload.e === 'listenKeyExpired') {
      await this.logsService.warn('user-data-stream', 'listenKey expired — reconnecting');
      this.teardown();
      return;
    }

    if (payload.e === 'MARGIN_CALL') {
      await this.logsService.risk(
        'margin_call',
        'Binance sent a MARGIN_CALL event — position(s) approaching liquidation',
        'critical',
        { raw: payload },
      );
      return;
    }

    if (payload.e !== 'ORDER_TRADE_UPDATE') return;

    const order = payload.o;
    if (!order || order.X !== 'FILLED') return;
    // Only react to our bracket exit orders. Entry fills and bot-initiated
    // manual/time-stop closes are already handled synchronously by the code
    // that places them; reacting here too is harmless (finalizeExchangeClosedTrade's
    // write is guarded by status: 'live_open') but unnecessary.
    if (order.ot !== 'STOP_MARKET' && order.ot !== 'TAKE_PROFIT_MARKET') return;

    const trade = await this.prisma.trade.findFirst({ where: { symbol: order.s, status: 'live_open' } });
    if (!trade) return;

    if (order.ot === 'TAKE_PROFIT_MARKET') {
      // TP1/TP2 are separate half-quantity orders — one filling doesn't mean
      // the position is flat. Confirm before finalizing; a real partial fill
      // just waits for the other leg (or the REST poll safety net).
      const stillOpen = await this.binanceService
        .fetchOpenPositions()
        .then((positions) => positions.some((p) => p.symbol === order.s))
        .catch(() => true);
      if (stillOpen) {
        await this.logsService.info('user-data-stream', `Partial close (TP leg filled): ${order.s}`, {
          tradeId: trade.id,
          orderId: order.i,
        });
        return;
      }
    }

    await this.logsService.info('user-data-stream', `Real-time close detected: ${order.s}`, {
      tradeId: trade.id,
      orderType: order.ot,
      orderId: order.i,
    });
    await this.positionMonitorService.finalizeExchangeClosedTrade(trade);
  }
}
