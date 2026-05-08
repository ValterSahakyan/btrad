import { Candle } from '../common/types/trading.types';

export interface BinanceSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; notional?: string }>;
}

export interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  priceChangePercent: string;
}

export interface BinanceFundingRate {
  symbol: string;
  fundingRate: string;
}

export type BinanceKline = [
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  ...unknown[],
];

export interface BinanceOpenInterest {
  symbol: string;
  openInterest: string;
}

export interface PlaceOrderInput {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity?: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  clientOrderId: string;
}

export interface BinanceAccountBalance {
  asset: string;
  availableBalance: string;
  balance: string;
}

export interface BinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
}

export interface KlineRequest {
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h';
  limit?: number;
}

export interface ParsedMarketData {
  candles: Candle[];
  markPrice: number;
  fundingRate: number;
  openInterest: number;
}

export interface BinanceOrderResult {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  status: string;
  side: string;
  type: string;
  avgPrice: string;
  price: string;
  executedQty: string;
  isAlgoOrder?: boolean;
}

export interface BinanceIncome {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  time: number;
}
