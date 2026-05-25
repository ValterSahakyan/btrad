import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['testnet', 'live'])
  mode?: 'testnet' | 'live';

  @IsOptional()
  @IsBoolean()
  realTradingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  enableRealTrading?: boolean;

  @IsOptional()
  @IsBoolean()
  requireDashboardConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAutoLiveExecution?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(125)
  defaultLeverage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(125)
  maxLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  riskPerTradePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  maxHoldingHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  maxConsecutiveLosses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minConfidenceScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  minRiskReward?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  scannerIntervalSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  signalExpirationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxSymbolsPerScan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minHotScoreForScan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minDailyVolumeUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10)
  maxSpreadPercent?: number;

  @IsOptional()
  @IsBoolean()
  sessionModeEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  tradingWindowStartHourUtc?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  tradingWindowEndHourUtc?: number;

  @IsOptional()
  @IsBoolean()
  fixedRoeEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  fixedRoeTpPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  fixedRoeSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  minPositionUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  maxPositionUsd?: number;

  @IsOptional()
  @IsBoolean()
  breakoutEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  breakoutMinVolumeRatio?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(200)
  breakoutLookbackPeriod?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  breakoutMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  breakoutTp1Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  breakoutTp2Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  breakoutMinHotScore?: number;

  @IsOptional()
  @IsBoolean()
  pullbackEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiLongMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiLongMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiShortMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiShortMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  pullbackAtrMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  pullbackMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackMinHotScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  pullbackTp1Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  pullbackTp2Multiplier?: number;

  @IsOptional()
  @IsBoolean()
  reversionEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reversionRsiOverbought?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reversionRsiOversold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(25)
  reversionVwapDeviationPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(5)
  reversionVolumeDeclineRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  reversionMaxSlPercent?: number;

  @IsOptional()
  @IsBoolean()
  trendReclaimEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(5)
  trendReclaimEmaBufferAtr?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(5)
  trendReclaimVolumeRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  trendReclaimMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  trendReclaimTp1Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  trendReclaimTp2Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  trendReclaimMinHotScore?: number;

  @IsOptional()
  @IsBoolean()
  rangeBounceEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(200)
  rangeBounceLookbackPeriod?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(5)
  rangeBounceProximityAtr?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rangeBounceRsiLongMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rangeBounceRsiShortMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  rangeBounceMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  rangeBounceTp1Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  rangeBounceTp2Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rangeBounceMinHotScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakoutMaxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pullbackMaxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reversionMaxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trendReclaimMaxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rangeBounceMaxOpenTrades?: number;
}
