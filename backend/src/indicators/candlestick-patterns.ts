import { Candle } from '../common/types/trading.types';

export interface CandlePatterns {
  bullishEngulfing: boolean;
  bearishEngulfing: boolean;
  hammer: boolean;
  shootingStar: boolean;
  pinBarBullish: boolean;
  pinBarBearish: boolean;
  doji: boolean;
  morningStar: boolean;
  eveningStar: boolean;
  bullishMarubozu: boolean;
  bearishMarubozu: boolean;
  /** Count of active bullish reversal/continuation patterns */
  bullishCount: number;
  /** Count of active bearish reversal/continuation patterns */
  bearishCount: number;
}

const EMPTY: CandlePatterns = {
  bullishEngulfing: false, bearishEngulfing: false,
  hammer: false, shootingStar: false,
  pinBarBullish: false, pinBarBearish: false,
  doji: false, morningStar: false, eveningStar: false,
  bullishMarubozu: false, bearishMarubozu: false,
  bullishCount: 0, bearishCount: 0,
};

const body = (c: Candle): number => Math.abs(c.close - c.open);
const range = (c: Candle): number => c.high - c.low;
const upperWick = (c: Candle): number => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle): number => Math.min(c.open, c.close) - c.low;
const isBull = (c: Candle): boolean => c.close > c.open;
const isBear = (c: Candle): boolean => c.close < c.open;

/**
 * Detects classical and SMC-aligned candlestick patterns on the last 3 candles.
 *
 * Sources: Steve Nison "Japanese Candlestick Charting Techniques",
 * Al Brooks "Trading Price Action", ICT/SMC pin-bar concepts.
 */
export function detectCandlePatterns(candles: Candle[]): CandlePatterns {
  if (candles.length < 3) return EMPTY;

  const c = candles[candles.length - 1];
  const p = candles[candles.length - 2];
  const pp = candles[candles.length - 3];

  const cBody = body(c);
  const cRange = range(c);
  const cUpper = upperWick(c);
  const cLower = lowerWick(c);

  // — Two-bar patterns —

  // Bullish Engulfing: bear close then bull bar fully swallowing prior body
  const bullishEngulfing =
    isBear(p) && isBull(c) &&
    c.open <= p.close && c.close >= p.open &&
    cBody >= body(p);

  // Bearish Engulfing: bull close then bear bar fully swallowing prior body
  const bearishEngulfing =
    isBull(p) && isBear(c) &&
    c.open >= p.close && c.close <= p.open &&
    cBody >= body(p);

  // — Single-bar patterns —

  // Hammer: tiny body near top, long lower wick ≥ 2× body (Steve Nison)
  const hammer =
    cRange > 0 &&
    cLower >= cBody * 2 &&
    cUpper <= cBody * 0.6 &&
    cLower / cRange >= 0.55;

  // Shooting Star: tiny body near bottom, long upper wick ≥ 2× body
  const shootingStar =
    cRange > 0 &&
    cUpper >= cBody * 2 &&
    cLower <= cBody * 0.6 &&
    cUpper / cRange >= 0.55;

  // Pin Bar (Al Brooks / ICT): wick dominant — ≥ 65% of full range
  const pinBarBullish = cRange > 0 && cLower / cRange >= 0.65;
  const pinBarBearish = cRange > 0 && cUpper / cRange >= 0.65;

  // Doji: indecision — body < 8% of range
  const doji = cRange > 0 && cBody / cRange < 0.08;

  // — Three-bar reversal patterns —

  // Morning Star (bullish): bear + small indecision + bull reclaiming bear midpoint
  const morningStar =
    isBear(pp) &&
    body(p) <= body(pp) * 0.35 &&
    isBull(c) &&
    c.close > (pp.open + pp.close) / 2;

  // Evening Star (bearish): bull + small indecision + bear closing below bull midpoint
  const eveningStar =
    isBull(pp) &&
    body(p) <= body(pp) * 0.35 &&
    isBear(c) &&
    c.close < (pp.open + pp.close) / 2;

  // — Momentum bars (Al Brooks "strong trend bars") —

  // Bullish Marubozu: almost no wicks, close near high — shows strong conviction
  const bullishMarubozu = isBull(c) && cRange > 0 && cBody / cRange >= 0.80;

  // Bearish Marubozu: almost no wicks, close near low
  const bearishMarubozu = isBear(c) && cRange > 0 && cBody / cRange >= 0.80;

  const bullishCount = [bullishEngulfing, hammer, pinBarBullish, morningStar, bullishMarubozu]
    .filter(Boolean).length;
  const bearishCount = [bearishEngulfing, shootingStar, pinBarBearish, eveningStar, bearishMarubozu]
    .filter(Boolean).length;

  return {
    bullishEngulfing, bearishEngulfing,
    hammer, shootingStar,
    pinBarBullish, pinBarBearish,
    doji, morningStar, eveningStar,
    bullishMarubozu, bearishMarubozu,
    bullishCount, bearishCount,
  };
}
