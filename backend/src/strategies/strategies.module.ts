import { Module } from '@nestjs/common';
import { BreakoutVolumeStrategy } from './breakout-volume.strategy';
import { ExhaustionReversalStrategy } from './exhaustion-reversal.strategy';
import { PullbackContinuationStrategy } from './pullback-continuation.strategy';
import { RangeBounceStrategy } from './range-bounce.strategy';
import { StrategySelectorService } from './strategy-selector.service';
import { TrendReclaimStrategy } from './trend-reclaim.strategy';

@Module({
  providers: [
    BreakoutVolumeStrategy,
    PullbackContinuationStrategy,
    ExhaustionReversalStrategy,
    TrendReclaimStrategy,
    RangeBounceStrategy,
    StrategySelectorService,
  ],
  exports: [StrategySelectorService],
})
export class StrategiesModule {}
