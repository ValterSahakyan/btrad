import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { Direction, RiskValidationResult } from '../common/types/trading.types';
import { PrismaService } from '../prisma/prisma.service';
import { PositionSizeService } from './position-size.service';

type ClosedTradeRow = {
  pnl: number | null;
};

@Injectable()
export class RiskEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly positionSizeService: PositionSizeService,
  ) {}

  async validateSignal(input: {
    symbol: string;
    direction: Direction;
    entryPrice: number;
    stopLoss: number;
    riskReward: number;
    spread: number;
    confidenceScore: number;
    expiresAt: Date;
    marketRegime: string;
  }): Promise<RiskValidationResult> {
    const settings = await this.prisma.botSettings.findFirst();
    const openTrades = await this.prisma.trade.count({
      where: { status: { in: ['paper_open', 'live_open'] } },
    });
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const closedTrades: ClosedTradeRow[] = await this.prisma.trade.findMany({
      where: { closedAt: { gte: todayStart }, pnl: { not: null } },
      orderBy: { closedAt: 'desc' },
      select: { pnl: true },
    });
    const balanceRows = await this.binanceService.fetchAccountBalance().catch(() => []);
    const usdtBalance = Number(balanceRows.find((row) => row.asset === 'USDT')?.availableBalance ?? 1000);

    const riskPerTradePercent = settings?.riskPerTradePercent ?? 1;
    const maxOpenTrades = settings?.maxOpenTrades ?? 2;
    const maxDailyLossPercent = settings?.maxDailyLossPercent ?? 3;
    const maxConsecutiveLosses = settings?.maxConsecutiveLosses ?? 3;
    const maxLeverage = settings?.maxLeverage ?? 5;
    const minRiskReward = settings?.minRiskReward ?? 1.5;
    const defaultLeverage = settings?.defaultLeverage ?? 3;

    const dailyLoss = closedTrades
      .filter((trade) => (trade.pnl ?? 0) < 0)
      .reduce((sum, trade) => sum + Math.abs(trade.pnl ?? 0), 0);
    const dailyLossPercent = usdtBalance === 0 ? 0 : (dailyLoss / usdtBalance) * 100;
    const consecutiveLosses = closedTrades.findIndex((trade) => (trade.pnl ?? 0) > 0);
    const effectiveConsecutiveLosses = consecutiveLosses === -1 ? closedTrades.length : consecutiveLosses;

    const positionSize = this.positionSizeService.calculate(
      usdtBalance,
      riskPerTradePercent,
      input.entryPrice,
      input.stopLoss,
    );

    const messages: string[] = [];
    if (input.expiresAt.getTime() < Date.now()) messages.push('Signal expired');
    if (openTrades >= maxOpenTrades) messages.push('Max open trades reached');
    if (dailyLossPercent >= maxDailyLossPercent) messages.push('Daily loss limit reached');
    if (effectiveConsecutiveLosses >= maxConsecutiveLosses) messages.push('Max consecutive losses reached');
    if (input.riskReward < minRiskReward) messages.push('Risk reward below minimum');
    if (input.spread > 0.4) messages.push('Spread too high');
    if (input.marketRegime === 'no_trade') messages.push('Market regime blocked');
    if (positionSize.quantity <= 0) messages.push('Invalid position size');

    const riskScore =
      messages.length === 0
        ? 90
        : Math.max(15, 90 - messages.length * 20 - (input.confidenceScore < 80 ? 10 : 0));

    return {
      allowed: messages.length === 0,
      riskAmount: Number(positionSize.riskAmount.toFixed(2)),
      positionSize: Number(positionSize.quantity.toFixed(6)),
      leverage: Math.min(maxLeverage, defaultLeverage),
      riskScore,
      messages,
    };
  }
}
