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
    const longTradeCount = openTradeRows.filter((t) => t.direction === 'LONG').length;
    const shortTradeCount = openTradeRows.filter((t) => t.direction === 'SHORT').length;
    const strategyTradeCount = openTradeRows.filter((t) => t.signal?.strategy === input.strategy).length;
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
    const maxOpenTrades = settings?.maxOpenTrades ?? 2;
    const maxLeverage = settings?.maxLeverage ?? 5;
    const minRiskReward = settings?.minRiskReward ?? 1.5;
    const defaultLeverage = settings?.defaultLeverage ?? 3;
    const minPositionUsd = settings?.minPositionUsd ?? 5;
    const maxLongOpenTrades = settings?.maxLongOpenTrades ?? 0;
    const maxShortOpenTrades = settings?.maxShortOpenTrades ?? 0;
    const strategyMaxOpenTrades = resolveStrategyMaxOpenTrades(settings, input.strategy);

    const maxPositionUsd = settings?.maxPositionUsd ?? 20;
    const positionSize = this.positionSizeService.calculate(
      usdtBalance,
      riskPerTradePercent,
      input.entryPrice,
      input.stopLoss,
      input.stepSize,
      maxPositionUsd,
      minPositionUsd,
    );

    // Use the higher of the settings floor and the exchange's own minimum notional
    const effectiveMinNotional = Math.max(minPositionUsd, input.minNotional ?? 0);

    const messages: string[] = [];
    if (input.expiresAt.getTime() < Date.now()) messages.push('Signal expired');
    if (openTrades >= maxOpenTrades) messages.push('Max open trades reached');
    if (maxLongOpenTrades > 0 && input.direction === 'LONG' && longTradeCount >= maxLongOpenTrades) {
      messages.push('Max long open trades reached');
    }
    if (maxShortOpenTrades > 0 && input.direction === 'SHORT' && shortTradeCount >= maxShortOpenTrades) {
      messages.push('Max short open trades reached');
    }
    if (strategyMaxOpenTrades > 0 && strategyTradeCount >= strategyMaxOpenTrades) {
      messages.push(`Max open trades reached for strategy ${input.strategy}`);
    }
    const maxSpreadPercent = settings?.maxSpreadPercent ?? 0.4;
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

function resolveStrategyMaxOpenTrades(settings: unknown, strategy: string): number {
  const s = settings as any;
  switch (strategy) {
    case 'breakout_volume': return s?.breakoutMaxOpenTrades ?? 0;
    case 'pullback_continuation': return s?.pullbackMaxOpenTrades ?? 0;
    case 'mean_reversion': return s?.reversionMaxOpenTrades ?? 0;
    case 'trend_reclaim': return s?.trendReclaimMaxOpenTrades ?? 0;
    case 'range_bounce': return s?.rangeBounceMaxOpenTrades ?? 0;
    default: return 0;
  }
}
