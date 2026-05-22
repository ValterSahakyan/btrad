import { Injectable } from '@nestjs/common';
import { clamp } from '../common/utils/math';

@Injectable()
export class HotScoreService {
  calculate(input: {
    volume24h: number;
    priceChange24h: number;
    volumeSpikeRatio: number;
    volatility: number;
    openInterest: number;
    fundingRate: number;
    spread: number;
    liquidity: number;
  }): number {
    const volumeScore = clamp(input.volume24h / 5_000_000, 0, 1) * 25;
    const priceMoveScore = clamp(Math.abs(input.priceChange24h) / 10, 0, 1) * 20;
    const volumeSpikeScore = clamp(input.volumeSpikeRatio / 3, 0, 1) * 20;
    // openInterest is expected as USD notional (coins × price)
    // Normalized to $100M — mid-cap alts ($50-200M OI) score fairly, not near-zero
    const openInterestScore = clamp(input.openInterest / 100_000_000, 0, 1) * 15;
    const volatilityScore = clamp(input.volatility / 5, 0, 1) * 10;
    const liquiditySpreadScore = clamp((input.liquidity / 100) * (1 - input.spread / 1.5), 0, 1) * 10;
    const fundingPenalty = Math.abs(input.fundingRate) > 0.01 ? 5 : 0;

    return clamp(
      Number(
        (volumeScore +
          priceMoveScore +
          volumeSpikeScore +
          openInterestScore +
          volatilityScore +
          liquiditySpreadScore -
          fundingPenalty).toFixed(2),
      ),
      0,
      100,
    );
  }
}
