import { Injectable } from '@nestjs/common';

@Injectable()
export class PositionSizeService {
  calculate(
    balance: number,
    riskPerTradePercent: number,
    entryPrice: number,
    stopLoss: number,
    stepSize = 0.001,
  ): { riskAmount: number; stopDistance: number; quantity: number } {
    const riskAmount = (balance * riskPerTradePercent) / 100;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    if (stopDistance === 0) return { riskAmount, stopDistance: 0, quantity: 0 };

    const rawQuantity = riskAmount / stopDistance;
    // Round DOWN to nearest stepSize so we never exceed risk
    const steps = Math.floor(rawQuantity / stepSize);
    const quantity = Number((steps * stepSize).toFixed(8));
    return { riskAmount, stopDistance, quantity };
  }
}
