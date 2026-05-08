import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { LogsModule } from '../logs/logs.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [BinanceModule, LogsModule, PaperTradingModule],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
