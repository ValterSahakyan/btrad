import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { MarketRegimeResult } from '../common/types/trading.types';
import { stdDev } from '../common/utils/math';
import { detectTrend } from '../indicators/trend';

@Injectable()
export class MarketRegimeService {
  constructor(private readonly binanceService: BinanceService) {}

  async getRegime(): Promise<MarketRegimeResult> {
    const [btc15m, btc1h, eth1h] = await Promise.all([
      this.binanceService.fetchKlines({ symbol: 'BTCUSDT', interval: '15m', limit: 120 }),
      this.binanceService.fetchKlines({ symbol: 'BTCUSDT', interval: '1h', limit: 120 }),
      this.binanceService.fetchKlines({ symbol: 'ETHUSDT', interval: '1h', limit: 120 }),
    ]);

    const btcTrend = detectTrend(btc1h);
    const ethTrend = detectTrend(eth1h);
    const btcVolatility = stdDev(btc15m.map((candle) => candle.close).slice(-30));
    const btcMove = ((btc15m.at(-1)?.close ?? 0) - (btc15m.at(-5)?.close ?? 0)) / (btc15m.at(-5)?.close ?? 1) * 100;
    const caution: string[] = [];

    let regime: MarketRegimeResult['regime'] = 'sideways';
    let score = 60;

    if (btcVolatility > 900 || Math.abs(btcMove) > 4) {
      regime = 'no_trade';
      score = 20;
      caution.push('BTC volatility is extreme');
    } else if (btcTrend === 'bullish' && ethTrend !== 'bearish') {
      regime = 'bullish';
      score = 80;
    } else if (btcTrend === 'bearish' && ethTrend !== 'bullish') {
      regime = 'bearish';
      score = 80;
    } else if (btcVolatility > 500) {
      regime = 'high_volatility';
      score = 40;
      caution.push('BTC volatility is elevated');
    }

    return {
      regime,
      score,
      btcTrend,
      ethTrend,
      volatility: Number(btcVolatility.toFixed(2)),
      caution,
    };
  }
}
