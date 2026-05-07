import { Injectable } from '@nestjs/common';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class PullbackContinuationStrategy implements TradingStrategy {
  readonly name = 'pullback_continuation';
  readonly enabled = false;

  evaluate(_context: StrategyContext) {
    return null;
  }
}
