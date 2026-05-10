type WeekendAwareSettings = {
  maxOpenTrades?: number;
  minConfidenceScore?: number;
  minHotScoreForScan?: number;
  riskPerTradePercent?: number;
  maxPositionUsd?: number;
  weekendModeEnabled?: boolean;
  weekendMaxOpenTrades?: number;
  weekendMinConfidenceScore?: number;
  weekendMinHotScoreForScan?: number;
  weekendRiskPerTradePercent?: number;
  weekendMaxPositionUsd?: number;
};

export function isWeekendUtc(now = new Date()): boolean {
  const day = now.getUTCDay();
  return day === 0 || day === 6;
}

export function applyWeekendOverrides<T extends WeekendAwareSettings>(settings: T | null, now = new Date()): T | null {
  if (!settings || !settings.weekendModeEnabled || !isWeekendUtc(now)) return settings;

  return {
    ...settings,
    maxOpenTrades: settings.weekendMaxOpenTrades && settings.weekendMaxOpenTrades > 0
      ? settings.weekendMaxOpenTrades
      : settings.maxOpenTrades,
    minConfidenceScore: settings.weekendMinConfidenceScore && settings.weekendMinConfidenceScore > 0
      ? settings.weekendMinConfidenceScore
      : settings.minConfidenceScore,
    minHotScoreForScan: settings.weekendMinHotScoreForScan && settings.weekendMinHotScoreForScan > 0
      ? settings.weekendMinHotScoreForScan
      : settings.minHotScoreForScan,
    riskPerTradePercent: settings.weekendRiskPerTradePercent && settings.weekendRiskPerTradePercent > 0
      ? settings.weekendRiskPerTradePercent
      : settings.riskPerTradePercent,
    maxPositionUsd: settings.weekendMaxPositionUsd && settings.weekendMaxPositionUsd > 0
      ? settings.weekendMaxPositionUsd
      : settings.maxPositionUsd,
  };
}
