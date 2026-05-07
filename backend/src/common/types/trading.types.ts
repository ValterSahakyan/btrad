export type Direction = 'LONG' | 'SHORT';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface ScoreBreakdown {
  hotScore: number;
  strategyScore: number;
  marketScore: number;
  liquidityScore: number;
  riskScore: number;
  confidenceScore: number;
}

export interface StrategySignalCandidate {
  symbol: string;
  direction: Direction;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  reasonList: string[];
  invalidationRules: string[];
  strategyScore: number;
}

export interface RiskValidationResult {
  allowed: boolean;
  riskAmount: number;
  positionSize: number;
  leverage: number;
  riskScore: number;
  messages: string[];
}

export interface MarketRegimeResult {
  regime: 'bullish' | 'bearish' | 'sideways' | 'high_volatility' | 'no_trade';
  score: number;
  btcTrend: string;
  ethTrend: string;
  volatility: number;
  caution: string[];
}
