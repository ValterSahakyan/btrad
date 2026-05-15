import { BadRequestException, Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { LogsService } from '../logs/logs.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { BinanceService } from '../binance/binance.service';
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

type TradePerformanceRow = {
  symbol: string;
  pnl: number | null;
  signal: {
    strategy: string;
  } | null;
};

type PerformanceBucket = {
  count: number;
  pnl: number;
  winRate: number;
};

type TradeAnalyticsRow = {
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  openedAt: Date | null;
  closedAt: Date | null;
  signal: {
    strategy: string;
    entryPrice: number;
    createdAt: Date;
    reasonJson: unknown;
  } | null;
};

@Controller('/api')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scannerService: ScannerService,
    private readonly logsService: LogsService,
    private readonly marketRegimeService: MarketRegimeService,
    private readonly binanceService: BinanceService,
  ) {}

  @Get('/status')
  async getStatus() {
    const settings = await this.prisma.botSettings.findFirst();
    const queuedSignals = await this.prisma.signal.count({
      where: { status: { in: ['active', 'pending', 'approved'] } },
    });
    const executedSignals = await this.prisma.signal.count({
      where: { status: 'live_executed' },
    });
    const dbOpenTrades = await this.prisma.trade.count({
      where: { status: 'live_open' },
    });
    let exchangeOpenTrades = dbOpenTrades;
    if (settings?.mode === 'live' && this.binanceService.hasApiKeys()) {
      try {
        const positions = await this.binanceService.fetchOpenPositions();
        exchangeOpenTrades = positions.length;
      } catch {
        exchangeOpenTrades = dbOpenTrades;
      }
    }
    const openTrades = Math.max(dbOpenTrades, exchangeOpenTrades);
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
      activeSignals: queuedSignals,
      queuedSignals,
      executedSignals,
      openTrades,
      dbOpenTrades,
      exchangeOpenTrades,
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
      enableRealTrading: false,
      allowAutoLiveExecution: false,
      defaultLeverage: 3,
      maxLeverage: 4,
      riskPerTradePercent: 0.5,
      maxDailyLossPercent: 2,
      maxOpenTrades: 1,
      maxHoldingHours: 8,
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
      trendReclaimEnabled: true,
      trendReclaimEmaBufferAtr: 0.3,
      trendReclaimVolumeRatio: 1.2,
      trendReclaimMaxSlPercent: 3,
      trendReclaimTp1Multiplier: 1.3,
      trendReclaimTp2Multiplier: 2.0,
      trendReclaimMinHotScore: 58,
      rangeBounceEnabled: true,
      rangeBounceLookbackPeriod: 24,
      rangeBounceProximityAtr: 0.7,
      rangeBounceRsiLongMax: 43,
      rangeBounceRsiShortMin: 57,
      rangeBounceMaxSlPercent: 2.8,
      rangeBounceTp1Multiplier: 1.2,
      rangeBounceTp2Multiplier: 1.8,
      rangeBounceMinHotScore: 45,
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
      message: 'Micro-account preset applied for a $43 balance. Testnet/manual mode enforced.',
    };
  }

  @Post('/bot/pause')
  async pauseBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const updated = await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } });
    await this.logsService.audit('bot.paused', getActor(request), {});
    return {
      ...serializeSettings(updated),
      message: 'Bot paused. No new scans or trades will be started.',
    };
  }

  @Post('/bot/stop')
  async stopBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const [updated, cancelled] = await Promise.all([
      this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } }),
      // Cancel all queued AND claimed signals so nothing executes on resume.
      // 'approved' signals are mid-claim but approveLive re-checks isPaused before
      // touching Binance and will cancel them too — including them here handles the
      // race where approveLive hasn't reached that check yet.
      this.prisma.signal.updateMany({
        where: { status: { in: ['active', 'pending', 'approved'] } },
        data: { status: 'cancelled' },
      }),
    ]);
    await this.logsService.audit('bot.stopped', getActor(request), { signalsCancelled: cancelled.count });
    return {
      ...serializeSettings(updated),
      message: `Bot stopped. ${cancelled.count} pending signal${cancelled.count !== 1 ? 's' : ''} cancelled. Existing live trades will still be monitored.`,
    };
  }

  @Post('/bot/resume')
  async resumeBot(@Req() request: Request) {
    const settings = await this.getSettings();
    const updated = await this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: false } });
    await this.logsService.audit('bot.resumed', getActor(request), {});
    return {
      ...serializeSettings(updated),
      message: 'Bot resumed.',
    };
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
    await this.logsService.risk('emergency_stop', 'Emergency stop activated; pending signals cancelled', 'critical', {
      actor,
    });
    return {
      ...serializeSettings(updated),
      message: 'Emergency stop activated. Bot stopped and pending signals cancelled.',
    };
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
    const trades: TradePerformanceRow[] = await this.prisma.trade.findMany({
      where: { pnl: { not: null } },
      select: {
        symbol: true,
        pnl: true,
        signal: {
          select: {
            strategy: true,
          },
        },
      },
    });
    return aggregatePerformance(
      trades,
      (trade) => trade.signal?.strategy ?? 'unknown',
    );
  }

  @Get('/performance/symbols')
  async performanceSymbols() {
    const trades: TradePnlRow[] = await this.prisma.trade.findMany({
      where: { pnl: { not: null } },
      select: { symbol: true, pnl: true },
    });
    return aggregatePerformance(trades, (trade) => trade.symbol);
  }

  @Get('/performance/analytics')
  async performanceAnalytics() {
    const trades: TradeAnalyticsRow[] = await this.prisma.trade.findMany({
      where: {
        pnl: { not: null },
        signal: { isNot: null },
      },
      orderBy: { closedAt: 'asc' },
      select: {
        symbol: true,
        direction: true,
        entryPrice: true,
        exitPrice: true,
        quantity: true,
        pnl: true,
        openedAt: true,
        closedAt: true,
        signal: {
          select: {
            strategy: true,
            entryPrice: true,
            createdAt: true,
            reasonJson: true,
          },
        },
      },
    });

    return buildAnalyticsReport(trades);
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
    ];

    const attempted = blockedKeys.filter((key) => body[key] !== undefined && body[key] !== existing[key]);
    if (attempted.length > 0) {
      throw new BadRequestException(
        `Cannot modify critical live-trading settings while live trades are open: ${attempted.join(', ')}`,
      );
    }
  }
}

