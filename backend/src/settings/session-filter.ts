/**
 * Trading session / kill zone filter.
 *
 * Crypto markets are 24/7 but liquidity and directional momentum cluster around
 * traditional market open hours.  During the Asian session prices often range
 * with no strong trend, while London and New York opens produce the cleanest
 * breakouts and momentum setups.
 *
 * Source: ICT "Kill Zones" concept — highest-probability entry windows.
 */

export type TradingSession = 'london' | 'new_york' | 'asia' | 'other';

/**
 * Returns the active kill zone for a given UTC time.
 *
 * London Open KZ:  07:00–10:00 UTC
 * New York Open KZ: 12:00–15:00 UTC
 * Asian session:   00:00–07:00 UTC (lower directional bias in crypto)
 */
export function getTradingSession(now: Date = new Date()): TradingSession {
  const h = now.getUTCHours();
  if (h >= 7 && h < 10) return 'london';
  if (h >= 12 && h < 15) return 'new_york';
  if (h < 7) return 'asia';
  return 'other';
}

/** True during the two highest-liquidity windows (London + NY opens). */
export function isHighLiquidityWindow(now: Date = new Date()): boolean {
  const s = getTradingSession(now);
  return s === 'london' || s === 'new_york';
}

/**
 * Returns a session bonus/penalty to apply to strategy scores.
 *  +4  during London / NY kill zones (best momentum windows)
 *   0  during other hours
 *  -5  during Asian session (rangy, fakeout-prone)
 */
export function sessionScoreAdjustment(now: Date = new Date()): number {
  const s = getTradingSession(now);
  if (s === 'london' || s === 'new_york') return 4;
  if (s === 'asia') return -5;
  return 0;
}
