import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { MarketRegimeService } from './market-regime.service';

@Module({
  imports: [BinanceModule],
  providers: [MarketRegimeService],
  exports: [MarketRegimeService],
})
export class MarketRegimeModule {}
