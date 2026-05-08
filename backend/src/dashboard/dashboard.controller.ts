import { BadRequestException, Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { LogsService } from '../logs/logs.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

type SnapshotRow = {
  hotScore: number;
  symbol: {
    symbol: string;
  };
};

type TradePnlRow = {
  symbol: string;
  pnl: number | null;
};

type SignalWithTradesRow = {
  strategy: string;
  trades: TradePnlRow[];
};

@Controller('/api')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scannerService: ScannerService,
    private readonly logsService: LogsService,
    private readonly marketRegimeService: MarketRegimeService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
  ) {}

  @Get('/status')
  async getStatus() {
    const settings = await this.prisma.botSettings.findFirst();
    const activeSignals = await this.prisma.signal.count({ where: { status: 'active' } });
    const openTrades = await this.prisma.trade.count({ where: { status: 'live_open' } });
    const executionMode = settings?.realTradingEnabled && settings?.mode === 'live'
      ? settings.requireDashboardConfirmation === false
        ? 'live_auto'
        : 'live_manual'
      : 'signal_only';
    return {
      botStatus: settings?.isPaused ? 'paused' : 'running',
      mode: settings?.mode ?? 'testnet',
      realTradingEnabled: settings?.realTradingEnabled ?? false,
      enableRealTrading: settings?.realTradingEnabled ?? false,
      requireDashboardConfirmation: settings?.requireDashboardConfirmation ?? true,
      allowAutoLiveExecution: settings?.requireDashboardConfirmation === false,
      executionMode,
      activeSignals,
      openTrades,
      lastScannerRun: (await this.prisma.botLog.findFirst({
        where: { source: 'scanner', message: 'Completed market scan' },
        orderBy: { createdAt: 'desc' },
      }))?.createdAt,
    };
  }

  @Get('/balance')
  async getBalance() {
    if (!this.binanceService.hasApiKeys()) {
      return { futures: null, funding: null, error: 'API keys not configured' };
    }
    const settings = await this.prisma.botSettings.findFirst();
    const mode = settings?.mode ?? 'testnet';
    try {
      const balances = mode === 'live'
        ? await this.binanceService.fetchLiveAccountBalance()
        : await this.binanceService.fetchAccountBalance();
      const funding = mode === 'live' ? await this.binanceService.fetchFundingBalance() : null;
      const usdt = balances.find((b) => b.asset === 'USDT');
      return {
        mode,
        futures: usdt ? Number(usdt.availableBalance) : 0,
        futuresTotal: usdt ? Number(usdt.balance) : 0,
        funding,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { futures: null, funding: null, error: message };
    }
  }

  @Get('/settings')
  async getSettings() {
    const settings = await this.prisma.botSettings.findFirst();
    if (settings) {
      return serializeSettings(settings);
    }

    const created = await this.prisma.botSettings.create({ data: {} });
    return serializeSettings(created);
  }

  @Patch('/settings')
  async patchSettings(@Body() body: UpdateSettingsDto, @Req() request: Request) {
    const existing = await this.getSettings();
    validateSettingsConsistency(body);
    await this.assertNoUnsafeLiveMutation(existing, body);
    const normalized = normalizeSettingsUpdate(body);
    const updated = await this.prisma.botSettings.update({
      where: { id: existing.id },
      data: normalized,
    });
    await this.logsService.audit('settings.updated', getActor(request), {
      before: existing,
      changes: normalized,
      afterId: updated.id,
    });
    return serializeSettings(updated);
  }

  @Post('/settings/apply-micro-account-preset')
  async applyMicroAccountPreset(@Req() request: Request) {
    const existing = await this.getSettings();
    const preset: UpdateSettingsDto = {
      mode: 'testnet',
      isPaused: true,
      enableRealTrading: false,
      allowAutoLiveExecution: false,
      defaultLeverage: 3,
      maxLeverage: 4,
      riskPerTradePercent: 0.5,
      maxDailyLossPercent: 2,
      maxOpenTrades: 1,
      maxConsecutiveLosses: 2,
      minPositionUsd: 2,
      maxPositionUsd: 5,
      scannerIntervalSeconds: 45,
      signalExpirationMinutes: 10,
      maxSymbolsPerScan: 25,
      minHotScoreForScan: 60,
      minConfidenceScore: 78,
      minRiskReward: 1.3,
      breakoutEnabled: true,
      breakoutMinVolumeRatio: 1.8,
      breakoutLookbackPeriod: 20,
      breakoutMaxSlPercent: 3,
      breakoutTp1Multiplier: 1.2,
      breakoutTp2Multiplier: 1.8,
      breakoutMinHotScore: 62,
      pullbackEnabled: true,
      pullbackRsiLongMin: 40,
      pullbackRsiLongMax: 55,
      pullbackRsiShortMin: 45,
      pullbackRsiShortMax: 60,
      pullbackAtrMultiplier: 1.2,
      pullbackMaxSlPercent: 3,
      pullbackMinHotScore: 50,
      reversionEnabled: false,
      reversionRsiOverbought: 78,
      reversionRsiOversold: 22,
      reversionVwapDeviationPct: 2.5,
      reversionVolumeDeclineRatio: 0.5,
      reversionMaxSlPercent: 3,
    };

    validateSettingsConsistency(preset);
    await this.assertNoUnsafeLiveMutation(existing, preset);

    const normalized = normalizeSettingsUpdate(preset);
    const updated = await this.prisma.botSettings.update({
      where: { id: existing.id },
      data: normalized,
    });

    await this.logsService.audit('settings.apply_micro_account_preset', getActor(request), {
      before: existing,
      afterId: updated.id,
      capitalUsd: 43,
      preset: normalized,
    });

    return {
      ...serializeSettings(updated),
      message: 'Micro-account preset applied for a $43 balance. Bot paused, testnet/manual mode enforced.',
    };
  }

  @Post('/bot/pause')
  async pauseBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const updated = await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } });
    await this.logsService.audit('bot.paused', getActor(request), {});
    return updated;
  }

  @Post('/bot/stop')
  async stopBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const updated = await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } });
    await this.logsService.audit('bot.stopped', getActor(request), {});
    return {
      ...updated,
      message: 'Bot stopped.',
    };
  }

  @Post('/bot/resume')
  async resumeBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const updated = await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: false } });
    await this.logsService.audit('bot.resumed', getActor(request), {});
    return updated;
  }

  @Post('/bot/start')
  async startBot(@Req() request: Request) {
    const actor = getActor(request);
    const settings = await this.getSettings();

    await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: false } });
    const sync = await this.scannerService.syncSymbols();
    const scan = await this.scannerService.runScan();

    await this.logsService.audit('bot.started', actor, {
      syncImported: sync.imported,
      scanProcessed: scan.processed,
      scanSignalsCreated: scan.signalsCreated,
      scanSkipped: scan.skipped ?? false,
    });

    return {
      message: `Bot started. Synced ${sync.imported} symbols and processed ${scan.processed} symbols.`,
      sync,
      scan,
    };
  }

  @Post('/bot/emergency-stop')
  async emergencyStop(@Req() request: Request) {
    const actor = getActor(request);
    const settings = await this.getSettings();
    const [updated] = await Promise.all([
      this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } }),
      this.prisma.signal.updateMany({
        where: { status: { in: ['active', 'pending', 'approved'] } },
        data: { status: 'cancelled' },
      }),
    ]);

    await this.logsService.audit('bot.emergency_stop', actor, {});
    await this.logsService.risk('emergency_stop', 'Emergency stop activated; bot paused and pending signals cancelled', 'critical', {
      actor,
    });
    await this.telegramService.sendMessage(
      `<b>EMERGENCY STOP</b>\nActor: ${actor}\nBot paused and pending signals cancelled.`,
    );
    return updated;
  }

  @Post('/bot/sync-symbols')
  syncSymbols() {
    return this.scannerService.syncSymbols();
  }

  @Post('/bot/run-scanner')
  runScanner() {
    return this.scannerService.runScan();
  }

  @Get('/symbols')
  listSymbols() {
    return this.prisma.symbol.findMany({ orderBy: { symbol: 'asc' }, take: 500 });
  }

  @Get('/hot-coins')
  async hotCoins() {
    const snapshots: SnapshotRow[] = await this.prisma.marketSnapshot.findMany({
      include: { symbol: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 2000,
    });
    const latestPerSymbol = new Map<string, SnapshotRow>();
    for (const snapshot of snapshots) {
      if (!latestPerSymbol.has(snapshot.symbol.symbol)) {
        latestPerSymbol.set(snapshot.symbol.symbol, snapshot);
      }
      if (latestPerSymbol.size >= 100) break;
    }
    return [...latestPerSymbol.values()].sort((a, b) => b.hotScore - a.hotScore);
  }

  @Get('/market-regime')
  marketRegime() {
    return this.marketRegimeService.getRegime();
  }

  @Get('/performance')
  async performance() {
    const trades: TradePnlRow[] = await this.prisma.trade.findMany({
      where: { pnl: { not: null } },
      select: { symbol: true, pnl: true },
    });
    const totalTrades = trades.length;
    const wins = trades.filter((trade) => (trade.pnl ?? 0) > 0);
    const losses = trades.filter((trade) => (trade.pnl ?? 0) <= 0);
    const grossWin = wins.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
    const grossLoss = losses.reduce((sum, trade) => sum + Math.abs(trade.pnl ?? 0), 0);

    return {
      totalTrades,
      winRate: totalTrades === 0 ? 0 : (wins.length / totalTrades) * 100,
      averageWin: wins.length === 0 ? 0 : grossWin / wins.length,
      averageLoss: losses.length === 0 ? 0 : grossLoss / losses.length,
      profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
      totalPnl: trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0),
    };
  }

  @Get('/performance/daily')
  async performanceDaily() {
    return this.prisma.trade.findMany({
      where: { pnl: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, pnl: true, symbol: true },
    });
  }

  @Get('/performance/strategies')
  async performanceStrategies() {
    const signals: SignalWithTradesRow[] = await this.prisma.signal.findMany({
      select: {
        strategy: true,
        trades: {
          select: { symbol: true, pnl: true },
        },
      },
    });
    return signals.reduce<Record<string, { count: number; pnl: number }>>((accumulator, signal) => {
      const pnl = signal.trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
      accumulator[signal.strategy] = accumulator[signal.strategy] ?? { count: 0, pnl: 0 };
      accumulator[signal.strategy].count += 1;
      accumulator[signal.strategy].pnl += pnl;
      return accumulator;
    }, {});
  }

  @Get('/performance/symbols')
  async performanceSymbols() {
    const trades: TradePnlRow[] = await this.prisma.trade.findMany({
      select: { symbol: true, pnl: true },
    });
    return trades.reduce<Record<string, { count: number; pnl: number }>>((accumulator, trade) => {
      accumulator[trade.symbol] = accumulator[trade.symbol] ?? { count: 0, pnl: 0 };
      accumulator[trade.symbol].count += 1;
      accumulator[trade.symbol].pnl += trade.pnl ?? 0;
      return accumulator;
    }, {});
  }

  @Get('/logs')
  logs() {
    return this.logsService.listLogs();
  }

  @Get('/risk-events')
  riskEvents() {
    return this.logsService.listRiskEvents();
  }

  private async assertNoUnsafeLiveMutation(existing: Record<string, unknown>, body: UpdateSettingsDto): Promise<void> {
    const openLiveTrades = await this.prisma.trade.count({ where: { status: 'live_open' } });
    if (openLiveTrades === 0) return;

    const blockedKeys: Array<keyof UpdateSettingsDto> = [
      'mode',
      'realTradingEnabled',
      'enableRealTrading',
      'defaultLeverage',
      'maxLeverage',
      'riskPerTradePercent',
      'maxDailyLossPercent',
      'maxOpenTrades',
      'maxConsecutiveLosses',
      'minPositionUsd',
      'maxPositionUsd',
      'requireDashboardConfirmation',
      'allowAutoLiveExecution',
    ];

    const attempted = blockedKeys.filter((key) => body[key] !== undefined && body[key] !== existing[key]);
    if (attempted.length > 0) {
      throw new BadRequestException(
        `Cannot modify critical live-trading settings while live trades are open: ${attempted.join(', ')}`,
      );
    }
  }
}

