type GuardSettings = Record<string, unknown>;

type OpenTradeSummary = {
  direction: 'LONG' | 'SHORT';
  strategy: string | null;
};

export function isTradingWindowOpen(_settings: GuardSettings | null, _now = new Date()): boolean {
  return true;
}

export function evaluateTradingGuards(
  _settings: GuardSettings | null,
  _input: {
    direction: 'LONG' | 'SHORT';
    strategy: string;
    openTrades: OpenTradeSummary[];
    now?: Date;
  },
): string[] {
  return [];
}
