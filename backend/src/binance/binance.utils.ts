import { createHmac } from 'crypto';

export const signQuery = (queryString: string, secret: string): string =>
  createHmac('sha256', secret).update(queryString).digest('hex');

export const toFixedStep = (value: number, step: number, precision: number): number => {
  const stepped = Math.floor(value / step) * step;
  return Number(stepped.toFixed(precision));
};

export const getFilterValue = (
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; notional?: string }>,
  filterType: string,
  key: 'tickSize' | 'stepSize' | 'notional',
): number => {
  const filter = filters.find((entry) => entry.filterType === filterType);
  return Number(filter?.[key] ?? 0);
};
