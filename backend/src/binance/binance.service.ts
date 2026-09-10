import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { BinanceApiError } from '../common/errors/binance.error';
import { Candle } from '../common/types/trading.types';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BinanceAccountBalance,
  BinanceFundingRate,
  BinanceIncome,
  BinanceKline,
  BinanceOpenInterest,
  BinanceOrderResult,
  BinancePosition,
  BinanceSymbolInfo,
  BinanceTicker24h,
  KlineRequest,
  PlaceOrderInput,
} from './binance.types';
import { signQuery } from './binance.utils';

type BinanceStandardOrderResponse = {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  status: string;
  side: string;
  type: string;
  avgPrice: string;
  price: string;
  executedQty: string;
};

type BinanceAlgoOrderResponse = {
  algoId: number;
  clientAlgoId: string;
  symbol: string;
  side: string;
  orderType: string;
  algoStatus: string;
  quantity?: string;
  price?: string;
};

@Injectable()
export class BinanceService {
  private readonly testnetHttp: AxiosInstance;
  private readonly liveHttp: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  private readonly mainHttp: AxiosInstance;

  // Cached position mode — hedge (dual) vs one-way. Refreshed every hour.
  private cachedPositionMode: 'one-way' | 'hedge' | null = null;
  private positionModeCachedAt = 0;

