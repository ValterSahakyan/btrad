import { Module } from '@nestjs/common';
import { ExecutionModule } from '../execution/execution.module';
import { LogsModule } from '../logs/logs.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  imports: [PaperTradingModule, ExecutionModule, LogsModule],
  controllers: [SignalsController],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
