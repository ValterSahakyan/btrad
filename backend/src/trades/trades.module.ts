import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { LogsModule } from '../logs/logs.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [BinanceModule, LogsModule],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
