import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { BinanceService } from '../binance/binance.service';
import { average, stdDev } from '../common/utils/math';
import { LogsService } from '../logs/logs.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskEngineService } from '../risk/risk-engine.service';
import { ConfidenceScoreService } from '../scoring/confidence-score.service';
import { StrategySelectorService } from '../strategies/strategy-selector.service';
import { HotScoreService } from './hot-score.service';

@Injectable()
export class ScannerService {
  readonly queue: Queue;

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
  ) {
    const connection = new Redis(this.configService.get<string>('redisUrl', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue('scanner', { connection });
  }

  async enqueueScan(): Promise<void> {
    await this.queue.add('scan-markets', {}, { removeOnComplete: 20, removeOnFail: 20 });
  }

  async runScan(): Promise<{ processed: number; signalsCreated: number }> {
    await this.logsService.info('scanner', 'Starting market scan');
    const settings = await this.prisma.botSettings.findFirst();
    const regime = await this.marketRegimeService.getRegime();
    const [symbols, tickers] = await Promise.all([
      this.prisma.symbol.findMany({ where: { isEnabled: true } }),
      this.binanceService.fetch24hTickerStats(),
    ]);

    let processed = 0;
    let signalsCreated = 0;

    for (const symbolRecord of symbols.slice(0, 30)) {
      const ticker = tickers.find((item) => item.symbol === symbolRecord.symbol);
      if (!ticker) {
        continue;
      }

      const [candles15m, candles1h, fundingRate, openInterest, markPrice] = await Promise.all([
        this.binanceService.fetchKlines({ symbol: symbolRecord.symbol, interval: '15m', limit: 120 }),
        this.binanceService.fetchKlines({ symbol: symbolRecord.symbol, interval: '1h', limit: 120 }),
        this.binanceService.fetchFundingRate(symbolRecord.symbol),
        this.binanceService.fetchOpenInterest(symbolRecord.symbol),
        this.binanceService.fetchMarkPrice(symbolRecord.symbol),
      ]);

      if (candles15m.length < 50 || candles1h.length < 50) {
        continue;
      }

      const closes15m = candles15m.map((candle) => candle.close);
      const volumes15m = candles15m.map((candle) => candle.volume);
      const price = Number(ticker.lastPrice);
      const volume24h = Number(ticker.quoteVolume);
      const priceChange24h = Number(ticker.priceChangePercent);
      const volatility = stdDev(closes15m.slice(-30)) / average(closes15m.slice(-30)) * 100;
      const spread = Math.max(0.02, Math.min(1.2, volatility / 20));
      const avgVolume = average(volumes15m.slice(-20));
      const volumeSpikeRatio = avgVolume === 0 ? 0 : (volumes15m.at(-1) ?? 0) / avgVolume;
      const liquidity = Math.max(1, Math.min(100, volume24h / 100_000));
      const hotScore = this.hotScoreService.calculate({
        volume24h,
        priceChange24h,
        volumeSpikeRatio,
        volatility,
        openInterest,
        fundingRate,
        spread,
        liquidity,
      });

      processed += 1;

      await this.prisma.marketSnapshot.create({
        data: {
          symbolId: symbolRecord.id,
          price,
          volume24h,
          priceChange24h,
          fundingRate,
          openInterest,
          spread,
          volatility,
          hotScore,
        },
      });

      if (hotScore < 60 || spread > 0.8 || liquidity < 10) {
        continue;
      }

      const candidate = this.strategySelectorService.evaluate({
        symbol: symbolRecord.symbol,
        candles15m,
        candles1h,
        hotScore,
        spread,
        marketRegime: regime,
        minRiskReward: settings?.minRiskReward ?? 1.5,
      });

      if (!candidate) {
        continue;
      }

      const provisionalConfidence = this.confidenceScoreService.calculate({
        hotScore,
        strategyScore: candidate.strategyScore,
        marketScore: regime.score,
        liquidityScore: Math.max(20, 100 - spread * 100),
        riskScore: 75,
      });

      const expiresAt = new Date(Date.now() + (settings?.signalExpirationMinutes ?? 15) * 60_000);
      const risk = await this.riskEngineService.validateSignal({
        symbol: symbolRecord.symbol,
        direction: candidate.direction,
        entryPrice: candidate.entryPrice,
        stopLoss: candidate.stopLoss,
        riskReward: candidate.riskReward,
        spread,
        confidenceScore: provisionalConfidence,
        expiresAt,
        marketRegime: regime.regime,
      });

      const confidenceScore = this.confidenceScoreService.calculate({
        hotScore,
        strategyScore: candidate.strategyScore,
        marketScore: regime.score,
        liquidityScore: Math.max(20, 100 - spread * 100),
        riskScore: risk.riskScore,
      });

      if (!risk.allowed || confidenceScore < (settings?.minConfidenceScore ?? 70)) {
        await this.logsService.warn('scanner', 'Signal skipped by filters', {
          symbol: symbolRecord.symbol,
          confidenceScore,
          reasons: risk.messages,
        });
        continue;
      }

      await this.prisma.signal.create({
        data: {
          symbolId: symbolRecord.id,
          direction: candidate.direction,
          strategy: candidate.strategy,
          entryPrice: candidate.entryPrice,
          stopLoss: candidate.stopLoss,
          takeProfit1: candidate.takeProfit1,
          takeProfit2: candidate.takeProfit2,
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
            regime: regime as unknown as Record<string, unknown>,
            spread,
          },
          invalidationJson: {
            rules: candidate.invalidationRules,
            riskMessages: risk.messages,
          },
          status: 'active',
          expiresAt,
        },
      });

      signalsCreated += 1;
    }

    await this.logsService.info('scanner', 'Completed market scan', { processed, signalsCreated });
    return { processed, signalsCreated };
  }

  async syncSymbols(): Promise<{ imported: number }> {
    const remoteSymbols = await this.binanceService.fetchUsdtSymbols();
    let imported = 0;

    for (const symbol of remoteSymbols) {
      const stepSize = Number(symbol.filters.find((item) => item.filterType === 'LOT_SIZE')?.stepSize ?? 0.001);
      const tickSize = Number(symbol.filters.find((item) => item.filterType === 'PRICE_FILTER')?.tickSize ?? 0.01);
      const minNotional = Number(symbol.filters.find((item) => item.filterType === 'MIN_NOTIONAL')?.notional ?? 5);

      await this.prisma.symbol.upsert({
        where: { symbol: symbol.symbol },
        update: {
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
          status: symbol.status,
          minNotional,
          quantityPrecision: symbol.quantityPrecision,
          pricePrecision: symbol.pricePrecision,
          stepSize,
          tickSize,
        },
        create: {
          symbol: symbol.symbol,
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
          status: symbol.status,
          minNotional,
          quantityPrecision: symbol.quantityPrecision,
          pricePrecision: symbol.pricePrecision,
          stepSize,
          tickSize,
        },
      });
      imported += 1;
    }

    return { imported };
  }
}
