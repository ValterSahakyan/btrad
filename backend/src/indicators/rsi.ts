/**
 * Detects RSI divergence between price and momentum.
 *
 * Bullish divergence: price makes a new low but RSI makes a higher low — selling
 * momentum is weakening, reversal up is likely.
 * Bearish divergence: price makes a new high but RSI makes a lower high — buying
 * momentum is fading, reversal down is likely.
 *
 * Source: Alexander Elder "Trading for a Living", John Murphy "Technical Analysis".
 */
export function detectRsiDivergence(
  prices: number[],
  rsiValues: number[],
  lookback = 20,
): { bullishDivergence: boolean; bearishDivergence: boolean } {
  const n = Math.min(prices.length, rsiValues.length, lookback);
  if (n < 10) return { bullishDivergence: false, bearishDivergence: false };

  const priceSlice = prices.slice(-n);
  const rsiSlice = rsiValues.slice(-n);

  const currentPrice = priceSlice[n - 1];
  const currentRsi = rsiSlice[n - 1];

  // Use the first 70% of the window as the reference period
  const refEnd = Math.max(5, Math.floor(n * 0.7));

  let minPriceIdx = 0;
  let maxPriceIdx = 0;
  for (let i = 1; i < refEnd; i++) {
    if (priceSlice[i] < priceSlice[minPriceIdx]) minPriceIdx = i;
    if (priceSlice[i] > priceSlice[maxPriceIdx]) maxPriceIdx = i;
  }

  const prevLowPrice = priceSlice[minPriceIdx];
  const prevLowRsi = rsiSlice[minPriceIdx];
  const prevHighPrice = priceSlice[maxPriceIdx];
  const prevHighRsi = rsiSlice[maxPriceIdx];

  // Bullish: price at/below previous low AND RSI is notably higher
  const bullishDivergence =
    currentPrice <= prevLowPrice * 1.003 && currentRsi > prevLowRsi + 4;

  // Bearish: price at/above previous high AND RSI is notably lower
  const bearishDivergence =
    currentPrice >= prevHighPrice * 0.997 && currentRsi < prevHighRsi - 4;

  return { bullishDivergence, bearishDivergence };
}

export const rsi = (values: number[], period = 14): number[] => {
  if (values.length <= period + 1) {
    return [];
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  const result: number[] = [];

  for (let i = period + 1; i < values.length; i += 1) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
    const delta = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(delta, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-delta, 0)) / period;
  }

  // Push the final RSI using the fully-updated averages (includes the last bar's delta).
  // Without this, rsi(closes).at(-1) reflects data through closes[n-2], not closes[n-1].
  const finalRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + finalRs));

  return result;
};
