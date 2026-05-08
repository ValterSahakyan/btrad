import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { LogsModule } from '../logs/logs.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CleanupScheduler } from './cleanup.scheduler';
import { PositionMonitorScheduler } from './position-monitor.scheduler';
import { PositionMonitorService } from './position-monitor.service';

@Module({
  imports: [BinanceModule, LogsModule, TelegramModule],
  providers: [PositionMonitorService, PositionMonitorScheduler, CleanupScheduler],
})
export class PositionMonitorModule {}
