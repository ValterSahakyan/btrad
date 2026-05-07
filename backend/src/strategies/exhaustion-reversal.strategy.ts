import { Injectable } from '@nestjs/common';
import { StrategyContext, TradingStrategy } from './strategy.interface';

@Injectable()
export class ExhaustionReversalStrategy implements TradingStrategy {
  readonly name = 'exhaustion_reversal';
  readonly enabled = false;

  evaluate(_context: StrategyContext) {
    return null;
  }
}
