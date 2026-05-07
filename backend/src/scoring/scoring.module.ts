import { Module } from '@nestjs/common';
import { ConfidenceScoreService } from './confidence-score.service';

@Module({
  providers: [ConfidenceScoreService],
  exports: [ConfidenceScoreService],
})
export class ScoringModule {}
