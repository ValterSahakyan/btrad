import { Injectable } from '@nestjs/common';

@Injectable()
export class PositionSizeService {
  calculate(
    balance: number,
    riskPerTradePercent: number,
    entryPrice: number,
    stopLoss: number,
    stepSize = 0.001,
    maxNotionalUsd = 0,
  ): { riskAmount: number; stopDistance: number; quantity: number } {
    const riskAmount = (balance * riskPerTradePercent) / 100;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    if (stopDistance === 0 || entryPrice === 0) return { riskAmount, stopDistance: 0, quantity: 0 };

    let rawQuantity = riskAmount / stopDistance;

    // Cap notional to maxPositionUsd when set (prevents huge positions from tight stops)
    if (maxNotionalUsd > 0) {
      const maxQty = maxNotionalUsd / entryPrice;
      rawQuantity = Math.min(rawQuantity, maxQty);
    }

    const steps = Math.floor(rawQuantity / stepSize);
    const quantity = Number((steps * stepSize).toFixed(8));
    return { riskAmount, stopDistance, quantity };
  }
}
