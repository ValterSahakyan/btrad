import { Module } from '@nestjs/common';
import { ExecutionModule } from '../execution/execution.module';
import { LogsModule } from '../logs/logs.module';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  imports: [ExecutionModule, LogsModule],
  controllers: [SignalsController],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