function aggregatePerformance<T extends { pnl: number | null }>(
  trades: T[],
  getKey: (trade: T) => string,
): Record<string, PerformanceBucket> {
  const buckets = new Map<string, { count: number; pnl: number; wins: number }>();

  for (const trade of trades) {
    const key = getKey(trade);
    const bucket = buckets.get(key) ?? { count: 0, pnl: 0, wins: 0 };
    const pnl = trade.pnl ?? 0;

    bucket.count += 1;
    bucket.pnl += pnl;
    if (pnl > 0) bucket.wins += 1;

    buckets.set(key, bucket);
  }

  return Object.fromEntries(
    [...buckets.entries()].map(([key, bucket]) => [
      key,
      {
        count: bucket.count,
        pnl: bucket.pnl,
        winRate: bucket.count === 0 ? 0 : (bucket.wins / bucket.count) * 100,
      },
    ]),
  );
}

function buildAnalyticsReport(trades: TradeAnalyticsRow[]) {
  const feeBps = readBpsEnv('ESTIMATED_TAKER_FEE_BPS', 4);
  const slippageBps = readBpsEnv('ESTIMATED_SLIPPAGE_BPS', 3);

  const rows = trades
    .filter((trade): trade is TradeAnalyticsRow & { pnl: number; signal: NonNullable<TradeAnalyticsRow['signal']> } =>
      trade.pnl !== null && trade.signal !== null,
    )
    .map((trade) => toAnalyticsRow(trade, feeBps, slippageBps));

  return {
    assumptions: {
      estimatedTakerFeeBps: feeBps,
      estimatedSlippageBps: slippageBps,
      totalClosedTrades: rows.length,
    },
    overall: summarizeAnalytics(rows),
    byStrategy: summarizeBy(rows, (row) => row.strategy),
    byVersion: summarizeBy(rows, (row) => row.versionTag),
    bySide: summarizeBy(rows, (row) => row.direction),
    bySession: summarizeBy(rows, (row) => row.isWeekend ? 'weekend' : 'weekday'),
  };
}

function summarizeBy<T extends AnalyticsTradeRow>(rows: T[], getKey: (row: T) => string) {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return Object.fromEntries(
    [...buckets.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, bucket]) => [key, summarizeAnalytics(bucket)]),
  );
}

type AnalyticsTradeRow = {
  symbol: string;
  strategy: string;
  direction: string;
  versionTag: string;
  isWeekend: boolean;
  grossPnl: number;
  netPnl: number;
  estimatedCost: number;
  entrySlippageBps: number;
  fillDelaySec: number;
};

