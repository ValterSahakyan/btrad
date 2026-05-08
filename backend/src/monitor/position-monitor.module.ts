import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { ExecutionModule } from '../execution/execution.module';
import { LogsModule } from '../logs/logs.module';
import { ScannerModule } from '../scanner/scanner.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CleanupScheduler } from './cleanup.scheduler';
import { PositionMonitorScheduler } from './position-monitor.scheduler';
import { PositionMonitorService } from './position-monitor.service';

@Module({
  imports: [BinanceModule, ExecutionModule, LogsModule, ScannerModule, TelegramModule],
  providers: [PositionMonitorService, PositionMonitorScheduler, CleanupScheduler],
})
export class PositionMonitorModule {}
