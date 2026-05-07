export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const stdDev = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));

  return Math.sqrt(variance);
};

export const safeNumber = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;
