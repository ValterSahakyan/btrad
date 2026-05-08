import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { ExecutionModule } from '../execution/execution.module';
import { LogsModule } from '../logs/logs.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { RiskModule } from '../risk/risk.module';
import { ScoringModule } from '../scoring/scoring.module';
import { StrategiesModule } from '../strategies/strategies.module';
import { HotScoreService } from './hot-score.service';
import { ScannerScheduler } from './scanner.scheduler';
import { ScannerService } from './scanner.service';
import { ScannerWorker } from './scanner.worker';

@Module({
  imports: [BinanceModule, LogsModule, MarketRegimeModule, StrategiesModule, ScoringModule, RiskModule, ExecutionModule],
  providers: [HotScoreService, ScannerService, ScannerScheduler, ScannerWorker],
  exports: [ScannerService],
})
export class ScannerModule {}
