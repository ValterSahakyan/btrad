import { Candle, MarketRegimeResult, StrategySignalCandidate } from '../common/types/trading.types';

export interface BreakoutConfig {
  enabled: boolean;
  minVolumeRatio: number;
  lookbackPeriod: number;
  maxSlPercent: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  minHotScore: number;
}

export interface PullbackConfig {
  enabled: boolean;
  rsiLongMin: number;
  rsiLongMax: number;
  rsiShortMin: number;
  rsiShortMax: number;
  atrMultiplier: number;
  maxSlPercent: number;
  minHotScore: number;
}

export interface ReversionConfig {
  enabled: boolean;
  rsiOverbought: number;
  rsiOversold: number;
  vwapDeviationPct: number;
  volumeDeclineRatio: number;
  maxSlPercent: number;
}

export interface TrendReclaimConfig {
  enabled: boolean;
  emaBufferAtr: number;
  reclaimVolumeRatio: number;
  maxSlPercent: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  minHotScore: number;
}

export interface RangeBounceConfig {
  enabled: boolean;
  lookbackPeriod: number;
  proximityAtr: number;
  rsiLongMax: number;
  rsiShortMin: number;
  maxSlPercent: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  minHotScore: number;
}

export interface StrategyConfig {
  breakout: BreakoutConfig;
  pullback: PullbackConfig;
  reversion: ReversionConfig;
  trendReclaim: TrendReclaimConfig;
  rangeBounce: RangeBounceConfig;
}

export interface StrategyContext {
  symbol: string;
  candles15m: Candle[];
  candles1h: Candle[];
  hotScore: number;
  spread: number;
  marketRegime: MarketRegimeResult;
  minRiskReward: number;
  strategyConfig: StrategyConfig;
}

export interface TradingStrategy {
  readonly name: string;
  evaluate(context: StrategyContext): StrategySignalCandidate | null;
}
