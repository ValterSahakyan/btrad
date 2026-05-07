import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [LogsModule],
  providers: [BinanceService],
  exports: [BinanceService],
})
export class BinanceModule {}
