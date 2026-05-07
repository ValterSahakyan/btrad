import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { BreakoutVolumeStrategy } from './breakout-volume.strategy';
import { ExhaustionReversalStrategy } from './exhaustion-reversal.strategy';
import { PullbackContinuationStrategy } from './pullback-continuation.strategy';
import { StrategyContext } from './strategy.interface';

@Injectable()
export class StrategySelectorService {
  constructor(
    private readonly breakoutVolumeStrategy: BreakoutVolumeStrategy,
    private readonly pullbackContinuationStrategy: PullbackContinuationStrategy,
    private readonly exhaustionReversalStrategy: ExhaustionReversalStrategy,
  ) {}

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    const strategies = [
      this.breakoutVolumeStrategy,
      this.pullbackContinuationStrategy,
      this.exhaustionReversalStrategy,
    ].filter((strategy) => strategy.enabled);

    for (const strategy of strategies) {
      const signal = strategy.evaluate(context);
      if (signal) {
        return signal;
      }
    }

    return null;
  }
}