  // IP-level circuit breaker. Binance escalates ban duration for every request
  // that arrives WHILE already banned/rate-limited — so the fix for a ban is to
  // go completely silent until it lifts, not retry faster. Every request path
  // (get() and signedRequest()) checks this before making a call; handleError()
  // sets it the moment Binance reports a ban or a 429/418.
  private bannedUntilMs = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly logsService: LogsService,
    private readonly prisma: PrismaService,
  ) {
    this.testnetHttp = axios.create({ baseURL: 'https://testnet.binancefuture.com', timeout: 10000 });
    this.liveHttp = axios.create({ baseURL: 'https://fapi.binance.com', timeout: 10000 });
    this.mainHttp = axios.create({ baseURL: 'https://api.binance.com', timeout: 10000 });
    this.apiKey = this.configService.get<string>('binanceApiKey', '');
    this.apiSecret = this.configService.get<string>('binanceApiSecret', '');
  }

  private async getHttp(): Promise<AxiosInstance> {
    const settings = await this.prisma.botSettings.findFirst();
    return settings?.mode === 'live' ? this.liveHttp : this.testnetHttp;
  }

  // Throws locally, without touching the network, while an IP ban/rate-limit
  // is active — every additional request during a ban makes Binance extend it.
  private assertNotBanned(): void {
    if (Date.now() < this.bannedUntilMs) {
      throw new BinanceApiError(
        `Binance IP rate-limit/ban in effect until ${new Date(this.bannedUntilMs).toISOString()} — request skipped locally to avoid extending it`,
      );
    }
  }

  private async get<T>(url: string, params: Record<string, unknown> = {}): Promise<T> {
    this.assertNotBanned();
    try {
      // Always use live Binance for market data — testnet has synthetic/fake volumes
      const { data } = await this.liveHttp.get<T>(url, { params });
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    this.assertNotBanned();
    const timestamp = Date.now();
    // Strip undefined values — Axios excludes them from the request, so the
    // signature must be computed over the same set of params Axios will actually send.
    const cleanParams = Object.fromEntries(
      Object.entries({ ...params, timestamp }).filter(([, v]) => v !== undefined),
    );
    const query = new URLSearchParams(
      Object.entries(cleanParams).map(([key, value]) => [key, String(value)]),
    ).toString();
    const signature = signQuery(query, this.apiSecret);

    try {
      const http = await this.getHttp();
      const { data } = await http.request<T>({
        method,
        url,
        params: { ...cleanParams, signature },
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });

      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): BinanceApiError {
    const axiosError = error as AxiosError<{ code?: number; msg?: string }>;
    const message = axiosError.response?.data?.msg ?? axiosError.message;
    const status = axiosError.response?.status;

    // Binance embeds the exact unban timestamp (epoch ms) in the message for a
    // hard IP ban (HTTP 418): "IP banned until 1787828214796". Trust it verbatim.
    const banMatch = /banned until (\d+)/i.exec(message ?? '');
    if (banMatch) {
      this.bannedUntilMs = Math.max(this.bannedUntilMs, Number(banMatch[1]));
    } else if (status === 429 || status === 418) {
      // Soft rate-limit (429) or a ban without a parseable timestamp — honor
      // Retry-After if Binance sent one, otherwise back off a safe default.
      const retryAfterSec = Number(axiosError.response?.headers?.['retry-after']);
      const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 60_000;
      this.bannedUntilMs = Math.max(this.bannedUntilMs, Date.now() + backoffMs);
    }

    if (this.bannedUntilMs > Date.now()) {
      void this.logsService.risk(
        'binance_ip_banned',
        `Binance rate-limited/banned this IP until ${new Date(this.bannedUntilMs).toISOString()} — pausing all Binance calls until then`,
        'critical',
        { status, message },
      );
    }

    void this.logsService.error('binance', message, {
      status,
      code: axiosError.response?.data?.code,
    });
    return new BinanceApiError(message, axiosError.response?.data?.code, status);
  }

  async fetchExchangeInfo(): Promise<{ symbols: BinanceSymbolInfo[] }> {
    return this.get('/fapi/v1/exchangeInfo');
  }

  async fetchUsdtSymbols(): Promise<BinanceSymbolInfo[]> {
    const exchangeInfo = await this.fetchExchangeInfo();
    return exchangeInfo.symbols.filter((symbol) => symbol.quoteAsset === 'USDT');
  }

  async fetch24hTickerStats(): Promise<BinanceTicker24h[]> {
    return this.get('/fapi/v1/ticker/24hr');
  }

  async fetchKlines({ symbol, interval, limit = 200 }: KlineRequest): Promise<Candle[]> {
    const data = await this.get<BinanceKline[]>('/fapi/v1/klines', { symbol, interval, limit });
    return data.map((entry) => ({
      openTime: Number(entry[0]),
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5]),
      closeTime: Number(entry[6]),
    }));
  }

  async fetchMarkPrice(symbol: string): Promise<number> {
    const data = await this.get<{ markPrice: string }>('/fapi/v1/premiumIndex', { symbol });
    return Number(data.markPrice);
  }

  async fetchFundingRate(symbol: string): Promise<number> {
    const data = await this.get<BinanceFundingRate[]>('/fapi/v1/fundingRate', { symbol, limit: 1 });
    return Number(data[0]?.fundingRate ?? 0);
  }

  async fetchOpenInterest(symbol: string): Promise<number> {
    const data = await this.get<BinanceOpenInterest>('/fapi/v1/openInterest', { symbol });
    return Number(data.openInterest);
  }

  async fetchAccountBalance(): Promise<BinanceAccountBalance[]> {
    return this.signedRequest('GET', '/fapi/v2/balance');
  }

  async fetchLiveAccountBalance(): Promise<BinanceAccountBalance[]> {
    const timestamp = Date.now();
    const query = new URLSearchParams(
      Object.entries({ timestamp }).map(([k, v]) => [k, String(v)]),
    ).toString();
    const signature = signQuery(query, this.apiSecret);
    try {
      const { data } = await this.liveHttp.get<BinanceAccountBalance[]>('/fapi/v2/balance', {
        params: { timestamp, signature },
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async fetchFundingBalance(): Promise<number> {
    const timestamp = Date.now();
    const query = new URLSearchParams({ timestamp: String(timestamp) }).toString();
    const signature = signQuery(query, this.apiSecret);
    try {
      const { data } = await this.mainHttp.post<{ asset: string; free: string }[]>(
        '/sapi/v1/asset/get-funding-asset',
        null,
        { params: { timestamp, signature }, headers: { 'X-MBX-APIKEY': this.apiKey } },
      );
      const usdt = data.find((a) => a.asset === 'USDT');
      return usdt ? Number(usdt.free) : 0;
    } catch {
      return 0;
    }
  }

  async fetchOpenPositions(): Promise<BinancePosition[]> {
    const positions = await this.signedRequest<BinancePosition[]>('GET', '/fapi/v2/positionRisk');
    return positions.filter((position) => Number(position.positionAmt) !== 0);
  }

  async setLeverage(symbol: string, leverage: number): Promise<unknown> {
    return this.signedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  // listenKey endpoints authenticate with the API-KEY header only — no
  // HMAC signature — unlike every other private endpoint on this class.
  async createListenKey(): Promise<string> {
    const http = await this.getHttp();
    const { data } = await http.post<{ listenKey: string }>('/fapi/v1/listenKey', null, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    return data.listenKey;
  }

  async keepAliveListenKey(): Promise<void> {
    const http = await this.getHttp();
    await http.put('/fapi/v1/listenKey', null, { headers: { 'X-MBX-APIKEY': this.apiKey } });
  }

  async closeListenKey(): Promise<void> {
    const http = await this.getHttp();
    await http.delete('/fapi/v1/listenKey', { headers: { 'X-MBX-APIKEY': this.apiKey } });
  }

  // Isolated margin caps a bad trade's downside to that position's own margin.
  // Cross margin (Binance's per-symbol default) pools the ENTIRE account
  // balance as collateral for every open position — the risk engine's
  // riskPerTradePercent budget assumes losses are capped per-trade, which
  // cross margin silently breaks. Binance returns code -4046 ("No need to
  // change margin type") when a symbol is already isolated — treated as
  // success, not an error.
  async setIsolatedMargin(symbol: string): Promise<void> {
    try {
      await this.signedRequest('POST', '/fapi/v1/marginType', { symbol, marginType: 'ISOLATED' });
    } catch (error) {
      if (error instanceof BinanceApiError && Number(error.code) === -4046) return;
      throw error;
    }
  }

  hasApiKeys(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  // Epoch ms until which this IP is rate-limited/banned by Binance, or 0 if
  // clear. Lets callers show a clean message up front instead of letting a
  // doomed request throw a raw BinanceApiError.
  getBannedUntilMs(): number {
    return this.bannedUntilMs;
  }

  /**
   * Returns 'hedge' if the Binance account is in dual-position (Hedge) mode,
   * 'one-way' otherwise. Result is cached for 1 hour.
   *
   * In Hedge Mode every order MUST include positionSide (LONG / SHORT).
   * In One-Way Mode positionSide should be BOTH (or omitted).
   */
  async getPositionMode(): Promise<'one-way' | 'hedge'> {
    if (this.cachedPositionMode && Date.now() - this.positionModeCachedAt < 60 * 60_000) {
      return this.cachedPositionMode;
    }
    try {
      const data = await this.signedRequest<{ dualSidePosition: boolean }>('GET', '/fapi/v1/positionSide/dual');
      this.cachedPositionMode = data.dualSidePosition ? 'hedge' : 'one-way';
    } catch {
      this.cachedPositionMode = 'one-way'; // safe default
    }
    this.positionModeCachedAt = Date.now();
    return this.cachedPositionMode;
  }

  async placeOrder(input: PlaceOrderInput): Promise<BinanceOrderResult> {
    const useClosePosition = input.closePosition === true;
    const isConditional = input.type === 'STOP_MARKET' || input.type === 'TAKE_PROFIT_MARKET';

    const standardParams = {
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      positionSide: input.positionSide,
      quantity: useClosePosition ? undefined : input.quantity,
      price: input.price,
      stopPrice: input.stopPrice,
      reduceOnly: useClosePosition ? undefined : input.reduceOnly,
      closePosition: useClosePosition ? true : undefined,
      workingType: isConditional ? (input.workingType ?? 'MARK_PRICE') : undefined,
      newClientOrderId: input.clientOrderId,
      timeInForce: input.type === 'LIMIT' ? 'GTC' : undefined,
    };

    if (isConditional) {
      // The standard /fapi/v1/order endpoint always returns -4120 for STOP_MARKET /
      // TAKE_PROFIT_MARKET. Must use the Algo Order API for all conditional orders.
      const algoResponse = await this.signedRequest<BinanceAlgoOrderResponse>('POST', '/fapi/v1/algoOrder', {
        algoType: 'CONDITIONAL',
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        positionSide: input.positionSide,
        quantity: useClosePosition ? undefined : input.quantity,
        price: input.price,
        triggerPrice: input.stopPrice,
        reduceOnly: useClosePosition ? undefined : input.reduceOnly,
        closePosition: useClosePosition ? true : undefined,
        workingType: input.workingType ?? 'MARK_PRICE',
        clientAlgoId: input.clientOrderId,
      });
      return {
        orderId: String(algoResponse.algoId),
        clientOrderId: algoResponse.clientAlgoId,
        symbol: algoResponse.symbol,
        status: algoResponse.algoStatus,
        side: algoResponse.side,
        type: algoResponse.orderType,
        avgPrice: '0',
        price: algoResponse.price ?? '0',
        executedQty: algoResponse.quantity ?? '0',
        isAlgoOrder: true,
      };
    }

    const response = await this.signedRequest<BinanceStandardOrderResponse>('POST', '/fapi/v1/order', standardParams);
    return {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      symbol: response.symbol,
      status: response.status,
      side: response.side,
      type: response.type,
      avgPrice: response.avgPrice,
      price: response.price,
      executedQty: response.executedQty,
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<unknown> {
    return this.signedRequest('DELETE', '/fapi/v1/order', { symbol, orderId });
  }

  async cancelAlgoOrder(algoId?: string, clientAlgoId?: string): Promise<unknown> {
    return this.signedRequest('DELETE', '/fapi/v1/algoOrder', {
      algoId,
      clientAlgoId,
    });
  }

  async cancelAllOpenOrders(symbol: string): Promise<unknown> {
    return this.signedRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol });
  }

  // Sums ALL income types (REALIZED_PNL, COMMISSION, FUNDING_FEE, ...) for the
  // symbol since startTime — this is the actual net effect on account balance,
  // not just the raw price-close PnL. A REALIZED_PNL-only filter here would
  // silently drop entry/exit commission and any funding paid during the hold,
  // overstating every trade's true result (verified: a ~6h45m BSBUSDT hold on
  // 2026-08-21 showed +$0.1906 realized PnL but -$0.0186 in commission +
  // funding — 9.6% of the reported profit unaccounted for).
  async fetchRealizedPnl(symbol: string, startTime: number): Promise<number> {
    const fetchSum = async () => {
      const income = await this.signedRequest<BinanceIncome[]>('GET', '/fapi/v1/income', {
        symbol,
        startTime,
        limit: 200,
      });
      return income.reduce((sum, entry) => sum + Number(entry.income), 0);
    };

    const sum = await fetchSum();
    if (sum !== 0) return sum;

    // Some call sites query this within milliseconds of placing the closing
    // order — Binance's income ledger isn't guaranteed to have indexed the
    // fill's commission/PnL entries that fast. A commission-free, PnL-free
    // close is implausible for a real executed trade, so a 0 here is more
    // likely "not indexed yet" than "genuinely net zero" — retry once after
    // a short delay before accepting it.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return fetchSum();
  }
}
