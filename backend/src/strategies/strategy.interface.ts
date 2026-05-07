import { Candle, MarketRegimeResult, StrategySignalCandidate } from '../common/types/trading.types';

export interface StrategyContext {
  symbol: string;
  candles15m: Candle[];
  candles1h: Candle[];
  hotScore: number;
  spread: number;
  marketRegime: MarketRegimeResult;
  minRiskReward: number;
}

export interface TradingStrategy {
  readonly name: string;
  readonly enabled: boolean;
  evaluate(context: StrategyContext): StrategySignalCandidate | null;
}
