export const ema = (values: number[], period: number): number[] => {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [values[0]];

  for (let i = 1; i < values.length; i += 1) {
    result.push((values[i] - result[i - 1]) * multiplier + result[i - 1]);
  }

  return result;
};
