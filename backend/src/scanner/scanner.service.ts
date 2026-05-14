import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { BinanceService } from '../binance/binance.service';
import { average, stdDev } from '../common/utils/math';
import { OrderExecutionService } from '../execution/order-execution.service';
import { LogsService } from '../logs/logs.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskEngineService } from '../risk/risk-engine.service';
import { ConfidenceScoreService } from '../scoring/confidence-score.service';
import { applyWeekendOverrides } from '../settings/weekend-settings';
import { StrategyConfig } from '../strategies/strategy.interface';
import { StrategySelectorService } from '../strategies/strategy-selector.service';
import { HotScoreService } from './hot-score.service';

type StrategyHealth = {
  trades: number;
  totalPnl: number;
  consecutiveLosses: number;
  blockedReason?: string;
};

@Injectable()
export class ScannerService {
  readonly queue: Queue;
  private scanning = false;
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    private readonly binanceService: BinanceService,
    private readonly marketRegimeService: MarketRegimeService,
    private readonly hotScoreService: HotScoreService,
    private readonly strategySelectorService: StrategySelectorService,
    private readonly confidenceScoreService: ConfidenceScoreService,
    private readonly riskEngineService: RiskEngineService,
    private readonly orderExecutionService: OrderExecutionService,
  ) {
    const connection = new Redis(this.configService.get<string>('redisUrl', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });
    this.redis = connection;
    this.queue = new Queue('scanner', { connection });
  }

  async enqueueScan(): Promise<void> {
    await this.queue.add('scan-markets', {}, { removeOnComplete: 20, removeOnFail: 20 });
  }

  async runScan(): Promise<{ processed: number; signalsCreated: number; skipped?: boolean }> {
    const lockToken = randomToken();
    const acquired = await this.redis.set('scanner:run-lock', lockToken, 'PX', 30 * 60_000, 'NX');
    if (!acquired) {
      return { processed: 0, signalsCreated: 0, skipped: true };
    }

    if (this.scanning) {
      await this.releaseLock(lockToken);
      return { processed: 0, signalsCreated: 0, skipped: true };
    }
    this.scanning = true;
    try {
      return await this._runScan();
    } finally {
      this.scanning = false;
      await this.releaseLock(lockToken);
    }
  }

  private async _runScan(): Promise<{ processed: number; signalsCreated: number }> {
    const baseSettings = await this.prisma.botSettings.findFirst();
    const settings = applyWeekendOverrides(baseSettings);
    if (baseSettings?.isPaused) {
      return { processed: 0, signalsCreated: 0 };
    }
    await this.logsService.info('scanner', 'Starting market scan');
    const regime = await this.marketRegimeService.getRegime();
    await this.logsService.info('scanner', `Market regime: ${regime.regime}`, {
      score: regime.score,
      volatility: regime.volatility,
      btcTrend: regime.btcTrend,
      ethTrend: regime.ethTrend,
      caution: regime.caution,
    });

    const maxSymbols = settings?.maxSymbolsPerScan ?? 50;
    const minHotScore = settings?.minHotScoreForScan ?? 45;
    const strategyHealth = await this.buildStrategyHealthMap(settings);

    const [enabledSymbols, tickers] = await Promise.all([
      this.prisma.symbol.findMany({ where: { isEnabled: true } }),
      this.binanceService.fetch24hTickerStats(),
    ]);

    // Sort symbols by 24h quote volume descending (most active first)
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));
    const sorted = enabledSymbols
      .map((s) => ({ record: s, ticker: tickerMap.get(s.symbol) }))
      .filter((item): item is { record: typeof item.record; ticker: NonNullable<typeof item.ticker> } => !!item.ticker)
      .sort((a, b) => Number(b.ticker.quoteVolume) - Number(a.ticker.quoteVolume))
      .slice(0, maxSymbols);

    let processed = 0;
    let signalsCreated = 0;
    let filteredPreCandidate = 0;
    let noStrategyCandidate = 0;
    let riskRejected = 0;
    let duplicateTradeSkipped = 0;
    let duplicateSignalSkipped = 0;
    let cooldownSkipped = 0;
    const riskReasonCounts = new Map<string, number>();
    const candidateStrategyCounts = new Map<string, number>();
    const createdStrategyCounts = new Map<string, number>();
    const createdDirectionCounts = new Map<string, number>();
    const strategyBlockedCounts = new Map<string, number>();

    for (const { record: symbolRecord, ticker } of sorted) {
      try {
        // Re-check pause status frequently during the long loop to abort early
        const freshSettings = await this.prisma.botSettings.findFirst();
        if (freshSettings?.isPaused) {
          await this.logsService.info('scanner', 'Scan aborted early: Bot was paused');
          break;
        }
        const [candles15m, candles1h, candles4h, fundingRate, openInterest] = await Promise.all([
          this.binanceService.fetchKlines({ symbol: symbolRecord.symbol, interval: '15m', limit: 200 }),
          this.binanceService.fetchKlines({ symbol: symbolRecord.symbol, interval: '1h', limit: 200 }),
          this.binanceService.fetchKlines({ symbol: symbolRecord.symbol, interval: '4h', limit: 100 }),
          this.binanceService.fetchFundingRate(symbolRecord.symbol),
          this.binanceService.fetchOpenInterest(symbolRecord.symbol),
        ]);

        if (candles15m.length < 60 || candles1h.length < 60) continue;

        const closes15m = candles15m.map((c) => c.close);
        const volumes15m = candles15m.map((c) => c.volume);
        const price = Number(ticker.lastPrice);
        const volume24h = Number(ticker.quoteVolume);
        const priceChange24h = Number(ticker.priceChangePercent);
        const volatility = (stdDev(closes15m.slice(-30)) / average(closes15m.slice(-30))) * 100;
        const spread = Math.max(0.02, Math.min(1.2, volatility / 20));
        const avgVolume = average(volumes15m.slice(-20));
        const volumeSpikeRatio = avgVolume === 0 ? 0 : (volumes15m.at(-1) ?? 0) / avgVolume;
        const liquidity = Math.max(1, Math.min(100, volume24h / 100_000));
        // Convert raw coin open interest to USD notional for scoring
        const openInterestUsd = openInterest * price;
        const hotScore = this.hotScoreService.calculate({
          volume24h,
          priceChange24h,
          volumeSpikeRatio,
          volatility,
          openInterest: openInterestUsd,
          fundingRate,
          spread,
          liquidity,
        });

        processed += 1;

        await this.prisma.marketSnapshot.create({
          data: { symbolId: symbolRecord.id, price, volume24h, priceChange24h, fundingRate, openInterest, spread, volatility, hotScore },
        });

        if (hotScore < minHotScore || spread > 0.8 || liquidity < 10) {
          filteredPreCandidate += 1;
          continue;
        }

        const strategyConfig = buildStrategyConfig(settings);

        const candidates = this.strategySelectorService.evaluateAll({
          symbol: symbolRecord.symbol,
          candles15m,
          candles1h,
          candles4h,
          hotScore,
          spread,
          marketRegime: regime,
          minRiskReward: settings?.minRiskReward ?? 1.5,
          strategyConfig,
        });

        if (candidates.length === 0) {
          noStrategyCandidate += 1;
          continue;
        }
        const selectableCandidates: Array<{
          candidate: (typeof candidates)[number];
          confidenceScore: number;
          risk: Awaited<ReturnType<RiskEngineService['validateSignal']>>;
          expiresAt: Date;
          selectionScore: number;
        }> = [];
        let hadUnblockedCandidate = false;

        for (const candidate of candidates) {
          candidateStrategyCounts.set(candidate.strategy, (candidateStrategyCounts.get(candidate.strategy) ?? 0) + 1);

          const health = strategyHealth.get(candidate.strategy);
          if (health?.blockedReason) {
            strategyBlockedCounts.set(candidate.strategy, (strategyBlockedCounts.get(candidate.strategy) ?? 0) + 1);
            continue;
          }
          hadUnblockedCandidate = true;

          const provisionalConfidence = this.confidenceScoreService.calculate({
            hotScore,
            strategyScore: candidate.strategyScore,
            marketScore: regime.score,
            liquidityScore: Math.max(20, 100 - spread * 100),
            riskScore: 75,
          });

          let effectiveStopLoss = candidate.stopLoss;
          if (settings?.fixedRoeEnabled) {
            const feeBps = Number(process.env.ESTIMATED_TAKER_FEE_BPS) || 4;
            const feeRate = feeBps / 10000;
            const leverage = Math.min(settings.maxLeverage ?? 5, settings.defaultLeverage ?? 3);
            effectiveStopLoss = this.calculateFixedRoePrice({
              entryPrice: candidate.entryPrice,
              direction: candidate.direction,
              leverage,
              targetRoePercent: settings.fixedRoeSlPercent ?? 20,
              feeRate,
              isTp: false,
            });
            effectiveStopLoss = Number(effectiveStopLoss.toFixed(symbolRecord.pricePrecision));
          }

          const expiresAt = new Date(Date.now() + (settings?.signalExpirationMinutes ?? 15) * 60_000);
          const risk = await this.riskEngineService.validateSignal({
            symbol: symbolRecord.symbol,
            direction: candidate.direction,
            strategy: candidate.strategy,
            entryPrice: candidate.entryPrice,
            stopLoss: effectiveStopLoss,
            riskReward: candidate.riskReward,
            spread,
            confidenceScore: provisionalConfidence,
            expiresAt,
            marketRegime: regime.regime,
            stepSize: symbolRecord.stepSize,
            minNotional: symbolRecord.minNotional,
          });

          const confidenceScore = this.confidenceScoreService.calculate({
            hotScore,
            strategyScore: candidate.strategyScore,
            marketScore: regime.score,
            liquidityScore: Math.max(20, 100 - spread * 100),
            riskScore: risk.riskScore,
          });

          const minConfidence = effectiveMinConfidence(settings?.minConfidenceScore ?? 65, candidate.strategy);
          if (!risk.allowed || confidenceScore < minConfidence) {
            for (const reason of risk.messages) {
              riskReasonCounts.set(reason, (riskReasonCounts.get(reason) ?? 0) + 1);
            }
            if (confidenceScore < minConfidence) {
              const key = `Confidence below minimum for ${candidate.strategy} (${confidenceScore.toFixed(1)} < ${minConfidence})`;
              riskReasonCounts.set(key, (riskReasonCounts.get(key) ?? 0) + 1);
            }
            continue;
          }

          selectableCandidates.push({
            candidate,
            confidenceScore,
            risk,
            expiresAt,
            selectionScore: computeSelectionScore({
              candidate,
              confidenceScore,
              riskScore: risk.riskScore,
            }),
          });
        }

        if (selectableCandidates.length === 0) {
          if (hadUnblockedCandidate) {
            riskRejected += 1;
          } else {
            noStrategyCandidate += 1;
          }
          continue;
        }

        selectableCandidates.sort((a, b) => b.selectionScore - a.selectionScore);
        const selected = selectableCandidates[0];
        const { candidate, confidenceScore, risk, expiresAt } = selected;

        // Skip if already have an open trade for this symbol
        const existingTrade = await this.prisma.trade.findFirst({
          where: { symbol: symbolRecord.symbol, status: 'live_open' },
        });
        if (existingTrade) {
          duplicateTradeSkipped += 1;
          continue;
        }

        // Skip if this symbol had a trade close recently — prevents chasing a move
        // that just ended (e.g. took profit then immediately re-entering same coin).
        const recentTrade = await this.prisma.trade.findFirst({
          where: {
            symbol: symbolRecord.symbol,
            closedAt: { gte: new Date(Date.now() - SYMBOL_COOLDOWN_MS) },
          },
          select: { id: true },
        });
        if (recentTrade) {
          cooldownSkipped += 1;
          continue;
        }

        // Skip if a signal for this symbol was already created or is in-flight.
        // Include 'approved' because autoExecute claims signals (active→approved) almost
        // instantly — a check for only 'pending'/'active' misses the window where a
        // concurrent scan or the position monitor would create a second trade.
        // Also cover any signal created in the last 10 minutes to guard against
        // concurrent scanner instances that outlast the Redis lock TTL.
        const existingSignal = await this.prisma.signal.findFirst({
          where: {
            symbolId: symbolRecord.id,
            direction: candidate.direction,
            OR: [
              { status: { in: ['pending', 'active', 'approved'] } },
              { createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
            ],
          },
        });
        if (existingSignal) {
          duplicateSignalSkipped += 1;
          continue;
        }

        let stopLoss = candidate.stopLoss;
        let takeProfit1 = candidate.takeProfit1;
        let takeProfit2 = candidate.takeProfit2;

        if (settings?.fixedRoeEnabled) {
          const feeBps = Number(process.env.ESTIMATED_TAKER_FEE_BPS) || 4;
          const feeRate = feeBps / 10000;
          const leverage = risk.leverage;

          takeProfit1 = this.calculateFixedRoePrice({
            entryPrice: candidate.entryPrice,
            direction: candidate.direction,
            leverage,
            targetRoePercent: settings.fixedRoeTpPercent ?? 20,
            feeRate,
            isTp: true,
          });

          // Use slightly higher target for TP2 if fixed ROE is on
          takeProfit2 = this.calculateFixedRoePrice({
            entryPrice: candidate.entryPrice,
            direction: candidate.direction,
            leverage,
            targetRoePercent: (settings.fixedRoeTpPercent ?? 20) * 1.5,
            feeRate,
            isTp: true,
          });

          stopLoss = this.calculateFixedRoePrice({
            entryPrice: candidate.entryPrice,
            direction: candidate.direction,
            leverage,
            targetRoePercent: settings.fixedRoeSlPercent ?? 20,
            feeRate,
            isTp: false,
          });

          // Round to symbol precision
          takeProfit1 = Number(takeProfit1.toFixed(symbolRecord.pricePrecision));
          takeProfit2 = Number(takeProfit2.toFixed(symbolRecord.pricePrecision));
          stopLoss = Number(stopLoss.toFixed(symbolRecord.pricePrecision));
        }

        const signal = await this.prisma.signal.create({
          data: {
            symbolId: symbolRecord.id,
            direction: candidate.direction,
            strategy: candidate.strategy,
            entryPrice: candidate.entryPrice,
            stopLoss,
            takeProfit1,
            takeProfit2,
            leverage: risk.leverage,
            riskAmount: risk.riskAmount,
            positionSize: risk.positionSize,
            riskReward: candidate.riskReward,
            hotScore,
            marketScore: regime.score,
            strategyScore: candidate.strategyScore,
            liquidityScore: Math.max(20, 100 - spread * 100),
            riskScore: risk.riskScore,
            confidenceScore,
            reasonJson: {
              reasons: candidate.reasonList,
              regime: regime as unknown as Prisma.InputJsonValue,
              spread,
              meta: {
                botVersionTag: getBotVersionTag(),
              },
            } as unknown as Prisma.InputJsonValue,
            invalidationJson: {
              rules: candidate.invalidationRules,
              riskMessages: risk.messages,
            },
            status: 'active',
            expiresAt,
          },
        });

        signalsCreated += 1;
        createdStrategyCounts.set(candidate.strategy, (createdStrategyCounts.get(candidate.strategy) ?? 0) + 1);
        createdDirectionCounts.set(candidate.direction, (createdDirectionCounts.get(candidate.direction) ?? 0) + 1);

        const autoExecute = settings?.requireDashboardConfirmation === false;

        if (autoExecute) {
          void this.autoExecute(signal.id).catch(async (err: unknown) => {
            await this.logsService.error('scanner', `Auto-execute failed for ${symbolRecord.symbol}`, {
              signalId: signal.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch (err) {
        await this.logsService.warn('scanner', `Symbol scan failed: ${symbolRecord.symbol}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const topBlockers = [...riskReasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    await this.logsService.info('scanner', 'Completed market scan', {
      processed,
      signalsCreated,
      symbolsTotal: sorted.length,
      filteredPreCandidate,
      noStrategyCandidate,
      riskRejected,
      duplicateTradeSkipped,
      duplicateSignalSkipped,
      cooldownSkipped,
      strategyHealth: Object.fromEntries(
        [...strategyHealth.entries()].map(([strategy, health]) => [strategy, {
          trades: health.trades,
          totalPnl: Number(health.totalPnl.toFixed(4)),
          consecutiveLosses: health.consecutiveLosses,
          blockedReason: health.blockedReason ?? null,
        }]),
      ),
      strategyBlockedCounts: Object.fromEntries(strategyBlockedCounts),
      candidateStrategyCounts: Object.fromEntries(candidateStrategyCounts),
      createdStrategyCounts: Object.fromEntries(createdStrategyCounts),
      createdDirectionCounts: Object.fromEntries(createdDirectionCounts),
      executionMode:
        settings?.requireDashboardConfirmation === false
          ? 'live_auto'
          : settings?.realTradingEnabled && settings?.mode === 'live'
            ? 'live_manual'
            : 'signal_only',
      topBlockers,
    });
    return { processed, signalsCreated };
  }

  private async autoExecute(signalId: string): Promise<void> {
    await this.orderExecutionService.approveLive(signalId);
  }

  private async releaseLock(token: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      'scanner:run-lock',
      token,
    );
  }

  async syncSymbols(): Promise<{ imported: number }> {
    const remoteSymbols = await this.binanceService.fetchUsdtSymbols();
    let imported = 0;

    for (const symbol of remoteSymbols) {
      const stepSize = Number(symbol.filters.find((f) => f.filterType === 'LOT_SIZE')?.stepSize ?? 0.001);
      const tickSize = Number(symbol.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? 0.01);
      const minNotional = Number(symbol.filters.find((f) => f.filterType === 'MIN_NOTIONAL')?.notional ?? 5);

      await this.prisma.symbol.upsert({
        where: { symbol: symbol.symbol },
        update: { baseAsset: symbol.baseAsset, quoteAsset: symbol.quoteAsset, status: symbol.status, minNotional, quantityPrecision: symbol.quantityPrecision, pricePrecision: symbol.pricePrecision, stepSize, tickSize },
        create: { symbol: symbol.symbol, baseAsset: symbol.baseAsset, quoteAsset: symbol.quoteAsset, status: symbol.status, minNotional, quantityPrecision: symbol.quantityPrecision, pricePrecision: symbol.pricePrecision, stepSize, tickSize },
      });
      imported += 1;
    }

    return { imported };
  }

  private async buildStrategyHealthMap(settings: Record<string, unknown> | null): Promise<Map<string, StrategyHealth>> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const trades = await this.prisma.trade.findMany({
      where: {
        closedAt: { gte: todayStart },
        pnl: { not: null },
        signal: { isNot: null },
      },
      select: {
        pnl: true,
        closedAt: true,
        signal: {
          select: {
            strategy: true,
          },
        },
      },
      orderBy: { closedAt: 'desc' },
    });

    const grouped = new Map<string, Array<{ pnl: number }>>();
    for (const trade of trades) {
      const strategy = trade.signal?.strategy;
      if (!strategy || trade.pnl === null) continue;
      const bucket = grouped.get(strategy) ?? [];
      bucket.push({ pnl: trade.pnl });
      grouped.set(strategy, bucket);
    }

    const s = settings as any;
    const maxPositionUsd = s?.maxPositionUsd ?? 15;
    const strategyDrawdownLimit = -(maxPositionUsd * 1.0);

    const healthMap = new Map<string, StrategyHealth>();
    for (const [strategy, bucket] of grouped.entries()) {
      const totalPnl = bucket.reduce((sum, trade) => sum + trade.pnl, 0);
      const consecutiveLosses = bucket.findIndex((trade) => trade.pnl > 0);
      const effectiveConsecutiveLosses = consecutiveLosses === -1 ? bucket.length : consecutiveLosses;
      let blockedReason: string | undefined;

      if (effectiveConsecutiveLosses >= 6) {
        blockedReason = '6 consecutive losses today';
      } else if (bucket.length >= 6 && totalPnl < strategyDrawdownLimit) {
        blockedReason = 'daily strategy drawdown exceeded';
      }

      healthMap.set(strategy, {
        trades: bucket.length,
        totalPnl,
        consecutiveLosses: effectiveConsecutiveLosses,
        blockedReason,
      });
    }

    return healthMap;
  }

  private calculateFixedRoePrice(params: {
    entryPrice: number;
    direction: 'LONG' | 'SHORT';
    leverage: number;
    targetRoePercent: number;
    feeRate: number;
    isTp: boolean;
  }): number {
    const { entryPrice, direction, leverage, targetRoePercent, feeRate, isTp } = params;
    const roe = targetRoePercent / 100;

    if (direction === 'LONG') {
      if (isTp) {
        return (entryPrice * (roe / leverage + 1 + feeRate)) / (1 - feeRate);
      }

      return (entryPrice * (1 + feeRate - roe / leverage)) / (1 - feeRate);
    }

    if (isTp) {
      return (entryPrice * (1 - feeRate - roe / leverage)) / (1 + feeRate);
    }

    return (entryPrice * (roe / leverage + 1 - feeRate)) / (1 + feeRate);
  }
}

function effectiveMinConfidence(base: number, strategy: string): number {
  // Strategies with historically poor win rates need a higher confidence bar.
  if (strategy === 'mean_reversion') return base + 5;
  if (strategy === 'trend_reclaim') return base + 5;
  if (strategy === 'pullback_continuation') return base + 3;
  return base;
}

function computeSelectionScore(input: {
  candidate: {
    strategyScore: number;
    riskReward: number;
    direction: 'LONG' | 'SHORT';
  };
  confidenceScore: number;
  riskScore: number;
}): number {
  return (
    input.confidenceScore * 100 +
    input.riskScore * 10 +
    input.candidate.strategyScore +
    input.candidate.riskReward * 5 +
    (input.candidate.direction === 'SHORT' ? 0.5 : 0)
  );
}

function getBotVersionTag(): string {
  const tag = process.env.BOT_VERSION_TAG?.trim();
  return tag && tag.length > 0 ? tag : 'current';
}

// How long after a trade closes before the same symbol can be re-entered.
// Prevents the scanner from immediately chasing a move that just finished.
const SYMBOL_COOLDOWN_MS = 30 * 60_000;

function randomToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildStrategyConfig(settings: Record<string, unknown> | null): StrategyConfig {
  const s = settings as any;
  return {
    breakout: {
      enabled: s?.breakoutEnabled ?? true,
      minVolumeRatio: s?.breakoutMinVolumeRatio ?? 1.5,
      lookbackPeriod: s?.breakoutLookbackPeriod ?? 20,
      maxSlPercent: s?.breakoutMaxSlPercent ?? 5.0,
      tp1Multiplier: s?.breakoutTp1Multiplier ?? 1.5,
      tp2Multiplier: s?.breakoutTp2Multiplier ?? 2.5,
      minHotScore: s?.breakoutMinHotScore ?? 55,
    },
    pullback: {
      enabled: s?.pullbackEnabled ?? true,
      rsiLongMin: s?.pullbackRsiLongMin ?? 38,
      rsiLongMax: s?.pullbackRsiLongMax ?? 58,
      rsiShortMin: s?.pullbackRsiShortMin ?? 42,
      rsiShortMax: s?.pullbackRsiShortMax ?? 62,
      atrMultiplier: s?.pullbackAtrMultiplier ?? 1.5,
      maxSlPercent: s?.pullbackMaxSlPercent ?? 4.0,
      minHotScore: s?.pullbackMinHotScore ?? 40,
    },
    reversion: {
      enabled: s?.reversionEnabled ?? true,
      rsiOverbought: s?.reversionRsiOverbought ?? 75,
      rsiOversold: s?.reversionRsiOversold ?? 25,
      vwapDeviationPct: s?.reversionVwapDeviationPct ?? 3.0,
      volumeDeclineRatio: s?.reversionVolumeDeclineRatio ?? 0.6,
      maxSlPercent: s?.reversionMaxSlPercent ?? 5.0,
    },
    trendReclaim: {
      enabled: s?.trendReclaimEnabled ?? true,
      emaBufferAtr: s?.trendReclaimEmaBufferAtr ?? 0.35,
      reclaimVolumeRatio: s?.trendReclaimVolumeRatio ?? 1.1,
      maxSlPercent: s?.trendReclaimMaxSlPercent ?? 3.5,
      tp1Multiplier: s?.trendReclaimTp1Multiplier ?? 1.4,
      tp2Multiplier: s?.trendReclaimTp2Multiplier ?? 2.3,
      minHotScore: s?.trendReclaimMinHotScore ?? 50,
    },
    rangeBounce: {
      enabled: s?.rangeBounceEnabled ?? true,
      lookbackPeriod: s?.rangeBounceLookbackPeriod ?? 24,
      proximityAtr: s?.rangeBounceProximityAtr ?? 0.8,
      rsiLongMax: s?.rangeBounceRsiLongMax ?? 45,
      rsiShortMin: s?.rangeBounceRsiShortMin ?? 55,
      maxSlPercent: s?.rangeBounceMaxSlPercent ?? 3.2,
      tp1Multiplier: s?.rangeBounceTp1Multiplier ?? 1.3,
      tp2Multiplier: s?.rangeBounceTp2Multiplier ?? 2.0,
      minHotScore: s?.rangeBounceMinHotScore ?? 35,
    },
  };
}
