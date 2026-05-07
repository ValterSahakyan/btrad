export const rsi = (values: number[], period = 14): number[] => {
  if (values.length <= period) {
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

  return result;
};
