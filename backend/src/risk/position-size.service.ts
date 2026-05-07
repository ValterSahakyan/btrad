import { Injectable } from '@nestjs/common';

@Injectable()
export class PositionSizeService {
  calculate(balance: number, riskPerTradePercent: number, entryPrice: number, stopLoss: number): {
    riskAmount: number;
    stopDistance: number;
    quantity: number;
  } {
    const riskAmount = (balance * riskPerTradePercent) / 100;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const quantity = stopDistance === 0 ? 0 : riskAmount / stopDistance;

    return { riskAmount, stopDistance, quantity };
  }
}
