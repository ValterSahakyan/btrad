import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { LogsModule } from '../logs/logs.module';
import { OrderExecutionService } from './order-execution.service';

@Module({
  imports: [BinanceModule, LogsModule],
  providers: [OrderExecutionService],
  exports: [OrderExecutionService],
})
export class ExecutionModule {}
