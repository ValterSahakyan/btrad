import { Injectable } from '@nestjs/common';
import { StrategySignalCandidate } from '../common/types/trading.types';
import { BreakoutVolumeStrategy } from './breakout-volume.strategy';
import { ExhaustionReversalStrategy } from './exhaustion-reversal.strategy';
import { PullbackContinuationStrategy } from './pullback-continuation.strategy';
import { RangeBounceStrategy } from './range-bounce.strategy';
import { StrategyContext } from './strategy.interface';
import { TrendReclaimStrategy } from './trend-reclaim.strategy';

@Injectable()
export class StrategySelectorService {
  constructor(
    private readonly breakoutVolumeStrategy: BreakoutVolumeStrategy,
    private readonly pullbackContinuationStrategy: PullbackContinuationStrategy,
    private readonly exhaustionReversalStrategy: ExhaustionReversalStrategy,
    private readonly trendReclaimStrategy: TrendReclaimStrategy,
    private readonly rangeBounceStrategy: RangeBounceStrategy,
  ) {}

  evaluate(context: StrategyContext): StrategySignalCandidate | null {
    return this.evaluateAll(context).at(0) ?? null;
  }

  evaluateAll(context: StrategyContext): StrategySignalCandidate[] {
    const candidates: StrategySignalCandidate[] = [];

    for (const strategy of [
      this.breakoutVolumeStrategy,
      this.pullbackContinuationStrategy,
      this.exhaustionReversalStrategy,
      this.trendReclaimStrategy,
      this.rangeBounceStrategy,
    ]) {
      const signal = strategy.evaluate(context);
      if (signal) candidates.push(signal);
    }

    return candidates.sort((a, b) => rankCandidate(b) - rankCandidate(a));
  }
}

function rankCandidate(candidate: StrategySignalCandidate): number {
  const strategyBias =
    candidate.strategy === 'breakout_volume' ? 5
      : candidate.strategy === 'trend_reclaim' ? 1
        : candidate.strategy === 'range_bounce' ? 2
          : candidate.strategy === 'pullback_continuation' ? -2
            : candidate.strategy === 'mean_reversion' ? -4
              : 0;

  return candidate.strategyScore + strategyBias;
}
