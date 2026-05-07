import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { ScannerModule } from '../scanner/scanner.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [ScannerModule, LogsModule, MarketRegimeModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
