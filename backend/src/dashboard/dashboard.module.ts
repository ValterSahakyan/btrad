import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { LogsModule } from '../logs/logs.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { ScannerModule } from '../scanner/scanner.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DashboardController } from './dashboard.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [ScannerModule, LogsModule, MarketRegimeModule, BinanceModule, TelegramModule],
  controllers: [DashboardController, HealthController],
})
export class DashboardModule {}
