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
    const candidates: StrategySignalCandidate[] = [];

    for (const strategy of [
      this.breakoutVolumeStrategy,
      this.pullbackContinuationStrategy,
      this.exhaustionReversalStrategy,
    ]) {
      const signal = strategy.evaluate(context);
      if (signal) candidates.push(signal);
    }

    if (candidates.length === 0) return null;

    return candidates.reduce((best, c) => (c.strategyScore > best.strategyScore ? c : best));
  }
}
