import { Injectable } from '@nestjs/common';
import { clamp } from '../common/utils/math';

@Injectable()
export class ConfidenceScoreService {
  calculate(input: {
    hotScore: number;
    strategyScore: number;
    marketScore: number;
    liquidityScore: number;
    riskScore: number;
  }): number {
    const confidenceScore =
      input.hotScore * 0.25 +
      input.strategyScore * 0.3 +
      input.marketScore * 0.2 +
      input.liquidityScore * 0.15 +
      input.riskScore * 0.1;

    return clamp(Number(confidenceScore.toFixed(2)), 0, 100);
  }
}
