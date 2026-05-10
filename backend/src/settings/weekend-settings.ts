type WeekendAwareSettings = Record<string, unknown>;

export function isWeekendUtc(_now = new Date()): boolean {
  return false;
}

export function applyWeekendOverrides<T extends WeekendAwareSettings>(settings: T | null): T | null {
  return settings;
}
