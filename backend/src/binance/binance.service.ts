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
  BinanceKline,
  BinanceOpenInterest,
  BinancePosition,
  BinanceSymbolInfo,
  BinanceTicker24h,
  KlineRequest,
  PlaceOrderInput,
} from './binance.types';
import { signQuery } from './binance.utils';

@Injectable()
export class BinanceService {
  private readonly testnetHttp: AxiosInstance;
  private readonly liveHttp: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logsService: LogsService,
    private readonly prisma: PrismaService,
  ) {
    this.testnetHttp = axios.create({ baseURL: 'https://testnet.binancefuture.com', timeout: 10000 });
    this.liveHttp = axios.create({ baseURL: 'https://fapi.binance.com', timeout: 10000 });
    this.apiKey = this.configService.get<string>('binanceApiKey', '');
    this.apiSecret = this.configService.get<string>('binanceApiSecret', '');
  }

  private async getHttp(): Promise<AxiosInstance> {
    const settings = await this.prisma.botSettings.findFirst();
    return settings?.mode === 'live' ? this.liveHttp : this.testnetHttp;
  }

  private async get<T>(url: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
      const http = await this.getHttp();
      const { data } = await http.get<T>(url, { params });
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
    const query = new URLSearchParams(
      Object.entries({ ...params, timestamp }).map(([key, value]) => [key, String(value)]),
    ).toString();
    const signature = signQuery(query, this.apiSecret);

    try {
      const http = await this.getHttp();
      const { data } = await http.request<T>({
        method,
        url,
        params: { ...params, timestamp, signature },
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

  async fetchOpenPositions(): Promise<BinancePosition[]> {
    const positions = await this.signedRequest<BinancePosition[]>('GET', '/fapi/v2/positionRisk');
    return positions.filter((position) => Number(position.positionAmt) !== 0);
  }

  async setLeverage(symbol: string, leverage: number): Promise<unknown> {
    return this.signedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  async placeOrder(input: PlaceOrderInput): Promise<unknown> {
    return this.signedRequest('POST', '/fapi/v1/order', {
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      stopPrice: input.stopPrice,
      reduceOnly: input.reduceOnly,
      newClientOrderId: input.clientOrderId,
      timeInForce: input.type === 'LIMIT' ? 'GTC' : undefined,
    });
  }

  async cancelOrder(symbol: string, orderId: string): Promise<unknown> {
    return this.signedRequest('DELETE', '/fapi/v1/order', { symbol, orderId });
  }
}