function summarizeAnalytics(rows: AnalyticsTradeRow[]) {
  const count = rows.length;
  const winsGross = rows.filter((row) => row.grossPnl > 0);
  const lossesGross = rows.filter((row) => row.grossPnl < 0);
  const winsNet = rows.filter((row) => row.netPnl > 0);
  const lossesNet = rows.filter((row) => row.netPnl < 0);
  const grossPnl = rows.reduce((sum, row) => sum + row.grossPnl, 0);
  const netPnl = rows.reduce((sum, row) => sum + row.netPnl, 0);
  const grossWins = winsGross.reduce((sum, row) => sum + row.grossPnl, 0);
  const grossLosses = lossesGross.reduce((sum, row) => sum + Math.abs(row.grossPnl), 0);
  const netWins = winsNet.reduce((sum, row) => sum + row.netPnl, 0);
  const netLosses = lossesNet.reduce((sum, row) => sum + Math.abs(row.netPnl), 0);
  const estimatedCost = rows.reduce((sum, row) => sum + row.estimatedCost, 0);

  return {
    trades: count,
    grossPnl: round4(grossPnl),
    netPnl: round4(netPnl),
    grossExpectancy: count === 0 ? 0 : round4(grossPnl / count),
    netExpectancy: count === 0 ? 0 : round4(netPnl / count),
    grossWinRate: count === 0 ? 0 : round2((winsGross.length / count) * 100),
    netWinRate: count === 0 ? 0 : round2((winsNet.length / count) * 100),
    grossProfitFactor: grossLosses === 0 ? round4(grossWins) : round4(grossWins / grossLosses),
    netProfitFactor: netLosses === 0 ? round4(netWins) : round4(netWins / netLosses),
    avgEstimatedCost: count === 0 ? 0 : round4(estimatedCost / count),
    totalEstimatedCost: round4(estimatedCost),
    avgEntrySlippageBps: count === 0 ? 0 : round2(rows.reduce((sum, row) => sum + row.entrySlippageBps, 0) / count),
    avgFillDelaySec: count === 0 ? 0 : round2(rows.reduce((sum, row) => sum + row.fillDelaySec, 0) / count),
  };
}

function toAnalyticsRow(trade: TradeAnalyticsRow & { pnl: number; signal: NonNullable<TradeAnalyticsRow['signal']> }, feeBps: number, slippageBps: number): AnalyticsTradeRow {
  const entryNotional = Math.abs(trade.entryPrice * trade.quantity);
  const exitNotional = Math.abs((trade.exitPrice ?? trade.entryPrice) * trade.quantity);
  const estimatedCost = ((entryNotional + exitNotional) * (feeBps + slippageBps)) / 10_000;
  const signalEntry = trade.signal.entryPrice || trade.entryPrice;
  const entrySlippageBps = signalEntry === 0 ? 0 : Math.abs(((trade.entryPrice - signalEntry) / signalEntry) * 10_000);
  const fillDelaySec =
    trade.openedAt && trade.signal.createdAt
      ? Math.max(0, (trade.openedAt.getTime() - trade.signal.createdAt.getTime()) / 1000)
      : 0;
  const closedAt = trade.closedAt ?? trade.openedAt ?? trade.signal.createdAt;
  const versionTag = readVersionTag(trade.signal.reasonJson);

  return {
    symbol: trade.symbol,
    strategy: trade.signal.strategy,
    direction: trade.direction,
    versionTag,
    isWeekend: isWeekendUtcDate(closedAt),
    grossPnl: trade.pnl,
    netPnl: trade.pnl - estimatedCost,
    estimatedCost,
    entrySlippageBps,
    fillDelaySec,
  };
}

function readVersionTag(value: unknown): string {
  const meta = (value as { meta?: { botVersionTag?: string } } | null)?.meta;
  const tag = meta?.botVersionTag?.trim();
  return tag && tag.length > 0 ? tag : 'unknown';
}

function isWeekendUtcDate(value: Date): boolean {
  const day = value.getUTCDay();
  return day === 0 || day === 6;
}

function readBpsEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
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

  if (body.fixedRoeTpPercent !== undefined && body.fixedRoeTpPercent <= 0) {
    throw new BadRequestException('Fixed ROE Target Profit must be greater than 0');
  }

  if (body.fixedRoeSlPercent !== undefined && body.fixedRoeSlPercent <= 0) {
    throw new BadRequestException('Fixed ROE Stop Loss must be greater than 0');
  }
}

function getActor(request: Request): string {
  return ((request as Request & { authAddress?: string }).authAddress ?? 'system').toLowerCase();
}

