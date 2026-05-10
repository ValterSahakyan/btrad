import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { Direction, RiskValidationResult } from '../common/types/trading.types';
import { PrismaService } from '../prisma/prisma.service';
import { applyWeekendOverrides } from '../settings/weekend-settings';
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
    strategy: string;
    stepSize?: number;
    minNotional?: number;
  }): Promise<RiskValidationResult> {
    const settings = applyWeekendOverrides(await this.prisma.botSettings.findFirst());
    const openTradeRows = await this.prisma.trade.findMany({
      where: { status: 'live_open' },
      select: {
        direction: true,
        signal: {
          select: {
            strategy: true,
          },
        },
      },
    });
    const openTrades = openTradeRows.length;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const closedTrades: ClosedTradeRow[] = await this.prisma.trade.findMany({
      where: { closedAt: { gte: todayStart }, pnl: { not: null } },
      orderBy: { closedAt: 'desc' },
      select: { pnl: true },
    });
    const balanceRows = await (settings?.mode === 'live'
      ? this.binanceService.fetchLiveAccountBalance()
      : this.binanceService.fetchAccountBalance()).catch((err) => {
      if (settings?.mode === 'live') throw err;
      return [];
    });
    const usdtRow = balanceRows.find((row) => row.asset === 'USDT');
    const availableBalance = Number(usdtRow?.availableBalance ?? 0);
    const totalBalance = Number(usdtRow?.balance ?? 0);
    // Use wallet balance for daily loss limits so open margin usage does not
    // artificially shrink the denominator and block new entries too early.
    // Keep available balance for actual position sizing.
    const riskReferenceBalance =
      totalBalance > 0 ? totalBalance : (settings?.mode === 'live' ? 0 : 10_000);
    // In testnet/paper mode use a $10k paper balance when real testnet funds are zero
    const usdtBalance =
      availableBalance > 0 ? availableBalance : (settings?.mode === 'live' ? 0 : 10_000);

    const riskPerTradePercent = settings?.riskPerTradePercent ?? 1;
    const maxOpenTrades = settings?.maxOpenTrades ?? 2;
    const maxDailyLossPercent = settings?.maxDailyLossPercent ?? 3;
    const maxConsecutiveLosses = settings?.maxConsecutiveLosses ?? 3;
    const maxLeverage = settings?.maxLeverage ?? 5;
    const minRiskReward = settings?.minRiskReward ?? 1.5;
    const defaultLeverage = settings?.defaultLeverage ?? 3;
    const minPositionUsd = settings?.minPositionUsd ?? 5;

    const dailyLoss = closedTrades
      .filter((trade) => (trade.pnl ?? 0) < 0)
      .reduce((sum, trade) => sum + Math.abs(trade.pnl ?? 0), 0);
    const dailyLossPercent = riskReferenceBalance === 0 ? 0 : (dailyLoss / riskReferenceBalance) * 100;
    const consecutiveLosses = closedTrades.findIndex((trade) => (trade.pnl ?? 0) > 0);
    const effectiveConsecutiveLosses = consecutiveLosses === -1 ? closedTrades.length : consecutiveLosses;

    const maxPositionUsd = settings?.maxPositionUsd ?? 20;
    const positionSize = this.positionSizeService.calculate(
      usdtBalance,
      riskPerTradePercent,
      input.entryPrice,
      input.stopLoss,
      input.stepSize,
      maxPositionUsd,
    );

    // Use the higher of the settings floor and the exchange's own minimum notional
    const effectiveMinNotional = Math.max(minPositionUsd, input.minNotional ?? 0);

    const messages: string[] = [];
    if (input.expiresAt.getTime() < Date.now()) messages.push('Signal expired');
    if (openTrades >= maxOpenTrades) messages.push('Max open trades reached');
    if (dailyLossPercent >= maxDailyLossPercent) messages.push('Daily loss limit reached');
    if (effectiveConsecutiveLosses >= maxConsecutiveLosses) messages.push('Max consecutive losses reached');
    if (input.riskReward < minRiskReward) messages.push('Risk reward below minimum');
    if (input.spread > 0.4) messages.push('Spread too high');
    if (input.marketRegime === 'no_trade') messages.push('Market regime blocked');
    if (positionSize.quantity <= 0) messages.push('Invalid position size');
    const notionalUsd = positionSize.quantity * input.entryPrice;
    if (positionSize.quantity > 0 && notionalUsd < effectiveMinNotional) {
      const hint = maxPositionUsd < effectiveMinNotional
        ? ` (raise maxPositionUsd above $${effectiveMinNotional.toFixed(0)} in Settings)`
        : '';
      messages.push(`Position notional $${notionalUsd.toFixed(2)} below minimum $${effectiveMinNotional.toFixed(2)}${hint}`);
    }

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
