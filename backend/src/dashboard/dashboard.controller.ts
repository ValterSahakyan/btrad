import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { LogsService } from '../logs/logs.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';

type SnapshotRow = {
  hotScore: number;
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
  ) {}

  @Get('/status')
  async getStatus() {
    const settings = await this.prisma.botSettings.findFirst();
    const activeSignals = await this.prisma.signal.count({ where: { status: 'active' } });
    const openTrades = await this.prisma.trade.count({ where: { status: { in: ['paper_open', 'live_open'] } } });
    return {
      botStatus: settings?.isPaused ? 'paused' : 'running',
      mode: settings?.mode ?? 'testnet',
      realTradingEnabled: settings?.realTradingEnabled ?? false,
      paperTradingEnabled: settings?.paperTradingEnabled ?? true,
      requireDashboardConfirmation: settings?.requireDashboardConfirmation ?? true,
      activeSignals,
      openTrades,
      lastScannerRun: (await this.prisma.botLog.findFirst({
        where: { source: 'scanner', message: 'Completed market scan' },
        orderBy: { createdAt: 'desc' },
      }))?.createdAt,
    };
  }

  @Get('/settings')
  async getSettings() {
    const settings = await this.prisma.botSettings.findFirst();
    if (settings) {
      return settings;
    }

    return this.prisma.botSettings.create({ data: {} });
  }

  @Patch('/settings')
  async patchSettings(@Body() body: Record<string, unknown>) {
    const existing = await this.getSettings();
    return this.prisma.botSettings.update({
      where: { id: existing.id },
      data: {
        mode: body.mode as 'testnet' | 'live' | undefined,
        isPaused: body.isPaused as boolean | undefined,
        realTradingEnabled: body.realTradingEnabled as boolean | undefined,
        requireDashboardConfirmation: body.requireDashboardConfirmation as boolean | undefined,
        paperTradingEnabled: body.paperTradingEnabled as boolean | undefined,
        defaultLeverage: body.defaultLeverage as number | undefined,
        maxLeverage: body.maxLeverage as number | undefined,
        riskPerTradePercent: body.riskPerTradePercent as number | undefined,
        maxDailyLossPercent: body.maxDailyLossPercent as number | undefined,
        maxOpenTrades: body.maxOpenTrades as number | undefined,
        maxConsecutiveLosses: body.maxConsecutiveLosses as number | undefined,
        minConfidenceScore: body.minConfidenceScore as number | undefined,
        minRiskReward: body.minRiskReward as number | undefined,
        scannerIntervalSeconds: body.scannerIntervalSeconds as number | undefined,
        signalExpirationMinutes: body.signalExpirationMinutes as number | undefined,
      },
    });
  }

  @Post('/bot/pause')
  async pauseBot() {
    const settings = await this.getSettings();
    return this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: true } });
  }

  @Post('/bot/resume')
  async resumeBot() {
    const settings = await this.getSettings();
    return this.prisma.botSettings.update({ where: { id: settings.id }, data: { isPaused: false } });
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
    const latestPerSymbol: SnapshotRow[] = await this.prisma.marketSnapshot.findMany({
      include: { symbol: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return latestPerSymbol.sort((a, b) => b.hotScore - a.hotScore);
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
}
