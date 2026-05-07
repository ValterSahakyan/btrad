import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { PositionSizeService } from './position-size.service';
import { RiskEngineService } from './risk-engine.service';

@Module({
  imports: [BinanceModule],
  providers: [PositionSizeService, RiskEngineService],
  exports: [PositionSizeService, RiskEngineService],
})
export class RiskModule {}
