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
    minNotionalUsd = 0,
  ): { riskAmount: number; stopDistance: number; quantity: number } {
    const riskAmount = (balance * riskPerTradePercent) / 100;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    if (stopDistance === 0 || entryPrice === 0) return { riskAmount, stopDistance: 0, quantity: 0 };

    let rawQuantity = riskAmount / stopDistance;

    // Floor to minPositionUsd — ensures position is always at least the configured minimum.
    // This means the bot uses minPositionUsd as a fixed bet floor rather than blocking the trade.
    if (minNotionalUsd > 0) {
      const minQty = minNotionalUsd / entryPrice;
      rawQuantity = Math.max(rawQuantity, minQty);
    }

    // Cap notional to maxPositionUsd — hard ceiling regardless of risk formula.
    if (maxNotionalUsd > 0) {
      const maxQty = maxNotionalUsd / entryPrice;
      rawQuantity = Math.min(rawQuantity, maxQty);
    }

    const steps = Math.floor(rawQuantity / stepSize);
    const quantity = Number((steps * stepSize).toFixed(8));
    return { riskAmount, stopDistance, quantity };
  }
}
