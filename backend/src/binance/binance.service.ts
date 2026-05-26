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

  private async get<T>(url: string, params: Record<string, unknown> = {}): Promise<T> {
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
    void this.logsService.error('binance', message, {
      status: axiosError.response?.status,
      code: axiosError.response?.data?.code,
    });
    return new BinanceApiError(message, axiosError.response?.data?.code, axiosError.response?.status);
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

  hasApiKeys(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  async placeOrder(input: PlaceOrderInput): Promise<BinanceOrderResult> {
    const useClosePosition = input.closePosition === true;
    const isConditional = input.type === 'STOP_MARKET' || input.type === 'TAKE_PROFIT_MARKET';

    const response = await this.signedRequest<BinanceStandardOrderResponse>('POST', '/fapi/v1/order', {
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      quantity: useClosePosition ? undefined : input.quantity,
      price: input.price,
      stopPrice: input.stopPrice,
      reduceOnly: useClosePosition ? undefined : input.reduceOnly,
      closePosition: useClosePosition ? true : undefined,
      workingType: isConditional ? 'MARK_PRICE' : undefined,
      newClientOrderId: input.clientOrderId,
      timeInForce: input.type === 'LIMIT' ? 'GTC' : undefined,
    });

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

  async fetchRealizedPnl(symbol: string, startTime: number): Promise<number> {
    const income = await this.signedRequest<BinanceIncome[]>('GET', '/fapi/v1/income', {
      symbol,
      incomeType: 'REALIZED_PNL',
      startTime,
      limit: 20,
    });
    return income.reduce((sum, entry) => sum + Number(entry.income), 0);
  }
}
