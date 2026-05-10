type StrategyName =
  | 'breakout_volume'
  | 'pullback_continuation'
  | 'mean_reversion'
  | 'trend_reclaim'
  | 'range_bounce';

type GuardSettings = {
  sessionModeEnabled?: boolean;
  tradingWindowStartHourUtc?: number;
  tradingWindowEndHourUtc?: number;
  maxLongOpenTrades?: number;
  maxShortOpenTrades?: number;
  breakoutMaxOpenTrades?: number;
  pullbackMaxOpenTrades?: number;
  reversionMaxOpenTrades?: number;
  trendReclaimMaxOpenTrades?: number;
  rangeBounceMaxOpenTrades?: number;
};

type OpenTradeSummary = {
  direction: 'LONG' | 'SHORT';
  strategy: string | null;
};

export function isTradingWindowOpen(settings: GuardSettings | null, now = new Date()): boolean {
  if (!settings?.sessionModeEnabled) return true;

  const start = clampHour(settings.tradingWindowStartHourUtc ?? 0);
  const end = clampHour(settings.tradingWindowEndHourUtc ?? 24);
  if (start === end) return true;

  const hour = now.getUTCHours();
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function evaluateTradingGuards(
  settings: GuardSettings | null,
  input: {
    direction: 'LONG' | 'SHORT';
    strategy: string;
    openTrades: OpenTradeSummary[];
    now?: Date;
  },
): string[] {
  const messages: string[] = [];

  if (!isTradingWindowOpen(settings, input.now)) {
    messages.push('Outside configured trading window');
  }

  const sameDirection = input.openTrades.filter((trade) => trade.direction === input.direction).length;
  const directionLimit = input.direction === 'LONG'
    ? settings?.maxLongOpenTrades ?? 0
    : settings?.maxShortOpenTrades ?? 0;
  if (directionLimit > 0 && sameDirection >= directionLimit) {
    messages.push(`${input.direction} direction limit reached`);
  }

  const sameStrategy = input.openTrades.filter((trade) => trade.strategy === input.strategy).length;
  const strategyLimit = getStrategyLimit(settings, input.strategy as StrategyName);
  if (strategyLimit > 0 && sameStrategy >= strategyLimit) {
    messages.push(`${input.strategy} strategy limit reached`);
  }

  return messages;
}

function getStrategyLimit(settings: GuardSettings | null, strategy: StrategyName): number {
  if (!settings) return 0;
  if (strategy === 'breakout_volume') return settings.breakoutMaxOpenTrades ?? 0;
  if (strategy === 'pullback_continuation') return settings.pullbackMaxOpenTrades ?? 0;
  if (strategy === 'mean_reversion') return settings.reversionMaxOpenTrades ?? 0;
  if (strategy === 'trend_reclaim') return settings.trendReclaimMaxOpenTrades ?? 0;
  if (strategy === 'range_bounce') return settings.rangeBounceMaxOpenTrades ?? 0;
  return 0;
}

function clampHour(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(24, Math.floor(value)));
}