function normalizeSettingsUpdate(body: UpdateSettingsDto): UpdateSettingsDto {
  const normalized: UpdateSettingsDto = { ...body };
  delete (normalized as UpdateSettingsDto & { isPaused?: boolean }).isPaused;
  delete (normalized as UpdateSettingsDto & { weekendModeEnabled?: boolean }).weekendModeEnabled;
  delete (normalized as UpdateSettingsDto & { weekendMaxOpenTrades?: number }).weekendMaxOpenTrades;
  delete (normalized as UpdateSettingsDto & { weekendMinConfidenceScore?: number }).weekendMinConfidenceScore;
  delete (normalized as UpdateSettingsDto & { weekendMinHotScoreForScan?: number }).weekendMinHotScoreForScan;
  delete (normalized as UpdateSettingsDto & { weekendRiskPerTradePercent?: number }).weekendRiskPerTradePercent;
  delete (normalized as UpdateSettingsDto & { weekendMaxPositionUsd?: number }).weekendMaxPositionUsd;
  delete (normalized as UpdateSettingsDto & { sessionModeEnabled?: boolean }).sessionModeEnabled;
  delete (normalized as UpdateSettingsDto & { tradingWindowStartHourUtc?: number }).tradingWindowStartHourUtc;
  delete (normalized as UpdateSettingsDto & { tradingWindowEndHourUtc?: number }).tradingWindowEndHourUtc;
  delete (normalized as UpdateSettingsDto & { maxLongOpenTrades?: number }).maxLongOpenTrades;
  delete (normalized as UpdateSettingsDto & { maxShortOpenTrades?: number }).maxShortOpenTrades;
  delete (normalized as UpdateSettingsDto & { breakoutMaxOpenTrades?: number }).breakoutMaxOpenTrades;
  delete (normalized as UpdateSettingsDto & { pullbackMaxOpenTrades?: number }).pullbackMaxOpenTrades;
  delete (normalized as UpdateSettingsDto & { reversionMaxOpenTrades?: number }).reversionMaxOpenTrades;
  delete (normalized as UpdateSettingsDto & { trendReclaimMaxOpenTrades?: number }).trendReclaimMaxOpenTrades;
  delete (normalized as UpdateSettingsDto & { rangeBounceMaxOpenTrades?: number }).rangeBounceMaxOpenTrades;

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
  const {
    isPaused,
    weekendModeEnabled: _weekendModeEnabled,
    weekendMaxOpenTrades: _weekendMaxOpenTrades,
    weekendMinConfidenceScore: _weekendMinConfidenceScore,
    weekendMinHotScoreForScan: _weekendMinHotScoreForScan,
    weekendRiskPerTradePercent: _weekendRiskPerTradePercent,
    weekendMaxPositionUsd: _weekendMaxPositionUsd,
    sessionModeEnabled: _sessionModeEnabled,
    tradingWindowStartHourUtc: _tradingWindowStartHourUtc,
    tradingWindowEndHourUtc: _tradingWindowEndHourUtc,
    maxLongOpenTrades: _maxLongOpenTrades,
    maxShortOpenTrades: _maxShortOpenTrades,
    breakoutMaxOpenTrades: _breakoutMaxOpenTrades,
    pullbackMaxOpenTrades: _pullbackMaxOpenTrades,
    reversionMaxOpenTrades: _reversionMaxOpenTrades,
    trendReclaimMaxOpenTrades: _trendReclaimMaxOpenTrades,
    rangeBounceMaxOpenTrades: _rangeBounceMaxOpenTrades,
    ...rest
  } = settings as T & {
    isPaused?: boolean;
    weekendModeEnabled?: boolean;
    weekendMaxOpenTrades?: number;
    weekendMinConfidenceScore?: number;
    weekendMinHotScoreForScan?: number;
    weekendRiskPerTradePercent?: number;
    weekendMaxPositionUsd?: number;
    sessionModeEnabled?: boolean;
    tradingWindowStartHourUtc?: number;
    tradingWindowEndHourUtc?: number;
    maxLongOpenTrades?: number;
    maxShortOpenTrades?: number;
    breakoutMaxOpenTrades?: number;
    pullbackMaxOpenTrades?: number;
    reversionMaxOpenTrades?: number;
    trendReclaimMaxOpenTrades?: number;
    rangeBounceMaxOpenTrades?: number;
  };
  return {
    ...rest,
    isPaused: isPaused ?? false,
    enableRealTrading: rest.realTradingEnabled,
    allowAutoLiveExecution: rest.requireDashboardConfirmation === false,
  };
}