function validateSettingsConsistency(body: UpdateSettingsDto): void {
  if (
    body.maxPositionUsd !== undefined &&
    body.minPositionUsd !== undefined &&
    body.maxPositionUsd < body.minPositionUsd
  ) {
    throw new BadRequestException('Max position size must be greater than or equal to min position size');
  }

  if (
    body.maxLeverage !== undefined &&
    body.defaultLeverage !== undefined &&
    body.maxLeverage < body.defaultLeverage
  ) {
    throw new BadRequestException('Max leverage must be greater than or equal to default leverage');
  }

  if (
    body.pullbackRsiLongMin !== undefined &&
    body.pullbackRsiLongMax !== undefined &&
    body.pullbackRsiLongMin > body.pullbackRsiLongMax
  ) {
    throw new BadRequestException('Pullback long RSI min must be less than or equal to max');
  }

  if (
    body.pullbackRsiShortMin !== undefined &&
    body.pullbackRsiShortMax !== undefined &&
    body.pullbackRsiShortMin > body.pullbackRsiShortMax
  ) {
    throw new BadRequestException('Pullback short RSI min must be less than or equal to max');
  }
}

function getActor(request: Request): string {
  return ((request as Request & { authAddress?: string }).authAddress ?? 'system').toLowerCase();
}

function normalizeSettingsUpdate(body: UpdateSettingsDto): UpdateSettingsDto {
  const normalized: UpdateSettingsDto = { ...body };

  if (body.enableRealTrading !== undefined) {
    normalized.realTradingEnabled = body.enableRealTrading;
    delete normalized.enableRealTrading;
  }

  if (body.allowAutoLiveExecution !== undefined) {
    normalized.requireDashboardConfirmation = !body.allowAutoLiveExecution;
    delete normalized.allowAutoLiveExecution;
  }

  return normalized;
}

function serializeSettings<T extends { realTradingEnabled: boolean; requireDashboardConfirmation: boolean }>(settings: T) {
  return {
    ...settings,
    enableRealTrading: settings.realTradingEnabled,
    allowAutoLiveExecution: settings.requireDashboardConfirmation === false,
  };
}
