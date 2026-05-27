import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { Direction, RiskValidationResult } from '../common/types/trading.types';
import { PrismaService } from '../prisma/prisma.service';
import { applyWeekendOverrides } from '../settings/weekend-settings';
import { PositionSizeService } from './position-size.service';

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
    const balanceRows = await (settings?.mode === 'live'
      ? this.binanceService.fetchLiveAccountBalance()
      : this.binanceService.fetchAccountBalance()).catch((err) => {
      if (settings?.mode === 'live') throw err;
      return [];
    });
    const usdtRow = balanceRows.find((row) => row.asset === 'USDT');
    const availableBalance = Number(usdtRow?.availableBalance ?? 0);
    // In testnet/paper mode use a $10k paper balance when real testnet funds are zero
    const usdtBalance =
      availableBalance > 0 ? availableBalance : (settings?.mode === 'live' ? 0 : 10_000);

    const riskPerTradePercent = settings?.riskPerTradePercent ?? 1;
    const maxLeverage = settings?.maxLeverage ?? 5;
    const minRiskReward = settings?.minRiskReward ?? 1.5;
    const defaultLeverage = settings?.defaultLeverage ?? 3;
    const minPositionUsd = settings?.minPositionUsd ?? 5;
    const maxPositionUsd = settings?.maxPositionUsd ?? 20;
    const maxOpenTrades = (settings as any)?.maxOpenTrades ?? 5;
    const maxDailyLossPercent = (settings as any)?.maxDailyLossPercent ?? 3;

    const positionSize = this.positionSizeService.calculate(
      usdtBalance,
      riskPerTradePercent,
      input.entryPrice,
      input.stopLoss,
      input.stepSize,
      maxPositionUsd,
      minPositionUsd,
      input.confidenceScore,
    );

    // Use the higher of the settings floor and the exchange's own minimum notional
    const effectiveMinNotional = Math.max(minPositionUsd, input.minNotional ?? 0);

    const messages: string[] = [];
    if (input.expiresAt.getTime() < Date.now()) messages.push('Signal expired');
    const maxSpreadPercent = (settings as any)?.maxSpreadPercent ?? 0.4;
    if (input.riskReward < minRiskReward) messages.push('Risk reward below minimum');
    if (input.spread > maxSpreadPercent) messages.push('Spread too high');
    if (input.marketRegime === 'no_trade') messages.push('Market regime blocked');
    if (positionSize.quantity <= 0) messages.push('Invalid position size');
    const notionalUsd = positionSize.quantity * input.entryPrice;
    if (positionSize.quantity > 0 && notionalUsd < effectiveMinNotional) {
      const hint = maxPositionUsd < effectiveMinNotional
        ? ` (raise maxPositionUsd above $${effectiveMinNotional.toFixed(0)} in Settings)`
        : '';
      messages.push(`Position notional $${notionalUsd.toFixed(2)} below minimum $${effectiveMinNotional.toFixed(2)}${hint}`);
    }

    // Max open trades hard cap (Schwager: every great trader has defined position limits)
    const openTradeCount = await this.prisma.trade.count({ where: { status: 'live_open' } });
    if (openTradeCount >= maxOpenTrades) {
      messages.push(`Max open trades reached (${openTradeCount}/${maxOpenTrades})`);
    }

    // Daily loss circuit breaker (Taleb: protect against ruin; never let a bad day spiral)
    if (maxDailyLossPercent > 0 && usdtBalance > 0) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayTrades = await this.prisma.trade.findMany({
        where: { closedAt: { gte: todayStart }, pnl: { not: null } },
        select: { pnl: true },
      });
      const dailyPnl = todayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const dailyLossPct = (Math.abs(Math.min(0, dailyPnl)) / usdtBalance) * 100;
      if (dailyLossPct >= maxDailyLossPercent) {
        messages.push(`Daily loss limit hit: -${dailyLossPct.toFixed(2)}% of ${maxDailyLossPercent}% allowed`);
      }
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
