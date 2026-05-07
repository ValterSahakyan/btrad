import { Module } from '@nestjs/common';
import { BreakoutVolumeStrategy } from './breakout-volume.strategy';
import { ExhaustionReversalStrategy } from './exhaustion-reversal.strategy';
import { PullbackContinuationStrategy } from './pullback-continuation.strategy';
import { StrategySelectorService } from './strategy-selector.service';

@Module({
  providers: [
    BreakoutVolumeStrategy,
    PullbackContinuationStrategy,
    ExhaustionReversalStrategy,
    StrategySelectorService,
  ],
  exports: [StrategySelectorService],
})
export class StrategiesModule {}
